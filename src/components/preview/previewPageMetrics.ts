import type { ComputedRef, InjectionKey } from 'vue';

/**
 * 主预览画布对外发布的权威 A4 页数。
 *
 * 页数只能由 ResumeCanvas 测量后发布：它同时决定破页线位置。主题面板若自己
 * 重新量一次 DOM，两处读数可能在动画中、隐藏恢复或字体加载前后不一致，
 * 出现「标签说 2 页、画布上一条破页线都没有」。
 */
export interface PreviewPageMetrics {
  /** 预览尚未完成首次有效测量（隐藏、未挂载或标尺读数为 0）。 */
  pending: ComputedRef<boolean>;
  /** 按 297mm 标尺实测的页数，未完成测量时为 null。 */
  pageCount: ComputedRef<number | null>;
}

export const previewPageMetricsKey: InjectionKey<PreviewPageMetrics> = Symbol('previewPageMetrics');
