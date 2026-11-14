import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import ElementPlus, { ElDropdown, ElMessage } from 'element-plus';
import Editor from '@/views/Editor.vue';
import { useResumeStore } from '@/stores/resume';
import { resetEditorLayoutState, useEditorLayout } from '@/composables/useEditorLayout';
import { SIDEBAR_WIDTH_DEFAULT } from '@/utils/editorLayout';
import { storageManager } from '@/services/storage/StorageManager';

const exportProbe = vi.hoisted(() => ({ previewVisible: false }));

let mountedEditor: VueWrapper | undefined;

vi.mock('@/utils/export-pdf', () => ({
  exportPreviewToPDF: vi.fn(async () => {
    exportProbe.previewVisible = isPreviewVisible();
    return 2;
  }),
  exportToPDF: vi.fn(),
}));

function isPreviewVisible() {
  const element = mountedEditor?.find('.preview-panel-stub').element as HTMLElement | undefined;
  return !!element && element.style.display !== 'none';
}

async function mountEditor() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useResumeStore();
  store.data.id = 'layout-one';
  vi.spyOn(store, 'loadResume').mockResolvedValue();
  vi.spyOn(storageManager, 'save').mockResolvedValue();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/editor/:id', component: Editor },
      { path: '/', component: { template: '<p>Home</p>' } },
    ],
  });
  await router.push('/editor/layout-one');
  await router.isReady();
  const wrapper = mount(RouterView, {
    global: {
      plugins: [pinia, router, ElementPlus],
      stubs: {
        EditorPanel: { template: '<div class="editor-panel-stub" />' },
        PreviewPanel: { template: '<div class="preview-panel-stub" />' },
        ResumeCanvas: true,
        ResumeQualityPanel: true,
      },
    },
  });
  await flushPromises();
  mountedEditor = wrapper;
  return { store, router, wrapper };
}

function dropdownFor(wrapper: VueWrapper, label: string) {
  const dropdown = wrapper.findAllComponents(ElDropdown).find((item) => item.text().includes(label));
  if (!dropdown) throw new Error(`未找到下拉菜单：${label}`);
  return dropdown;
}

function layoutKey(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button.layout-bar__key, button.layout-bar__reset')
    .find((item) => item.attributes('aria-label') === label);
  if (!button) throw new Error(`未找到布局按钮：${label}`);
  return button;
}

afterEach(() => {
  ElMessage.closeAll();
  resetEditorLayoutState();
  mountedEditor = undefined;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('编辑器布局控制', () => {
  it('三栏默认全部可见', async () => {
    const { wrapper } = await mountEditor();
    expect(wrapper.find('.editor-panel-stub').exists()).toBe(true);
    expect(isPreviewVisible()).toBe(true);
    wrapper.unmount();
  });

  it('布局工具栏可折叠与恢复预览区', async () => {
    const { wrapper } = await mountEditor();

    await layoutKey(wrapper, '预览区').trigger('click');
    await nextTick();
    expect(isPreviewVisible()).toBe(false);
    expect(useEditorLayout().preference.value.previewCollapsed).toBe(true);

    await layoutKey(wrapper, '预览区').trigger('click');
    await nextTick();
    expect(isPreviewVisible()).toBe(true);
    expect(useEditorLayout().preference.value.previewCollapsed).toBe(false);
    wrapper.unmount();
  });

  it('恢复默认布局还原默认栏宽与折叠', async () => {
    const { wrapper } = await mountEditor();
    const { togglePane, preference, resolved } = useEditorLayout();
    togglePane('sidebar');
    await nextTick();
    expect(resolved.value.sidebarVisible).toBe(false);

    await layoutKey(wrapper, '恢复默认布局').trigger('click');
    await nextTick();
    expect(preference.value.sidebarCollapsed).toBe(false);
    expect(preference.value.sidebarWidth).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(resolved.value.sidebarVisible).toBe(true);
    wrapper.unmount();
  });

  it('导出与隐私打码会临时保证预览可见', async () => {
    const { wrapper } = await mountEditor();
    await layoutKey(wrapper, '预览区').trigger('click');
    await nextTick();
    expect(isPreviewVisible()).toBe(false);

    exportProbe.previewVisible = false;
    dropdownFor(wrapper, '导出').vm.$emit('command', 'pdf');
    await flushPromises();
    expect(exportProbe.previewVisible).toBe(true);
    expect(isPreviewVisible()).toBe(false);

    dropdownFor(wrapper, '更多').vm.$emit('command', 'privacy');
    await nextTick();
    expect(isPreviewVisible()).toBe(true);
    wrapper.unmount();
  });
});
