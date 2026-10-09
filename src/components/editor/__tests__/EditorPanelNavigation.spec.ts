import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { shallowMount } from '@vue/test-utils';
import EditorPanel from '@/components/editor/EditorPanel.vue';
import { useResumeStore } from '@/stores/resume';
import { storageManager } from '@/services/storage/StorageManager';

describe('EditorPanel quality navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setActivePinia(createPinia());
    vi.spyOn(storageManager, 'save').mockResolvedValue();
  });
  afterEach(() => vi.restoreAllMocks());

  it('restores a standard section removed from the editor order before navigating to it', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const resume = useResumeStore();
    resume.data.sectionOrder = ['experience', 'education', 'skills'];
    const wrapper = shallowMount(EditorPanel, {
      global: {
        plugins: [pinia],
        stubs: ['el-icon', 'el-collapse', 'el-collapse-item', 'el-divider', 'el-dropdown', 'el-dropdown-menu', 'el-dropdown-item', 'el-button', 'el-tag', 'el-scrollbar'],
      },
    });

    resume.setActiveSection('projects');
    await nextTick();
    await nextTick();

    expect(resume.data.sectionOrder).toContain('projects');
    expect(resume.activeSection).toBe('projects');
    wrapper.unmount();
  });
});
