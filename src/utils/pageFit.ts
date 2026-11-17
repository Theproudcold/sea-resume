import type { ThemeConfig } from '@/types/resume';

/** 适配一页时的排版下限：再小会影响可读性，因此宁可为多页也不越过。 */
export const MIN_FONT_SIZE = 12;
export const MIN_LINE_HEIGHT = 1.2;
export const MIN_PAGE_MARGINS = 12;
export const MIN_MODULE_MARGIN_BOTTOM = 4;

/** 逐档收紧时每档的幅度。字号步长最小，因为它是可读性最强的一档。 */
const FONT_STEP = 0.5;
const LINE_STEP = 0.1;
const PAGE_MARGIN_STEP = 4;
const MODULE_MARGIN_STEP = 4;

export type LayoutTokens = Pick<ThemeConfig, 'fontSize' | 'lineHeight' | 'pageMargins' | 'moduleMargins'>;

export function estimateA4PageCount(contentHeight: number, pageHeight: number): number {
  if (!Number.isFinite(contentHeight) || !Number.isFinite(pageHeight) || pageHeight <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, contentHeight - 1) / pageHeight));
}

/** 夹到 [min, max]；非有限值取 min，避免 NaN 穿透到主题里。 */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(value, max));
}

/** 四舍五入到两位小数，避免 1.6 - 0.1 这类浮点误差累积进主题。 */
function round2(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * 返回「再收紧一档」的排版改动；null 表示已到安全下限，无法在保留文字的前提下继续压缩。
 *
 * 只处理排版 token，不触碰任何简历文字。每次只改一个维度，调用方逐档试排，
 * 一旦回到一页就立即停止，避免把排版压到比需要更紧。
 * 顺序按对可读性的影响从小到大：模块边距 → 页面边距 → 行高 → 字号。
 */
export function nextFitStep(theme: ThemeConfig): Partial<LayoutTokens> | null {
  const margins = theme.moduleMargins ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const moduleBottom = Number.isFinite(margins.bottom) ? margins.bottom : 0;
  const pageMargins = Number.isFinite(theme.pageMargins) ? theme.pageMargins : MIN_PAGE_MARGINS;
  const lineHeight = Number.isFinite(theme.lineHeight) ? theme.lineHeight : MIN_LINE_HEIGHT;
  const fontSize = Number.isFinite(theme.fontSize) ? theme.fontSize : MIN_FONT_SIZE;

  if (moduleBottom > MIN_MODULE_MARGIN_BOTTOM) {
    return {
      moduleMargins: {
        ...margins,
        bottom: Math.max(MIN_MODULE_MARGIN_BOTTOM, round2(moduleBottom - MODULE_MARGIN_STEP)),
      },
    };
  }
  if (pageMargins > MIN_PAGE_MARGINS) {
    return { pageMargins: Math.max(MIN_PAGE_MARGINS, round2(pageMargins - PAGE_MARGIN_STEP)) };
  }
  if (lineHeight > MIN_LINE_HEIGHT) {
    return { lineHeight: Math.max(MIN_LINE_HEIGHT, round2(lineHeight - LINE_STEP)) };
  }
  if (fontSize > MIN_FONT_SIZE) {
    return { fontSize: Math.max(MIN_FONT_SIZE, round2(fontSize - FONT_STEP)) };
  }
  return null;
}

/**
 * 逐档收紧最多需要多少步才到下限（用于给调用方的循环上限留出安全边界）。
 *
 * 从界面滑块可设的最大值（字号 18、行高 2.0、页面边距 60、模块边距 64）算起
 * 需要 47 档；这里取两倍余量，保证不会在上限处提前退出而谎报「已到下限」。
 */
export const MAX_FIT_STEPS = 96;

/**
 * 一次性把排版压到安全下限，不删改简历文字。
 *
 * 「紧凑」的语义就是取到下限：字号 12、行高 1.2、页面边距 12、模块下边距 4，
 * 且上/左/右边距归零。它只收紧不放大——比下限更松的输入一律拉到下限，
 * 绝不把用户原本更紧凑的值放大回去。
 * 逐档试排（够一页就停）请用 nextFitStep。
 */
export function getCompactThemeSettings(theme: ThemeConfig): LayoutTokens {
  const margins = theme.moduleMargins ?? { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    fontSize: clamp(theme.fontSize, MIN_FONT_SIZE, MIN_FONT_SIZE),
    lineHeight: clamp(theme.lineHeight, MIN_LINE_HEIGHT, MIN_LINE_HEIGHT),
    pageMargins: clamp(theme.pageMargins, MIN_PAGE_MARGINS, MIN_PAGE_MARGINS),
    moduleMargins: {
      top: clamp(margins.top, 0, 0),
      bottom: clamp(margins.bottom, MIN_MODULE_MARGIN_BOTTOM, MIN_MODULE_MARGIN_BOTTOM),
      left: clamp(margins.left, 0, 0),
      right: clamp(margins.right, 0, 0),
    },
  };
}
