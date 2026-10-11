import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResumeData, ResumeMeta } from '@/types/resume';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import ResumeVersionManager from '@/components/workbench/ResumeVersionManager.vue';

const { readResume, createResumeFromData } = vi.hoisted(() => ({
  readResume: vi.fn(),
  createResumeFromData: vi.fn(),
}));

vi.mock('@/services/storage/StorageManager', () => ({
  storageManager: { read: readResume },
}));

vi.mock('@/stores/workbench', () => ({
  useWorkbenchStore: () => ({ createJobVersion: vi.fn(), createResumeFromData }),
}));

const resumes: ResumeMeta[] = [
  { id: 'base', title: '基础简历', templateId: 'modern', createdAt: 1, updatedAt: 1 },
  { id: 'target', title: 'AI Agent 技术简历', templateId: 'modern', createdAt: 1, updatedAt: 2 },
];

const before = parseResumeMarkdown('# Alex').resume;
before.id = 'base';
before.experiences = [{ id: 'exp', company: 'Acme', position: '工程师', startDate: '2024-01', endDate: 'present', description: '<p>开发内部平台</p>' }];
const after = JSON.parse(JSON.stringify(before)) as ResumeData;
after.id = 'target';
after.basic.title = 'AI Agent 工程师';
after.experiences[0]!.description = '<p>开发&nbsp;AI 平台</p>';
after.projects = [{ id: 'project', name: '智能助手', role: '开发者', startDate: '', endDate: '', description: '交付助手' }];
after.jobTarget = { versionName: 'AI Agent 技术简历', company: 'Acme', position: 'Agent 工程师', sourceResumeId: 'base' };

const passthrough = { template: '<div><slot /></div>' };
const stubs = {
  ElDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' },
  ElTabs: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div><slot /><button type="button" class="open-history" @click="$emit(\'update:modelValue\', \'history\')">打开历史</button></div>',
  },
  ElTabPane: { props: ['label', 'name'], template: '<section><slot /></section>' },
  ElForm: passthrough,
  ElFormItem: { props: ['label'], template: '<label><span>{{ label }}</span><slot /></label>' },
  ElSelect: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
  },
  ElOption: { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
  ElInput: { template: '<input />' },
  ElButton: { props: ['disabled'], emits: ['click'], template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
  ElAlert: { props: ['title'], template: '<p class="alert">{{ title }}</p>' },
  ElEmpty: { props: ['description'], template: '<p class="empty">{{ description }}</p>' },
};

function mountManager() {
  return mount(ResumeVersionManager, {
    props: { modelValue: true, resumes },
    global: { stubs },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  createResumeFromData.mockResolvedValue('merged-resume');
});

describe('ResumeVersionManager comparison', () => {
  it('shows semantic sections, readable values and change status', async () => {
    readResume.mockImplementation(async (id: string) => id === 'base' ? before : after);
    const wrapper = mountManager();
    await wrapper.findAll('button').find((button) => button.text() === '查看差异')!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('工作经历');
    expect(wrapper.text()).toContain('Acme · 工程师');
    expect(wrapper.text()).toContain('修改');
    expect(wrapper.text()).toContain('开发内部平台');
    expect(wrapper.text()).toContain('开发 AI 平台');
    expect(wrapper.text()).toContain('项目经验');
    expect(wrapper.text()).not.toContain('<p>');
    expect(wrapper.text()).toContain('基础简历');
    expect(wrapper.text()).toContain('AI Agent 技术简历');
    expect(wrapper.text()).toContain('另存为新简历');
  });

  it('filters rendered changes by keyword and change type and resets filters on version change', async () => {
    readResume.mockImplementation(async (id: string) => id === 'base' ? before : after);
    const wrapper = mountManager();
    await wrapper.findAll('button').find((button) => button.text() === '查看差异')!.trigger('click');
    await flushPromises();

    await wrapper.get('input[aria-label="搜索差异"]').setValue('智能助手');
    expect(wrapper.text()).toContain('智能助手');
    expect(wrapper.text()).not.toContain('开发内部平台');

    await wrapper.get('input[aria-label="搜索差异"]').setValue('');
    await wrapper.get('select[aria-label="按变化类型筛选"]').setValue('added');
    expect(wrapper.text()).toContain('智能助手');
    expect(wrapper.text()).not.toContain('开发内部平台');

    await wrapper.findAll('select')[1]!.setValue('target');
    await wrapper.findAll('select')[2]!.setValue('base');
    await wrapper.findAll('button').find((button) => button.text() === '查看差异')!.trigger('click');
    await flushPromises();
    expect(wrapper.get('input[aria-label="搜索差异"]').element).toHaveProperty('value', '');
    expect(wrapper.get('select[aria-label="按变化类型筛选"]').element).toHaveProperty('value', 'all');
  });

  it('saves selected B changes as a new copy and leaves both compared resumes untouched', async () => {
    readResume.mockImplementation(async (id: string) => id === 'base' ? before : after);
    const wrapper = mountManager();
    await wrapper.findAll('button').find((button) => button.text() === '查看差异')!.trigger('click');
    await flushPromises();

    await wrapper.get('input[aria-label="采纳版本 B：基本信息 求职意向"]').setValue(false);
    await wrapper.get('input[aria-label="新简历名称"]').setValue('Acme Agent 合并版');
    await wrapper.findAll('button').find((button) => button.text() === '另存为新简历')!.trigger('click');
    await flushPromises();

    expect(createResumeFromData).toHaveBeenCalledOnce();
    const [saved, title] = createResumeFromData.mock.calls[0] as [ResumeData, string, string];
    expect(title).toBe('Acme Agent 合并版');
    expect(saved.title).toBe(title);
    expect(saved.basic.title).toBe(before.basic.title);
    expect(saved.experiences[0]?.description).toBe('<p>开发&nbsp;AI 平台</p>');
    expect(saved.projects.map((project) => project.name)).toEqual(['智能助手']);
    expect(saved.jobTarget).toMatchObject({ sourceResumeId: 'base', versionName: title, company: 'Acme' });
    expect(before.experiences[0]?.description).toBe('<p>开发内部平台</p>');
    expect(after.experiences[0]?.description).toBe('<p>开发&nbsp;AI 平台</p>');
    expect(wrapper.emitted('created')).toEqual([['merged-resume']]);
  });

  it('lists job-version provenance and compares a saved version with its source', async () => {
    readResume.mockImplementation(async (id: string) => id === 'base' ? before : after);
    const wrapper = mountManager();
    await wrapper.find('.open-history').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('AI Agent 技术简历');
    expect(wrapper.text()).toContain('来源：基础简历');
    expect(wrapper.text()).toContain('Acme · Agent 工程师');

    await wrapper.findAll('button').find((button) => button.text() === '比较源版本')!.trigger('click');
    await flushPromises();
    expect(readResume).toHaveBeenCalledWith('base');
    expect(readResume).toHaveBeenCalledWith('target');
    expect(wrapper.text()).toContain('工作经历');
  });
});
