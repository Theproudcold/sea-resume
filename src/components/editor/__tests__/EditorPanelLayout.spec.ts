import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';
import EditorPanel from '@/components/editor/EditorPanel.vue';
import { resetEditorChromeState, useEditorChrome } from '@/composables/useEditorChrome';
import {
  EDITOR_WIDTH_DEFAULT,
  EDITOR_WIDTH_MIN,
  PANEL_SPLITTER_WIDTH,
  SIDEBAR_WIDTH_DEFAULT,
} from '@/utils/editorChrome';

vi.mock('@/components/editor/ThemeEditor.vue', () => ({ default: { name: 'ThemeEditor', template: '<div />' } }));
vi.mock('@/components/editor/BasicInfoEditor.vue', () => ({ default: { name: 'BasicInfoEditor', template: '<div />' } }));
vi.mock('@/components/editor/ExperienceEditor.vue', () => ({ default: { name: 'ExperienceEditor', template: '<div />' } }));
vi.mock('@/components/editor/EducationEditor.vue', () => ({ default: { name: 'EducationEditor', template: '<div />' } }));
vi.mock('@/components/editor/ProjectEditor.vue', () => ({ default: { name: 'ProjectEditor', template: '<div />' } }));
vi.mock('@/components/editor/SkillEditor.vue', () => ({ default: { name: 'SkillEditor', template: '<div />' } }));
vi.mock('@/components/editor/CustomBlockEditor.vue', () => ({ default: { name: 'CustomBlockEditor', template: '<div />' } }));

describe('编辑器三栏宽度与折叠', () => {
  let wrapper: VueWrapper | undefined;

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
          'el-scrollbar': { template: '<div><slot /></div>', methods: { scrollTo: vi.fn() } },
          'el-button': { template: '<button type="button"><slot /></button>' },
          draggable: {
            props: ['modelValue'],
            template: '<div><template v-for="item in modelValue" :key="item.id"><slot name="item" :element="item" /></template></div>',
          },
          EditorSection: { template: '<section><slot /></section>' },
        },
      },
    });
    return wrapper;
  };

  beforeEach(() => {
    resetEditorChromeState();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
  });

  it('默认按偏好宽度渲染三栏并暴露分隔条', () => {
    const panel = render().get('.editor-panel');
    expect(panel.attributes('style')).toContain(`--sidebar-width: ${SIDEBAR_WIDTH_DEFAULT}px`);
    expect(panel.attributes('style')).toContain(
      `--editor-panel-width: ${SIDEBAR_WIDTH_DEFAULT + PANEL_SPLITTER_WIDTH + EDITOR_WIDTH_DEFAULT}px`,
    );
    expect(wrapper!.get('.editor-sidebar').isVisible()).toBe(true);
    expect(wrapper!.get('.editor-main').isVisible()).toBe(true);
    expect(wrapper!.get('[role="separator"]').attributes('aria-label')).toBe('调整模块导航宽度');
  });

  it('分隔条按钮折叠模块导航，宽度让给编辑区', async () => {
    render();
    await wrapper!.get('.panel-splitter__toggle').trigger('click');
    await nextTick();
    expect(wrapper!.get('.editor-sidebar').isVisible()).toBe(false);
    expect(wrapper!.get('.editor-panel').attributes('style')).toContain(
      `--editor-panel-width: ${PANEL_SPLITTER_WIDTH + EDITOR_WIDTH_DEFAULT}px`,
    );
    expect(useEditorChrome().preference.value.sidebarCollapsed).toBe(true);
  });

  it('拖拽分隔条在编辑区容器总宽不变的前提下调整宽度', async () => {
    render();
    const handle = wrapper!.get('[role="separator"]');
    await handle.trigger('pointerdown', { clientX: 200, button: 0, pointerId: 1 });
    await handle.trigger('pointermove', { clientX: 240 });
    await nextTick();
    expect(wrapper!.get('.editor-panel').attributes('style')).toContain(`--sidebar-width: ${SIDEBAR_WIDTH_DEFAULT + 40}px`);
    expect(wrapper!.get('.editor-panel').attributes('style')).toContain(
      `--editor-panel-width: ${SIDEBAR_WIDTH_DEFAULT + PANEL_SPLITTER_WIDTH + EDITOR_WIDTH_DEFAULT}px`,
    );
  });

  it('窗口变窄时自动收起模块导航，变宽后自动恢复', async () => {
    render();
    const layout = useEditorChrome();
    layout.setContainerWidth(1280);
    await nextTick();
    expect(wrapper!.get('.editor-sidebar').isVisible()).toBe(false);
    expect(layout.resolved.value.autoCollapsedSidebar).toBe(true);
    expect(wrapper!.get('.editor-panel').attributes('style')).toContain(
      `--editor-panel-width: ${PANEL_SPLITTER_WIDTH + EDITOR_WIDTH_MIN}px`,
    );

    layout.setContainerWidth(2000);
    await nextTick();
    expect(wrapper!.get('.editor-sidebar').isVisible()).toBe(true);
    expect(layout.resolved.value.autoCollapsedSidebar).toBe(false);
    expect(wrapper!.get('.editor-panel').attributes('style')).toContain(`--sidebar-width: ${SIDEBAR_WIDTH_DEFAULT}px`);
  });
});
