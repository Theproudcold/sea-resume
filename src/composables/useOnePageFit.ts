/**
 * A4 一页适配：测量预览实际页数，并按安全下限逐档收紧排版。
 *
 * 这段逻辑原本长在 `ThemeEditor.vue` 里，但组件名说它是一个「主题编辑器」，
 * 而这里实际在做一个自动化布局优化器（测量 → 确认 → 收紧 → 落盘 → 可还原）。
 * 抽出来之后组件只负责渲染 token，测量与回滚规则只有一个出处。
 *
 * 页数来自 `ResumeCanvas` 发布的权威值（见 `components/preview/previewPageMetrics.ts`），
 * 这里不做第二套估算。
 */
import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { ThemeConfig } from '@/types/resume';
import { getCompactThemeSettings, estimateA4PageCount } from '@/utils/pageFit';
import { describeError } from '@/utils/globalErrorReporting';
import { nextFrame } from '@/utils/focusQualityTarget';

/** 适配前主题的快照，供「还原原排版」使用。 */
export interface OnePageFitApi {
  isFitting: Ref<boolean>;
  /** 是否存在可还原的适配前快照。 */
  canRestore: Ref<boolean>;
  fitToOnePage: () => Promise<void>;
  restoreOriginalTheme: () => Promise<void>;
}

interface ThemeCommands {
  /** 只改内存、稍后统一落盘，避免把中间档写进存储。 */
  updateTheme: (theme: Partial<ThemeConfig>) => void;
  autoSave: () => Promise<void>;
  /** 把连续的主题改动合并成一个撤销步骤。 */
  beginHistoryGroup: () => void;
}

export function useOnePageFit(
  theme: Ref<ThemeConfig>,
  estimatedPages: Ref<number | null>,
  commands: ThemeCommands,
): OnePageFitApi {
  const originalTheme = ref<ThemeConfig | null>(null);
  const isFitting = ref(false);
  const canRestore = computed(() => originalTheme.value !== null);

  async function fitToOnePage(): Promise<void> {
    if (estimatedPages.value === null || estimatedPages.value <= 1 || isFitting.value) return;
    try {
      await ElMessageBox.confirm(
        '将尝试调整字号、行高和边距；字号不低于 12px，任何文字都不会被删除。若仍超页，请精简内容。',
        '尝试适配一页 A4',
        { confirmButtonText: '应用紧凑排版', cancelButtonText: '取消', type: 'warning' },
      );
    } catch {
      return;
    }

    const previous = JSON.parse(JSON.stringify(theme.value)) as ThemeConfig;
    if (!originalTheme.value) originalTheme.value = previous;
    // 整批适配算一个撤销步骤，用户按一次撤销就能回到适配前。
    commands.beginHistoryGroup();
    isFitting.value = true;
    try {
      commands.updateTheme(getCompactThemeSettings(theme.value));
      await commands.autoSave();
      await nextFrame();
      if ((estimatedPages.value ?? 1) <= 1) ElMessage.success('紧凑排版已应用，预览估算为一页。');
      else ElMessage.warning(`已应用安全范围内的紧凑排版；当前仍约 ${estimatedPages.value} 页，建议精简内容。`);
    } catch (error) {
      commands.updateTheme(previous);
      try { await commands.autoSave(); } catch { /* 保留原始错误提示给用户 */ }
      originalTheme.value = null;
      ElMessage.error('紧凑排版未能保存: ' + describeError(error));
    } finally {
      isFitting.value = false;
    }
  }

  async function restoreOriginalTheme(): Promise<void> {
    const snapshot = originalTheme.value;
    if (!snapshot) return;
    try {
      commands.updateTheme(snapshot);
      await commands.autoSave();
      originalTheme.value = null;
      await nextFrame();
      ElMessage.success('已还原适配前的主题排版');
    } catch (error) {
      ElMessage.error('还原排版失败: ' + describeError(error));
    }
  }

  return { isFitting, canRestore, fitToOnePage, restoreOriginalTheme };
}

/**
 * 页数估算：直接读预览画布与它自带的 A4 标尺，不做第二套 DOM 测量。
 * 画布隐藏或标尺读数为 0 时返回 null，界面据此提示「预览未显示」。
 */
export function usePreviewPageEstimate(theme: Ref<ThemeConfig>) {
  const estimatedPages = ref<number | null>(null);
  const pending = computed(() => estimatedPages.value === null);
  let canvasObserver: ResizeObserver | null = null;
  let contentObserver: MutationObserver | null = null;
  let updateFrame = 0;

  function updatePageEstimate() {
    const canvas = document.querySelector<HTMLElement>('.preview-panel .resume-canvas');
    if (!canvas || canvas.getBoundingClientRect().width <= 0) {
      estimatedPages.value = null;
      return;
    }
    const ruler = document.querySelector<HTMLElement>('.preview-panel .a4-ruler');
    const a4Height = ruler?.getBoundingClientRect().height || ruler?.offsetHeight || 0;
    if (a4Height <= 0) {
      estimatedPages.value = null;
      return;
    }
    estimatedPages.value = estimateA4PageCount(canvas.scrollHeight, a4Height);
  }

  function schedulePageEstimate() {
    if (updateFrame) cancelAnimationFrame(updateFrame);
    updateFrame = requestAnimationFrame(updatePageEstimate);
  }

  watch(theme, schedulePageEstimate, { deep: true });
  onMounted(() => {
    const canvas = document.querySelector<HTMLElement>('.preview-panel .resume-canvas');
    schedulePageEstimate();
    if (canvas && typeof ResizeObserver !== 'undefined') {
      canvasObserver = new ResizeObserver(schedulePageEstimate);
      canvasObserver.observe(canvas);
    }
    if (canvas && typeof MutationObserver !== 'undefined') {
      contentObserver = new MutationObserver(schedulePageEstimate);
      contentObserver.observe(canvas, { childList: true, subtree: true, characterData: true });
    }
  });
  onUnmounted(() => {
    canvasObserver?.disconnect();
    contentObserver?.disconnect();
    if (updateFrame) cancelAnimationFrame(updateFrame);
  });

  return { estimatedPages, pending, refresh: schedulePageEstimate };
}
