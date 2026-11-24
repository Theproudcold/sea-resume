import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { ResumeMeta } from '@/types/resume';
import SettingsCenter from '@/components/workbench/SettingsCenter.vue';

const DialogStub = defineComponent({
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  setup(props, { slots }) { return () => props.modelValue ? h('div', [slots.default?.(), slots.footer?.()]) : null; },
});
const ButtonStub = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () => h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.());
  },
});
const AlertStub = defineComponent({
  setup(_, { slots }) { return () => h('div', [slots.title?.(), slots.default?.()]); },
});
const SelectStub = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue'],
  setup(_, { slots }) { return () => h('div', slots.default?.()); },
});

const stubs = {
  'el-dialog': DialogStub,
  'el-button': ButtonStub,
  'el-alert': AlertStub,
  'el-select': SelectStub,
  'el-option': { template: '<div />' },
  'el-icon': { template: '<i><slot /></i>' },
};

const resumes: ResumeMeta[] = [
  { id: 'a', title: '简历 A', templateId: 'modern', createdAt: 1, updatedAt: 2 },
  { id: 'b', title: '简历 B', templateId: 'tech', createdAt: 1, updatedAt: 1 },
];

const mountCenter = (props: Record<string, unknown> = {}) =>
  mount(SettingsCenter, {
    props: { modelValue: true, resumes, ...props },
    global: { stubs },
  });

/** The nav rail is a set of plain buttons; find the one whose title matches. */
const navButton = (wrapper: ReturnType<typeof mountCenter>, title: string) =>
  wrapper.findAll('.settings-nav-item').find((button) => button.text().includes(title))!;

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('SettingsCenter', () => {
  it('opens on the section the caller asks for', async () => {
    const wrapper = mountCenter({ initialSection: 'backup' });
    await flushPromises();
    expect(navButton(wrapper, '备份与恢复').classes()).toContain('is-active');
  });

  it('switches sections from the nav rail', async () => {
    const wrapper = mountCenter();
    await flushPromises();
    await navButton(wrapper, '关于').trigger('click');
    expect(navButton(wrapper, '关于').classes()).toContain('is-active');
    expect(wrapper.text()).toContain('关于 Sea Resume');
  });

  it('resets to the requested section each time it reopens', async () => {
    const wrapper = mountCenter({ initialSection: 'storage' });
    await flushPromises();
    await navButton(wrapper, '关于').trigger('click');
    expect(navButton(wrapper, '关于').classes()).toContain('is-active');

    // 关闭再打开：应当回到调用方指定的分区，而不是停留在上次浏览的位置。
    await wrapper.setProps({ modelValue: false });
    await wrapper.setProps({ modelValue: true });
    expect(navButton(wrapper, '存储位置').classes()).toContain('is-active');
  });

  it('preselects the first resume for backup and emits its id', async () => {
    const wrapper = mountCenter({ initialSection: 'backup' });
    await flushPromises();
    const exportButton = wrapper.findAll('button').find((button) => button.text().includes('导出 JSON 备份'))!;
    expect(exportButton.attributes('disabled')).toBeUndefined();
    await exportButton.trigger('click');
    expect(wrapper.emitted('export-backup')?.[0]).toEqual(['a']);
  });

  it('re-selects a resume when the previous one disappears', async () => {
    const wrapper = mountCenter({ initialSection: 'backup' });
    await flushPromises();
    await wrapper.setProps({ resumes: [{ ...resumes[1]! }] });
    const exportButton = wrapper.findAll('button').find((button) => button.text().includes('导出 JSON 备份'))!;
    await exportButton.trigger('click');
    expect(wrapper.emitted('export-backup')?.[0]).toEqual(['b']);
  });

  it('forwards storage and danger-zone actions instead of acting on its own', async () => {
    const wrapper = mountCenter({ initialSection: 'storage' });
    await flushPromises();
    const reauthorize = wrapper.findAll('button').find((button) => button.text().includes('重新授权本地目录'));
    // 未保存过本地目录配置时，重新授权入口不出现。
    expect(reauthorize).toBeUndefined();

    await wrapper.setProps({ initialSection: 'backup' });
    await navButton(wrapper, '备份与恢复').trigger('click');
    const reset = wrapper.findAll('button').find((button) => button.text().includes('清空全部简历'))!;
    await reset.trigger('click');
    expect(wrapper.emitted('reset-all')).toHaveLength(1);
  });
  it('explains the backup empty state while keeping import available', async () => {
    const wrapper = mountCenter({ initialSection: 'backup', resumes: [] });
    await flushPromises();
    expect(wrapper.text()).toContain('还没有简历可导出');
    const buttons = wrapper.findAll('button');
    expect(buttons.find(button => button.text().includes('导出 JSON 备份'))!.attributes('disabled')).toBeDefined();
    expect(buttons.find(button => button.text().includes('清空全部简历'))!.attributes('disabled')).toBeDefined();
    await buttons.find(button => button.text() === '导入备份')!.trigger('click');
    expect(wrapper.emitted('import-backup')).toHaveLength(1);
    expect(navButton(wrapper, '备份与恢复').attributes('aria-current')).toBe('page');
  });

  it('shows the version injected at build time instead of a hardcoded number', async () => {
    vi.stubGlobal('__APP_VERSION__', '9.9.9');
    try {
      const wrapper = mountCenter({ initialSection: 'about' });
      await flushPromises();
      const version = wrapper.find('.about-card');
      expect(version.text()).toContain('版本 9.9.9');
    } finally {
      vi.unstubAllGlobals();
    }
  });

});
