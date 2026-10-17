import { defineComponent, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';
import EditorPanel from '@/components/editor/EditorPanel.vue';
import { useResumeStore } from '@/stores/resume';
import { storageManager } from '@/services/storage/StorageManager';

// Isolate editor implementations; the real host, KeepAlive and Transition run.
vi.mock('@/components/editor/ThemeEditor.vue', () => ({ default: { name: 'ThemeEditor' } }));
vi.mock('@/components/editor/BasicInfoEditor.vue', () => ({ default: { name: 'BasicInfoEditor' } }));
vi.mock('@/components/editor/ExperienceEditor.vue', () => ({ default: { name: 'ExperienceEditor' } }));
vi.mock('@/components/editor/EducationEditor.vue', () => ({ default: { name: 'EducationEditor' } }));
vi.mock('@/components/editor/ProjectEditor.vue', () => ({ default: { name: 'ProjectEditor' } }));
vi.mock('@/components/editor/SkillEditor.vue', () => ({ default: { name: 'SkillEditor' } }));
vi.mock('@/components/editor/CustomBlockEditor.vue', () => ({ default: { name: 'CustomBlockEditor' } }));

describe('EditorPanel cached navigation', () => {
  let wrapper: VueWrapper | undefined;
  let transitionStyles: HTMLStyleElement;
  const mounted = new Map<string, number>();
  const unmounted = new Map<string, number>();
  const additions = vi.fn();
  const scrollTo = vi.fn();
  const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) || 0) + 1);
  const editor = (name: string) => defineComponent({
    name,
    props: ['id', 'modelValue'],
    emits: ['delete', 'update:modelValue'],
    setup(props, { expose }) {
      const key = props.id || name;
      const draft = ref('');
      onMounted(() => count(mounted, key));
      onUnmounted(() => count(unmounted, key));
      expose({ addNew: () => additions(key, 'addNew'), addItem: () => additions(key, 'addItem') });
      return { draft };
    },
    template: '<div class="editor-stub"><input class="editor-draft" v-model="draft" /><button class="delete-custom" @click="$emit(\'delete\')">delete</button></div>',
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mounted.clear();
    unmounted.clear();
    setActivePinia(createPinia());
    vi.spyOn(storageManager, 'save').mockResolvedValue();
    // Exercise Vue's real transition cancellation/KeepAlive integration, not a
    // Transition stub. jsdom does not load the SFC stylesheet itself.
    transitionStyles = document.createElement('style');
    transitionStyles.textContent = '.editor-section-switch-enter-active, .editor-section-switch-leave-active { transition-duration: 0.18s; transition-delay: 0s; transition-property: opacity, transform; }';
    document.head.appendChild(transitionStyles);
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    transitionStyles.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const render = () => {
    wrapper = mount(EditorPanel, {
      attachTo: document.body,
      props: { previewNavigationKey: 0 },
      global: {
        stubs: {
          transition: false,
          'el-icon': true,
          'el-dropdown': true,
          'el-dropdown-menu': true,
          'el-dropdown-item': true,
          'el-tag': true,
          'el-empty': true,
          'el-scrollbar': { template: '<div><slot /></div>', methods: { scrollTo } },
          'el-button': { template: '<button type="button"><slot /></button>' },
          draggable: {
            props: ['modelValue'],
            template: '<div><template v-for="item in modelValue" :key="item.id"><slot name="item" :element="item" /></template></div>',
          },
          EditorSection: { template: '<section class="section-stub"><header><slot name="header-actions" /></header><slot /></section>' },
          ThemeEditor: editor('ThemeEditor'),
          BasicInfoEditor: editor('BasicInfoEditor'),
          ExperienceEditor: editor('ExperienceEditor'),
          EducationEditor: editor('EducationEditor'),
          ProjectEditor: editor('ProjectEditor'),
          SkillEditor: editor('SkillEditor'),
          CustomBlockEditor: editor('CustomBlockEditor'),
        },
      },
    });
    return wrapper;
  };
  const settle = async () => {
    await nextTick();
    await vi.advanceTimersByTimeAsync(250);
    await nextTick();
  };
  const navigate = async (id: string) => {
    useResumeStore().setActiveSection(id);
    await settle();
  };
  const custom = (id: string) => {
    const resume = useResumeStore();
    resume.data.customBlocks.push({ id, title: id, type: 'list', content: [], order: 0 });
    resume.data.sectionOrder.push(id);
  };
  const activeStage = () => wrapper!.find('.editor-section-stage:not([aria-hidden="true"])');

  it('restores a removed standard section and smoothly resets scroll', async () => {
    const resume = useResumeStore();
    resume.data.sectionOrder = ['experience', 'education', 'skills'];
    render();
    await navigate('projects');
    expect(resume.data.sectionOrder).toContain('projects');
    expect(activeStage().attributes('data-section-id')).toBe('projects');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('resets scroll for repeated preview navigation and respects reduced motion', async () => {
    useResumeStore().setActiveSection('projects');
    render();
    await wrapper!.setProps({ previewNavigationKey: 1 });
    await settle();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    await wrapper!.setProps({ previewNavigationKey: 2 });
    await settle();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' });
  });

  it('mounts only visited modules and preserves editor state on re-entry', async () => {
    useResumeStore().setActiveSection('education');
    render();
    expect([...mounted.keys()]).toEqual(['EducationEditor']);
    await activeStage().find('input').setValue('unsaved editor state');
    await navigate('projects');
    await navigate('education');
    expect(mounted.get('EducationEditor')).toBe(1);
    expect(unmounted.get('EducationEditor')).toBeUndefined();
    expect((activeStage().find('input').element as HTMLInputElement).value).toBe('unsaved editor state');
  });

  it('also caches theme and basic info hosts', async () => {
    useResumeStore().setActiveSection('theme');
    render();
    await navigate('basic');
    await navigate('theme');
    await navigate('basic');
    expect(mounted.get('ThemeEditor')).toBe(1);
    expect(mounted.get('BasicInfoEditor')).toBe(1);
  });

  it('keeps at most six hosts and evicts the least recently used editor', async () => {
    custom('seventh');
    useResumeStore().setActiveSection('theme');
    render();
    for (const id of ['basic', 'experience', 'education', 'projects', 'skills']) await navigate(id);
    expect([...unmounted.values()]).toEqual([]);
    await navigate('basic'); // Refresh its LRU position.
    await navigate('seventh');
    expect(unmounted.get('ThemeEditor')).toBe(1);
    expect(unmounted.get('BasicInfoEditor')).toBeUndefined();
    expect([...mounted.values()].reduce((a, b) => a + b, 0) - [...unmounted.values()].reduce((a, b) => a + b, 0)).toBe(6);
    await navigate('theme');
    expect(mounted.get('ThemeEditor')).toBe(2);
  });

  it('routes header addNew and addItem to the active cached editor after switches', async () => {
    custom('custom-list');
    useResumeStore().setActiveSection('education');
    render();
    expect(activeStage().find('header').text()).toBe('添加教育背景');
    await activeStage().find('header button').trigger('click');
    expect(additions).toHaveBeenLastCalledWith('EducationEditor', 'addNew');
    await navigate('custom-list');
    expect(activeStage().find('header').text()).toBe('添加条目');
    await activeStage().find('header button').trigger('click');
    expect(additions).toHaveBeenLastCalledWith('custom-list', 'addItem');
    await navigate('education');
    await activeStage().find('header button').trigger('click');
    expect(additions).toHaveBeenLastCalledWith('EducationEditor', 'addNew');
    expect(additions).toHaveBeenCalledTimes(3);
    expect(mounted.get('EducationEditor')).toBe(1);
  });

  it('prunes a deleted inactive custom module without remounting other cached editors', async () => {
    const resume = useResumeStore();
    custom('deleted');
    resume.setActiveSection('deleted');
    render();
    await navigate('education');
    resume.removeCustomBlock('deleted'); // Even an external delete with stale sectionOrder.
    await settle();
    expect(unmounted.get('deleted')).toBe(1);
    expect(mounted.get('EducationEditor')).toBe(1);
    custom('deleted');
    await navigate('deleted');
    expect(mounted.get('deleted')).toBe(2);
  });

  it('deletes the active custom module and selects a valid fallback', async () => {
    const resume = useResumeStore();
    custom('deleted');
    resume.setActiveSection('deleted');
    render();
    await activeStage().find('.delete-custom').trigger('click');
    await settle();
    expect(resume.data.customBlocks.some(block => block.id === 'deleted')).toBe(false);
    expect(resume.data.sectionOrder).not.toContain('deleted');
    expect(activeStage().attributes('data-section-id')).not.toBe('deleted');
    expect(wrapper!.find('[data-section-id="deleted"]').exists()).toBe(false);
    expect(unmounted.get('deleted')).toBe(1);
  });

  it('prunes a custom module removed from navigation, even if its data is retained', async () => {
    const resume = useResumeStore();
    custom('removed');
    resume.setActiveSection('removed');
    render();
    await navigate('education');
    resume.updateSectionOrder(resume.data.sectionOrder.filter(id => id !== 'removed'));
    await settle();
    expect(unmounted.get('removed')).toBe(1);
    resume.updateSectionOrder([...resume.data.sectionOrder, 'removed']);
    await navigate('removed');
    expect(mounted.get('removed')).toBe(2);
  });

  it('clears all cached hosts when the resume id changes, even without parent remount', async () => {
    const resume = useResumeStore();
    resume.setActiveSection('education');
    render();
    await activeStage().find('input').setValue('resume A draft');
    await navigate('projects');
    resume.data.id = 'resume-B';
    await settle();
    expect(unmounted.get('EducationEditor')).toBe(1);
    expect(unmounted.get('ProjectEditor')).toBe(1);
    await navigate('education');
    expect(mounted.get('EducationEditor')).toBe(2);
    expect((activeStage().find('input').element as HTMLInputElement).value).toBe('');
  });

  it('ignores delayed events from an outgoing host after a resume switch', async () => {
    const resume = useResumeStore();
    custom('shared-id');
    resume.setActiveSection('shared-id');
    render();
    const oldEditor = wrapper!.findComponent({ name: 'CustomBlockEditor' });
    const update = vi.spyOn(resume, 'updateCustomBlock');
    resume.data.id = 'resume-B';
    resume.data.customBlocks[0]!.content = 'resume B content';
    oldEditor.vm.$emit('update:modelValue', 'late resume A content');
    oldEditor.vm.$emit('delete');
    expect(update).not.toHaveBeenCalled();
    expect(resume.data.customBlocks[0]!.content).toBe('resume B content');
    await settle();
    expect(mounted.get('shared-id')).toBe(2);
  });

  it('does not recreate a deleted custom editor when stale navigation requests it', async () => {
    const resume = useResumeStore();
    custom('deleted');
    resume.setActiveSection('deleted');
    render();
    await navigate('education');
    resume.removeCustomBlock('deleted');
    await settle();
    await navigate('deleted');
    expect(activeStage().attributes('data-section-id')).not.toBe('deleted');
    expect(mounted.get('deleted')).toBe(1);
  });

  it('cancels rapid A/B/A switches, disables outgoing interaction and releases height', async () => {
    const resume = useResumeStore();
    resume.setActiveSection('education');
    render();
    const shell = wrapper!.find('.editor-section-transition-shell');
    Object.defineProperty(shell.element, 'offsetHeight', { configurable: true, value: 480 });
    resume.setActiveSection('projects');
    await nextTick();
    await nextTick();
    const outgoing = wrapper!.find('[data-section-id="education"]');
    expect(outgoing.attributes('aria-hidden')).toBe('true');
    expect((outgoing.element as HTMLElement).inert).toBe(true);
    expect((shell.element as HTMLElement).style.minHeight).toBe('480px');
    resume.setActiveSection('education');
    await nextTick();
    resume.setActiveSection('skills');
    await nextTick();
    resume.setActiveSection('education');
    await settle();
    expect(wrapper!.findAll('.editor-section-stage')).toHaveLength(1);
    expect(activeStage().attributes('data-section-id')).toBe('education');
    expect((activeStage().element as HTMLElement).inert).toBe(false);
    expect((shell.element as HTMLElement).style.minHeight).toBe('');
    expect(mounted.get('EducationEditor')).toBe(1);
    await activeStage().find('header button').trigger('click');
    expect(additions).toHaveBeenLastCalledWith('EducationEditor', 'addNew');
  });

  it('cleans up rapid switches that exceed the cache limit mid-transition', async () => {
    const resume = useResumeStore();
    custom('seventh');
    custom('eighth');
    resume.setActiveSection('theme');
    render();
    for (const id of ['basic', 'experience', 'education', 'projects', 'skills', 'seventh', 'eighth', 'theme']) {
      resume.setActiveSection(id);
      await nextTick();
    }
    await settle();
    expect(wrapper!.findAll('.editor-section-stage')).toHaveLength(1);
    expect(activeStage().attributes('data-section-id')).toBe('theme');
    expect((activeStage().element as HTMLElement).inert).toBe(false);
    expect([...mounted.values()].reduce((a, b) => a + b, 0) - [...unmounted.values()].reduce((a, b) => a + b, 0)).toBe(6);
  });
});
