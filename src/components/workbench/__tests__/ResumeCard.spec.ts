import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResumeData, ResumeMeta } from '@/types/resume';
import { templateDemoData } from '@/data/template-demo';
import ResumeCard from '@/components/workbench/ResumeCard.vue';

const { readResume } = vi.hoisted(() => ({ readResume: vi.fn() }));

vi.mock('@/services/storage/StorageManager', () => ({
  storageManager: { read: readResume },
}));

const ResumeCoverStub = defineComponent({
  props: { data: { type: Object, required: true } },
  template: '<div class="cover-preview">{{ data.basic.name }}</div>',
});

const resumeMeta: ResumeMeta = {
  id: 'resume-1',
  title: '我的简历',
  templateId: 'modern',
  createdAt: 1,
  updatedAt: 1,
};

const resumeContent = (name: string): ResumeData => ({
  ...templateDemoData,
  id: resumeMeta.id,
  basic: { ...templateDemoData.basic, name },
});

function mountCard(resume = resumeMeta) {
  return mount(ResumeCard, {
    props: { resume },
    global: {
      stubs: {
        ElCard: { template: '<article><slot /></article>' },
        ElDropdown: true,
        ElDropdownMenu: true,
        ElDropdownItem: true,
        ElButton: true,
        ElIcon: true,
        ResumeCoverPreview: ResumeCoverStub,
      },
    },
  });
}

describe('ResumeCard cover preview', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads and displays content from the stored resume', async () => {
    const storedResume = resumeContent('真实简历姓名');
    readResume.mockResolvedValue(storedResume);

    const wrapper = mountCard();
    await flushPromises();

    expect(readResume).toHaveBeenCalledWith(resumeMeta.id);
    expect(wrapper.find('.cover-preview').text()).toBe('真实简历姓名');
    expect(wrapper.findComponent(ResumeCoverStub).props('data')).toMatchObject({ basic: { name: '真实简历姓名' } });
  });

  it('shows the AI template name instead of an unknown-template warning', async () => {
    readResume.mockResolvedValue(resumeContent('测试姓名'));
    const wrapper = mountCard({ ...resumeMeta, templateId: 'ai-agent' });
    expect(wrapper.get('.template').text()).toBe('AI Agent 技术');
    wrapper.unmount();
  });

  it('reloads the cover after the resume metadata is updated', async () => {
    readResume
      .mockResolvedValueOnce(resumeContent('修改前姓名'))
      .mockResolvedValueOnce(resumeContent('修改后姓名'));

    const wrapper = mountCard();
    await flushPromises();
    await wrapper.setProps({ resume: { ...resumeMeta, updatedAt: 2 } });
    await flushPromises();

    expect(readResume).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.cover-preview').text()).toBe('修改后姓名');
  });
});

describe('ResumeCard 操作菜单', () => {
  it('每一项都带图标，标签保持在同一列', async () => {
    readResume.mockResolvedValue(resumeContent('真实简历姓名'));

    const wrapper = mount(ResumeCard, {
      props: { resume: resumeMeta },
      global: {
        stubs: {
          ElDropdown: defineComponent({ template: '<div><slot name="dropdown" /></div>' }),
          ElDropdownMenu: defineComponent({ template: '<ul><slot /></ul>' }),
          ElDropdownItem: defineComponent({ template: '<li class="menu-item"><slot /></li>' }),
          ElIcon: defineComponent({ template: '<i class="menu-icon"><slot /></i>' }),
          ElButton: true,
          ResumeCoverPreview: ResumeCoverStub,
        },
      },
    });
    await flushPromises();

    const items = wrapper.findAll('li.menu-item');
    expect(items.map((item) => item.text())).toEqual(['模拟面试', '重命名', '复制', '存为新版本', '删除']);
    for (const item of items) {
      expect(item.find('.menu-icon').exists()).toBe(true);
    }
  });
});

describe('ResumeCard 版本角标与主干版本', () => {
  function mountWithMenu(resume: ResumeMeta) {
    return mount(ResumeCard, {
      props: { resume },
      global: {
        stubs: {
          ElDropdown: defineComponent({ template: '<div><slot name="dropdown" /></div>' }),
          ElDropdownMenu: defineComponent({ template: '<ul><slot /></ul>' }),
          ElDropdownItem: defineComponent({ template: '<li class="menu-item"><slot /></li>' }),
          ElIcon: defineComponent({ template: '<i class="menu-icon"><slot /></i>' }),
          ElButton: true,
          ResumeCoverPreview: ResumeCoverStub,
        },
      },
    });
  }

  it('hides the version tag for a first-version resume', async () => {
    readResume.mockResolvedValue(resumeContent('姓名'));
    const wrapper = mountWithMenu({ ...resumeMeta, versionNumber: 1 });
    await flushPromises();
    expect(wrapper.find('[data-testid=resume-version-tag]').exists()).toBe(false);
  });

  it('shows a master version tag once the track moves past v1', async () => {
    readResume.mockResolvedValue(resumeContent('姓名'));
    const wrapper = mountWithMenu({ ...resumeMeta, trackId: 'resume-1', versionNumber: 3 });
    await flushPromises();
    expect(wrapper.get('[data-testid=resume-version-tag]').text()).toContain('主干 v3');
  });

  it('does not offer a new master version for a job branch', async () => {
    readResume.mockResolvedValue(resumeContent('姓名'));
    const branch: ResumeMeta = {
      ...resumeMeta,
      versionNumber: 2,
      jobTarget: { versionName: 'Acme', company: 'Acme', position: '前端', sourceResumeId: 'main' },
    };
    const wrapper = mountWithMenu(branch);
    await flushPromises();
    expect(wrapper.findAll('li.menu-item').map((item) => item.text())).not.toContain('存为新版本');
    // 分支版本号在分支内独立计数：v2 显示为「v2」，不带「主干」字样。
    expect(wrapper.get('[data-testid=resume-version-tag]').text()).toBe('v2');
  });
});
