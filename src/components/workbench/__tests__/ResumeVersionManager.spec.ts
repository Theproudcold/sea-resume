import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
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

  it('lists job versions from the index without reading their bodies', async () => {
    const indexed = resumes.map((resume) => (resume.id === 'target'
      ? { ...resume, jobTarget: { versionName: 'AI Agent 技术简历', company: 'Acme', position: 'Agent 工程师', sourceResumeId: 'base' } }
      : resume));
    const wrapper = mount(ResumeVersionManager, {
      props: { modelValue: true, resumes: indexed },
      global: { stubs },
    });
    await wrapper.find('.open-history').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('AI Agent 技术简历');
    expect(wrapper.text()).toContain('来源：基础简历');
    // 索引里已有岗位版本的简历不再读正文；没有索引的旧简历仍会回落读一次。
    expect(readResume).not.toHaveBeenCalledWith('target');
    expect(readResume).toHaveBeenCalledWith('base');
  });

  it('marks a job version that fell behind its master track', async () => {
    const indexed: ResumeMeta[] = [
      { id: 'base', title: '基础简历', templateId: 'modern', createdAt: 1, updatedAt: 1, trackId: 'track-a', versionNumber: 3 },
      {
        id: 'branch',
        title: 'Acme 前端',
        templateId: 'modern',
        createdAt: 1,
        updatedAt: 2,
        trackId: 'track-a',
        versionNumber: 1,
        jobTarget: { versionName: 'Acme 前端', company: 'Acme', position: '前端', sourceResumeId: 'base', baseId: 'base', baseVersion: 1 },
      },
    ];
    const wrapper = mount(ResumeVersionManager, { props: { modelValue: true, resumes: indexed }, global: { stubs } });
    await wrapper.find('.open-history').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid=version-behind]').text()).toContain('主干已有新版');
    // 这是提示而不是动作：D 功能才提供同步。
    expect(wrapper.find('[data-testid=version-behind] input, [data-testid=version-behind] button').exists()).toBe(false);
  });

  it('does not mark a branch that already matches the latest master version', async () => {
    const indexed: ResumeMeta[] = [
      { id: 'base', title: '基础简历', templateId: 'modern', createdAt: 1, updatedAt: 1, trackId: 'track-a', versionNumber: 3 },
      {
        id: 'branch',
        title: 'Acme 前端',
        templateId: 'modern',
        createdAt: 1,
        updatedAt: 2,
        trackId: 'track-a',
        versionNumber: 1,
        jobTarget: { versionName: 'Acme 前端', company: 'Acme', position: '前端', sourceResumeId: 'base', baseId: 'base', baseVersion: 3 },
      },
    ];
    const wrapper = mount(ResumeVersionManager, { props: { modelValue: true, resumes: indexed }, global: { stubs } });
    await wrapper.find('.open-history').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid=version-behind]').exists()).toBe(false);
  });

  function selectionCount(wrapper: ReturnType<typeof mountManager>) {
    const match = wrapper.text().match(/已选 (\d+) \/ (\d+) 项/);
    return match ? { selected: Number(match[1]), total: Number(match[2]) } : null;
  }

  async function openComparison(wrapper: ReturnType<typeof mountManager>) {
    await wrapper.findAll('button').find((button) => button.text() === '查看差异')!.trigger('click');
    await flushPromises();
  }

  it('scopes the select-all toggle to the filtered differences', async () => {
    readResume.mockImplementation(async (id: string) => id === 'base' ? before : after);
    const wrapper = mountManager();
    await openComparison(wrapper);

    const initial = selectionCount(wrapper);
    expect(initial).not.toBeNull();
    expect(initial!.selected).toBe(initial!.total);

    await wrapper.get('select[aria-label="按变化类型筛选"]').setValue('added');
    expect(wrapper.text()).toContain('当前显示 2 项');

    const selectAll = wrapper.get('input[aria-label="全选当前筛选的差异"]').element as HTMLInputElement;
    expect(selectAll.indeterminate).toBe(false);

    await wrapper.get('input[aria-label="全选当前筛选的差异"]').setValue(false);
    // 只取消当前筛选出来的两条，未显示的修改保持勾选。
    expect(selectionCount(wrapper)!.selected).toBe(initial!.total - 2);
    expect(selectAll.indeterminate).toBe(false);

    // 只勾回其中一条，全选进入半选状态。
    await wrapper.get('input[aria-label="采纳版本 B：智能助手 · 开发者 整项"]').setValue(true);
    expect(selectionCount(wrapper)!.selected).toBe(initial!.total - 1);
    expect(selectAll.indeterminate).toBe(true);
  });

  it('adopts one section without touching the other sections', async () => {
    readResume.mockImplementation(async (id: string) => id === 'base' ? before : after);
    const wrapper = mountManager();
    await openComparison(wrapper);

    const initial = selectionCount(wrapper);
    const row = wrapper.get('input[aria-label="采纳版本 B：Acme · 工程师 工作内容"]');
    expect((row.element as HTMLInputElement).checked).toBe(true);

    await wrapper.get('input[aria-label="采纳本节版本 B：工作经历"]').setValue(false);
    expect((row.element as HTMLInputElement).checked).toBe(false);
    expect(selectionCount(wrapper)!.selected).toBe(initial!.total - 1);
  });

  it('shows format-only changes with a dedicated badge and filter', async () => {
    const styled = JSON.parse(JSON.stringify(before)) as ResumeData;
    styled.id = 'target';
    styled.experiences[0]!.description = '<p>开发<strong>内部平台</strong></p>';
    readResume.mockImplementation(async (id: string) => id === 'base' ? before : styled);
    const wrapper = mountManager();
    await openComparison(wrapper);

    expect(wrapper.text()).toContain('格式');
    await wrapper.get('select[aria-label="按变化类型筛选"]').setValue('formatted');
    expect(wrapper.text()).toContain('工作经历');
    expect(wrapper.text()).toContain('仅看格式');
  });

  it('discards a comparison that finishes after the version selection changed', async () => {
    let resolveBase: ((value: ResumeData) => void) | undefined;
    readResume.mockImplementation((id: string) => {
      if (id !== 'base') return Promise.resolve(after);
      return new Promise<ResumeData>((resolve) => { resolveBase = resolve; });
    });
    const wrapper = mountManager();
    await wrapper.findAll('button').find((button) => button.text() === '查看差异')!.trigger('click');
    await nextTick();

    expect(wrapper.findAll('button').find((button) => button.text() === '查看差异')!.attributes('disabled')).toBeDefined();

    await wrapper.findAll('select')[1]!.setValue('target');
    await wrapper.findAll('select')[2]!.setValue('base');
    resolveBase?.(before);
    await flushPromises();

    expect(wrapper.text()).not.toContain('另存为新简历');
    expect(wrapper.text()).toContain('选择两份简历，查看内容有什么不同');
    expect(wrapper.findAll('button').find((button) => button.text() === '查看差异')!.attributes('disabled')).toBeUndefined();
  });
  it('starts on creation when only one resume exists instead of an unusable comparison', () => {
    const wrapper = mount(ResumeVersionManager, { props: { modelValue: true, resumes: [resumes[0]!] }, global: { stubs } });
    expect(wrapper.findComponent(stubs.ElTabs).props('modelValue')).toBe('create');
  });

});
