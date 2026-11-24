import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, inject, nextTick, ref } from 'vue';
import { previewPageMetricsKey } from '@/components/preview/previewPageMetrics';
import { exportPreviewToPDF } from '@/utils/export-pdf';
import { installElementPlus } from '@/plugins/element';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { ElDropdown, ElMessage } from 'element-plus';
import Editor from '@/views/Editor.vue';
import { useResumeStore } from '@/stores/resume';
import { resetEditorChromeState, useEditorChrome } from '@/composables/useEditorChrome';
import { SIDEBAR_WIDTH_DEFAULT } from '@/utils/editorChrome';
import { storageManager } from '@/services/storage/StorageManager';
import { useMcpBridge } from '@/services/ai/useMcpBridge';

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
      plugins: [pinia, router, { install: installElementPlus }],
      stubs: {
        EditorPanel: defineComponent({
          setup: () => ({ previewPages: inject(previewPageMetricsKey)?.pageCount }),
          template: '<div class="editor-panel-stub">{{ previewPages }}</div>',
        }),
        PreviewPanel: defineComponent({
          setup(_, { expose }) { expose({ pageCount: ref(2), pending: ref(false) }); },
          template: '<div class="preview-panel-stub" />',
        }),
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
  resetEditorChromeState();
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

  it('shares measured page counts with the sibling editing panel', async () => {
    const { wrapper } = await mountEditor();
    expect(wrapper.get('.editor-panel-stub').text()).toBe('2');
    wrapper.unmount();
  });

  it('prevents repeated downloads until the current export finishes', async () => {
    const { wrapper } = await mountEditor();
    let finish!: (pages: number) => void;
    vi.mocked(exportPreviewToPDF).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await wrapper.get('.export-pdf-button').trigger('click');
    await flushPromises();
    dropdownFor(wrapper, '其他格式').vm.$emit('command', 'pdf');
    await flushPromises();
    expect(exportPreviewToPDF).toHaveBeenCalledTimes(1);
    finish(1);
    await flushPromises();
    expect(wrapper.get('.export-pdf-button').classes()).not.toContain('is-loading');
    wrapper.unmount();
  });

  it('布局工具栏可折叠与恢复预览区', async () => {
    const { wrapper } = await mountEditor();

    await layoutKey(wrapper, '预览区').trigger('click');
    await nextTick();
    expect(isPreviewVisible()).toBe(false);
    expect(useEditorChrome().preference.value.previewCollapsed).toBe(true);

    await layoutKey(wrapper, '预览区').trigger('click');
    await nextTick();
    expect(isPreviewVisible()).toBe(true);
    expect(useEditorChrome().preference.value.previewCollapsed).toBe(false);
    wrapper.unmount();
  });

  it('恢复默认布局还原默认栏宽与折叠', async () => {
    const { wrapper } = await mountEditor();
    const { togglePane, preference, resolved } = useEditorChrome();
    togglePane('sidebar');
    await nextTick();
    expect(resolved.value.sidebarVisible).toBe(false);
    expect(wrapper.find('.section-quick-select').exists()).toBe(true);

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
    await wrapper.get('.export-pdf-button').trigger('click');
    await flushPromises();
    expect(exportProbe.previewVisible).toBe(true);
    expect(isPreviewVisible()).toBe(false);

    dropdownFor(wrapper, '更多').vm.$emit('command', 'privacy');
    await nextTick();
    expect(isPreviewVisible()).toBe(true);
    wrapper.unmount();
  });

  it('编辑器顶栏直接反映外部 MCP 连接状态', async () => {
    const mcp = useMcpBridge();
    mcp.linkState.value = 'connected';
    try {
      const { wrapper } = await mountEditor();
      expect(wrapper.text()).toContain('外部 AI · 已连接');
      wrapper.unmount();
    } finally {
      mcp.linkState.value = '';
    }
  });
});
