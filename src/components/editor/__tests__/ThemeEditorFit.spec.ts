import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { computed, defineComponent, h, nextTick, ref, type ComputedRef } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus';
import ThemeEditor from '../ThemeEditor.vue';
import { previewPageMetricsKey, type PreviewPageMetrics } from '@/components/preview/previewPageMetrics';
import { useResumeStore } from '@/stores/resume';

/**
 * 主题面板的适配循环依赖两个外部条件：画布发布的页数，以及保存是否成功。
 * 这里用真实的 store 驱动主题写入，只把「测量」和「持久化」替换成可控的替身。
 */
let wrapper: VueWrapper | undefined;
let frames = new Map<number, FrameRequestCallback>();
const frameQueue = () => frames;

function createHarness() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useResumeStore();
  store.data.id = 'one';

  const pages = ref<number | null>(2);
  const pending = ref(false);
  const metrics: PreviewPageMetrics = {
    pageCount: computed(() => pages.value) as ComputedRef<number | null>,
    pending: computed(() => pending.value) as ComputedRef<boolean>,
  };

  // 真实测量由 ResumeCanvas 负责；这里只记录被应用的排版改动，
  // 并把「还要几页」交给每个用例显式决定，避免替身自己偷偷改页数。
  const applied: Array<Record<string, unknown>> = [];
  const stopMeasure = vi.spyOn(store, 'updateTheme').mockImplementation((theme) => {
    applied.push(JSON.parse(JSON.stringify(theme)) as Record<string, unknown>);
    store.data.theme = { ...store.data.theme, ...theme };
  });
  const saves: boolean[] = [];
  const autoSave = vi.spyOn(store, 'autoSave').mockImplementation(async () => {
    saves.push(true);
  });

  const Host = defineComponent({
    setup() {
      return () => h(ThemeEditor);
    },
  });
  wrapper = mount(Host, {
    global: {
      plugins: [pinia, ElementPlus],
      provide: { [previewPageMetricsKey as symbol]: metrics },
    },
  });

  return { store, pages, pending, saves, autoSave, stopMeasure, applied, host: wrapper };
}

/** 取「尝试适配一页」的原生 button；el-button 的外层不是可点击节点。 */
function fitButton(host: VueWrapper) {
  const node = host.findAll('button').find((item) => item.text().includes('尝试适配一页'));
  if (!node) throw new Error('未找到「尝试适配一页」按钮');
  return node;
}

/**
 * 适配循环每一步都会等 rAF 与 nextTick，这里按需推进它们。
 * afterFrame 用来模拟画布每次重测的结果。
 */
async function drainFit(afterFrame?: (step: number) => void, rounds = 40) {
  for (let i = 0; i < rounds; i += 1) {
    await flushPromises();
    await nextTick();
    const pendingFrames = frameQueue();
    if (!pendingFrames.size) break;
    const callbacks = [...pendingFrames.values()];
    pendingFrames.clear();
    afterFrame?.(i);
    callbacks.forEach((callback) => callback(i));
    await flushPromises();
    await nextTick();
  }
}

beforeEach(() => {
  frames = new Map();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((handle: number) => frames.delete(handle)));
  // 确认框直接放行；这里只关心「用户点了确定」这条路径。
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(undefined as never);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  ElMessage.closeAll();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ThemeEditor one-page fit', () => {
  it('steps down only as far as needed and keeps the font above the 12px floor', async () => {
    const { store, host, pages, applied } = createHarness();
    store.updateTheme({ fontSize: 16, lineHeight: 1.7, pageMargins: 32, moduleMargins: { top: 16, bottom: 24, left: 8, right: 8 } });
    await nextTick();

    const button = fitButton(host);
    expect(button.attributes('disabled')).toBeFalsy();
    applied.length = 0;
    await button.trigger('click');
    // 画布在第 6 次重测时才回到一页，循环必须在此刻停下。
    await drainFit((step) => { pages.value = step >= 5 ? 1 : 2; });

    // 前五档都只收模块下边距（24→20→16→12→8→4），字号始终没被触碰。
    expect(applied).toEqual([
      { moduleMargins: { top: 16, bottom: 20, left: 8, right: 8 } },
      { moduleMargins: { top: 16, bottom: 16, left: 8, right: 8 } },
      { moduleMargins: { top: 16, bottom: 12, left: 8, right: 8 } },
      { moduleMargins: { top: 16, bottom: 8, left: 8, right: 8 } },
      { moduleMargins: { top: 16, bottom: 4, left: 8, right: 8 } },
      { pageMargins: 28 },
    ]);
    // 够用就停：字号和行高都保持原值，没有被无谓地压紧。
    expect(store.data.theme.fontSize).toBe(16);
    expect(store.data.theme.lineHeight).toBe(1.7);
    expect(applied.filter((patch) => 'fontSize' in patch)).toHaveLength(0);
  });

  it('stops at the readability floor and warns instead of deleting content', async () => {
    const { store, host, pages } = createHarness();
    // Never reaches one page, so the ladder must exhaust itself.
    pages.value = 9;
    vi.spyOn(store, 'updateTheme').mockImplementation((theme) => {
      store.data.theme = { ...store.data.theme, ...theme };
    });
    store.updateTheme({ fontSize: 13, lineHeight: 1.2, pageMargins: 12, moduleMargins: { top: 0, bottom: 4, left: 0, right: 0 } });
    await nextTick();
    const warn = vi.spyOn(ElMessage, 'warning');
    const textBefore = JSON.stringify(store.data.experiences);

    await fitButton(host).trigger('click');
    await drainFit();

    expect(store.data.theme.fontSize).toBe(12);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('12px'));
    expect(JSON.stringify(store.data.experiences)).toBe(textBefore);
  });

  it('disables the action while the preview has not measured yet', async () => {
    const { host, pending } = createHarness();
    pending.value = true;
    await nextTick();
    const button = fitButton(host);
    expect(button.attributes('disabled')).toBeDefined();
    expect(host.text()).toContain('请在电脑端显示预览，以计算页数并自动适配');
  });

  it('rolls back to the theme from before the loop when saving fails', async () => {
    const { store, host, autoSave } = createHarness();
    store.updateTheme({ fontSize: 16, lineHeight: 1.7, pageMargins: 32, moduleMargins: { top: 16, bottom: 24, left: 8, right: 8 } });
    await nextTick();
    const before = JSON.parse(JSON.stringify(store.data.theme)) as typeof store.data.theme;
    autoSave.mockRejectedValue(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await fitButton(host).trigger('click');
    await drainFit();

    expect(store.data.theme).toEqual(before);
    autoSave.mockResolvedValue();
  });
});
