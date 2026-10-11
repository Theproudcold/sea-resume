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
