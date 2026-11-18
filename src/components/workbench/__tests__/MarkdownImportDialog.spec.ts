import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import MarkdownImportDialog from '@/components/workbench/MarkdownImportDialog.vue';

const stubs = {
  ElDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' },
  ElButton: { props: ['disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>' },
  ElInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  ElForm: { template: '<form><slot /></form>' },
  ElFormItem: { props: ['label', 'error'], template: '<label>{{ label }}<slot /><span>{{ error }}</span></label>' },
  ElSelect: { template: '<select><slot /></select>' },
  ElOption: { props: ['label'], template: '<option>{{ label }}</option>' },
  ElAlert: { props: ['title'], template: '<div>{{ title }}<slot /></div>' },
  ElIcon: true,
  ElTag: { template: '<span><slot /></span>' },
};
const createWrapper = () => mount(MarkdownImportDialog, { props: { modelValue: true }, global: { stubs } });

async function chooseFile(wrapper: ReturnType<typeof createWrapper>, file: { name: string; size: number; text: () => Promise<string> }) {
  const input = wrapper.get('input[type="file"]');
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] });
  await input.trigger('change');
  await flushPromises();
}
const validFile = () => ({ name: 'resume.md', size: 20, text: async () => '# 张三\n\n前端工程师' });

describe('MarkdownImportDialog', () => {
  it('keeps the picker available on invalid input and creates a new resume after retry', async () => {
    const wrapper = createWrapper();
    await chooseFile(wrapper, { ...validFile(), name: 'resume.pdf' });
    expect(wrapper.text()).toContain('请选择 .md 或 .markdown 文件');
    expect(wrapper.find('input[type="file"]').exists()).toBe(true);
    await chooseFile(wrapper, validFile());
    expect(wrapper.text()).not.toContain('请选择 .md 或 .markdown 文件');
    await wrapper.findAll('button').find(button => button.text() === '创建简历')!.trigger('click');
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({ resume: { basic: { name: '张三' } } });
  });

  it('explains why an empty name cannot be submitted', async () => {
    const wrapper = createWrapper();
    await chooseFile(wrapper, validFile());
    await wrapper.get('form input').setValue('   ');
    expect(wrapper.text()).toContain('请填写简历名称');
    expect(wrapper.findAll('button').find(button => button.text() === '创建简历')!.attributes('disabled')).toBeDefined();
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('does not apply a file read that finishes after closing', async () => {
    let resolve!: (value: string) => void;
    const wrapper = createWrapper();
    await chooseFile(wrapper, { ...validFile(), text: () => new Promise(done => { resolve = done; }) });
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    resolve('# Stale resume');
    await flushPromises();
    expect(wrapper.find('.import-dropzone').exists()).toBe(true);
    expect(wrapper.find('.import-summary').exists()).toBe(false);
  });

  it('allows the same file to be selected again after a read error', async () => {
    const wrapper = createWrapper();
    const read = vi.fn().mockRejectedValueOnce(new Error('读取中断')).mockResolvedValueOnce('# 张三');
    const file = { ...validFile(), text: read };
    const input = wrapper.get('input[type="file"]');
    let pickerValue = 'C:\\fakepath\\resume.md';
    Object.defineProperty(input.element, 'value', { configurable: true, get: () => pickerValue, set: (value: string) => { pickerValue = value; } });
    await chooseFile(wrapper, file);
    expect(pickerValue).toBe('');
    expect(wrapper.text()).toContain('读取中断');
    await chooseFile(wrapper, file);
    expect(read).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.import-summary').exists()).toBe(true);
  });
});
