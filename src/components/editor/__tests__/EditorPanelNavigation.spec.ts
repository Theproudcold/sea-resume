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

  const editorPanelStubs = (scrollTo: () => void) => ({
    'el-icon': true,
    'el-collapse': true,
    'el-collapse-item': true,
    'el-divider': true,
    'el-dropdown': true,
    'el-dropdown-menu': true,
    'el-dropdown-item': true,
    'el-button': true,
    'el-tag': true,
    'el-scrollbar': { template: '<div><slot /></div>', methods: { scrollTo } },
    'el-empty': true,
  });

  it('restores a removed standard section and smoothly resets the editor scroll position', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const resume = useResumeStore();
    const scrollTo = vi.fn();
    resume.data.sectionOrder = ['experience', 'education', 'skills'];
    const wrapper = shallowMount(EditorPanel, {
      global: { plugins: [pinia], stubs: editorPanelStubs(scrollTo) },
    });

    resume.setActiveSection('projects');
    await nextTick();
    await nextTick();

    expect(resume.data.sectionOrder).toContain('projects');
    expect(resume.activeSection).toBe('projects');
    expect(wrapper.find('.editor-section-transition-shell').exists()).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    wrapper.unmount();
  });

  it('resets the editor scroll when preview navigation repeats the active section', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const resume = useResumeStore();
    resume.setActiveSection('projects');
    const scrollTo = vi.fn();
    const wrapper = shallowMount(EditorPanel, {
      props: { previewNavigationKey: 0 },
      global: { plugins: [pinia], stubs: editorPanelStubs(scrollTo) },
    });

    await wrapper.setProps({ previewNavigationKey: 1 });
    await nextTick();
    await nextTick();

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    wrapper.unmount();
  });
  it('shows the active section add button in the header and calls the editor add method', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const resume = useResumeStore();
    resume.data.sectionOrder = ['education'];
    resume.setActiveSection('education');

    const addEducation = vi.fn();
    const wrapper = shallowMount(EditorPanel, {
      global: {
        plugins: [pinia],
        stubs: {
          ...editorPanelStubs(vi.fn()),
          EditorSection: {
            template: '<section class="section-stub"><header><slot name="header-actions" /></header><slot /></section>',
          },
          EducationEditor: {
            setup(_props: any, { expose }: any) {
              expose({ addNew: addEducation });
              return () => null;
            },
          },
          'el-button': {
            emits: ['click'],
            template: `<button type="button" @click="$emit('click', $event)"><slot /></button>`,
          },
        },
      },
    });

    const header = wrapper.find('.section-stub header');
    expect(header.text()).toContain('添加教育背景');
    await header.find('button').trigger('click');
    expect(addEducation).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

});
