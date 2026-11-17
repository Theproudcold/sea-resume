/**
 * A4 一页适配：逐档收紧排版，一旦回到一页就立即停止。
 *
 * 这段逻辑原本长在 `ThemeEditor.vue` 里，但组件名说它是一个「主题编辑器」，
 * 而这里实际在做一个自动化布局优化器（测量 → 确认 → 收紧 → 落盘 → 可还原）。
 * 抽出来之后组件只负责渲染 token，测量与回滚规则只有一个出处。
 *
 * 逐档而不是一次性压到最紧：只收紧到刚好够一页，避免把排版压得比需要更挤。
 * 页数来自 `ResumeCanvas` 发布的权威值（见 `components/preview/previewPageMetrics.ts`），
 * 这里不做第二套 DOM 估算。
 */
import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { ThemeConfig } from '@/types/resume';
import { MAX_FIT_STEPS, MIN_FONT_SIZE, nextFitStep } from '@/utils/pageFit';
import { describeError } from '@/utils/globalErrorReporting';
import { nextFrame } from '@/utils/focusQualityTarget';

/** 适配前主题的快照，供「还原原排版」使用。 */
export interface OnePageFitApi {
  isFitting: Ref<boolean>;
  /** 是否存在可还原的适配前快照。 */
  canRestore: ComputedRef<boolean>;
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
  pageMetrics: { pageCount: ComputedRef<number | null>; pending: ComputedRef<boolean> },
  commands: ThemeCommands,
): OnePageFitApi {
  const originalTheme = ref<ThemeConfig | null>(null);
  const isFitting = ref(false);
  const canRestore = computed(() => originalTheme.value !== null);

  /**
   * 每一步都等画布重测落定后再读页数，避免读到上一档的旧值。
   * ResumeCanvas 把测量排在 rAF 里，所以这里等一个 rAF 即可拿到新页数；
   * 前后各补一次 nextTick，确保 DOM 已按新主题更新。
   */
  async function settle() {
    await nextTick();
    await nextFrame();
    await nextTick();
  }

  async function fitToOnePage(): Promise<void> {
    const pages = pageMetrics.pageCount.value;
    if (pages === null || pages <= 1 || isFitting.value) return;
    try {
      await ElMessageBox.confirm(
        `将逐档收紧模块边距、页面边距、行高与字号；字号不低于 ${MIN_FONT_SIZE}px，任何文字都不会被删除。若到下限仍超页，请精简内容。`,
        '尝试适配一页 A4',
        { confirmButtonText: '开始适配', cancelButtonText: '取消', type: 'warning' },
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
      let reachedFloor = true;
      for (let step = 0; step < MAX_FIT_STEPS; step += 1) {
        const change = nextFitStep(theme.value);
        if (!change) break;
        commands.updateTheme(change);
        await settle();
        if ((pageMetrics.pageCount.value ?? Number.POSITIVE_INFINITY) <= 1) {
          reachedFloor = false;
          break;
        }
      }
      // 中途只在内存里改动，落定后一次性持久化，避免把中间档写进存储。
      await commands.autoSave();
      await settle();

      const pages = pageMetrics.pageCount.value;
      if (pages !== null && pages <= 1) {
        ElMessage.success('已适配为一页 A4，可直接查看打印预览。');
      } else if (reachedFloor) {
        ElMessage.warning(`已收紧到可读性下限（字号不低于 ${MIN_FONT_SIZE}px）；当前仍约 ${pages ?? '多'} 页，建议精简内容。`);
      } else {
        ElMessage.warning(`已尽量收紧排版；当前仍约 ${pages ?? '多'} 页，建议精简内容。`);
      }
    } catch (error) {
      commands.updateTheme(previous);
      try { await commands.autoSave(); } catch { /* 保留原始错误提示给用户 */ }
      originalTheme.value = null;
      try { await settle(); } catch { /* 回滚失败不影响错误提示 */ }
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
      await settle();
      ElMessage.success('已还原适配前的主题排版');
    } catch (error) {
      ElMessage.error('还原排版失败: ' + describeError(error));
    }
  }

  return { isFitting, canRestore, fitToOnePage, restoreOriginalTheme };
}
