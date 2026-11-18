/**
 * 分页切点：把「预览的破页线」和「导出 PDF / 图片的切页位置」收敛到同一份测量。
 *
 * A4 是定尺纸张，而预览画布是一张连续的长图。按页高机械切割长图，必然把正好
 * 压在线上的那一行文字印成两半（上一页留下字头、下一页留下字尾），用户看到
 * 的就是「导出后被截断」，而且导出结果和预览里完整的行不一致。
 *
 * 因此切点必须由内容自己决定：尽量靠近页底，但只能落在内容之间的空隙里。
 * 唯一的例外是内容本身就比一页高（例如整页图片），这时只能退回按页高切。
 */

/** A4 物理尺寸（mm）。 */
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/** 一段不可被切开的纵向区间，坐标是相对内容顶边的 CSS px。 */
export interface ContentBand {
  top: number;
  bottom: number;
}

export interface PageBreakOptions {
  contentHeight: number;
  pageHeight: number;
  bands: readonly ContentBand[];
}

/** 浮点比较容差：切点落在内容带边缘上（行盒上/下边缘）同样安全，只有真落进盒内才不允许。 */
const EPSILON = 1e-6;
/** 内容只超出纸张不到半像素时不另起一页，避免多出几乎空白的一页。 */
const PAGE_FIT_SLACK = 0.5;
/** 一页至少要装下这么多内容；更小的「安全切点」会让页面几乎空白，此时宁可切开超页内容。 */
const MIN_PAGE_FILL = 8;
/**
 * 渲染器把字形画低的余量，按字号取比例。
 *
 * 预览是浏览器排版，导出是 html2canvas 重画：它用一张静态字体度量表算基线
 * （见其 FontMetrics：拿拉丁样本量出来的 baseline），中文行实际由回退字体绘制，
 * 基线因此比浏览器低几个像素。实测 13px 中文简历约 3.5px，随字号线性放大。
 * 切点必须同时避开两种渲染，否则按浏览器几何算出的「安全切点」在导出图里
 * 仍会削掉上一行字尾。
 */
const RENDERER_INK_SLACK_RATIO = 0.3;
/** 装饰盒（边框、底色）超过半页就当成整页背景：必须允许被切，否则整份简历无法分页。 */
const MAX_DECORATION_HEIGHT_RATIO = 0.5;
const CSS_PX_PER_INCH = 96;
const MM_PER_INCH = 25.4;
const FALLBACK_A4_HEIGHT = (A4_HEIGHT_MM * CSS_PX_PER_INCH) / MM_PER_INCH;

/**
 * 实测 A4 纸高（CSS px）。297mm 换算成像素随浏览器缩放变化，不能写死成 1122.5；
 * 预览用同样的物理测量（`.a4-ruler` 的 297mm），两边才会得到同一组切点。
 */
export function measureA4PageHeight(): number {
  if (typeof document === 'undefined' || !document.body) return FALLBACK_A4_HEIGHT;
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;left:-10000px;top:0;width:1px;height:${A4_HEIGHT_MM}mm;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(probe);
  try {
    const height = probe.getBoundingClientRect().height;
    return Number.isFinite(height) && height > 0 ? height : FALLBACK_A4_HEIGHT;
  } finally {
    probe.remove();
  }
}

/** 合并重叠或相接的内容带，避免同一行被重复计算。 */
function mergeContentBands(bands: readonly ContentBand[]): ContentBand[] {
  const sorted = bands
    .filter((band) => Number.isFinite(band.top) && Number.isFinite(band.bottom) && band.bottom > band.top)
    .sort((a, b) => a.top - b.top);
  const merged: ContentBand[] = [];
  for (const band of sorted) {
    const last = merged[merged.length - 1];
    if (last && band.top <= last.bottom) last.bottom = Math.max(last.bottom, band.bottom);
    else merged.push({ top: band.top, bottom: band.bottom });
  }
  return merged;
}

/** 切在 y 处是否安全：y 不能落在任何内容带内部。 */
function isSafeCut(bands: readonly ContentBand[], y: number): boolean {
  return !bands.some((band) => band.top + EPSILON < y && y < band.bottom - EPSILON);
}

/**
 * 在 [start, nominal] 里挑最靠下的安全切点。
 * 内容带的上下边缘都是合法切点：切在下边缘表示这一行留在上一页，切在上边缘表示整行挪到下一页。
 */
function findCut(bands: readonly ContentBand[], start: number, nominal: number): number {
  if (isSafeCut(bands, nominal)) return nominal;
  let best = start;
  for (const band of bands) {
    for (const candidate of [band.bottom, band.top]) {
      if (candidate <= start + EPSILON || candidate > nominal) continue;
      if (!isSafeCut(bands, candidate)) continue;
      if (candidate > best) best = candidate;
    }
  }
  // 整页都被同一段内容占满（例如一张跨页长图）时只能按页高切，否则无法推进。
  return best > start + MIN_PAGE_FILL ? best : nominal;
}

/**
 * 计算每页的结束偏移（CSS px，相对内容顶边，最后一项恒等于 contentHeight）。
 *
 * 不变量：`breaks[i] - breaks[i-1] <= pageHeight`，所以每页切片都不会超出纸张高度、
 * 内容不会被裁掉；同时除退无可退的情况外，切点不会落在任何内容带内部。
 */
export function computePageBreaks({ contentHeight, pageHeight, bands }: PageBreakOptions): number[] {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return [];
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) return [contentHeight];

  const blocked = mergeContentBands(bands);
  const breaks: number[] = [];
  let start = 0;
  while (contentHeight - start > pageHeight + PAGE_FIT_SLACK) {
    const cut = findCut(blocked, start, start + pageHeight);
    breaks.push(cut);
    start = cut;
  }
  breaks.push(contentHeight);
  return breaks;
}

function isExcluded(element: Element | null): boolean {
  return !!element?.closest('.no-print');
}

/**
 * 文本节点的父元素行高（px）。`Range.getClientRects()` 给的是字体的内容区（ascent+descent），
 * 比行盒矮：行盒在上下各补半个行距。字形墨迹会画到行盒边缘，所以内容带必须按行盒算，
 * 否则切点会落在「看起来是空隙、其实还有字形」的行距里。
 */
interface TextMetricsPx {
  lineHeight: number | null;
  fontSlack: number;
}

function parsePx(value: string | undefined): number {
  const px = value?.endsWith('px') ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(px) && px > 0 ? px : 0;
}

function resolvedTextMetrics(element: Element | null, cache: Map<Element, TextMetricsPx>): TextMetricsPx {
  if (!element) return { lineHeight: null, fontSlack: 0 };
  const cached = cache.get(element);
  if (cached) return cached;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const lineHeight = parsePx(style?.lineHeight);
  const metrics: TextMetricsPx = {
    lineHeight: lineHeight > 0 ? lineHeight : null,
    fontSlack: parsePx(style?.fontSize) * RENDERER_INK_SLACK_RATIO,
  };
  cache.set(element, metrics);
  return metrics;
}

function toBand(rect: { top: number; bottom: number; width: number; height: number }, origin: number): ContentBand | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  return { top: rect.top - origin, bottom: rect.bottom - origin };
}

/** 把文本行盒补成整行：上下各加半个行距，得到浏览器真正用来换行的行盒。 */
function toLineBand(
  rect: { top: number; bottom: number; width: number; height: number },
  metrics: TextMetricsPx,
  origin: number,
): ContentBand | null {
  const { lineHeight, fontSlack } = metrics;
  const halfLeading = lineHeight && lineHeight > rect.height ? (lineHeight - rect.height) / 2 : 0;
  // DOMRect 的字段在原型上，展开会得到空对象，必须逐个取值。
  // 下边缘额外留出渲染器余量：只有它会把字形画低。
  return toBand({
    top: rect.top - halfLeading,
    bottom: rect.bottom + halfLeading + fontSlack,
    width: rect.width,
    height: rect.height,
  }, origin);
}

/** 有可见边框或底色的盒子要整块避让：标题下划线、色块被切开一样是「截断」。 */
function hasVisibleDecoration(style: CSSStyleDeclaration): boolean {
  const background = style.backgroundColor;
  if (background && background !== 'transparent' && !/^rgba\(0,\s*0,\s*0,\s*0\)$/.test(background)) return true;
  return (Number.parseFloat(style.borderTopWidth) || 0) > 0 || (Number.parseFloat(style.borderBottomWidth) || 0) > 0;
}

/**
 * 采集内容顶边以下所有「不能被切开」的区间：
 * 文本行盒（Range 逐行取矩形，段落可以续排但一行不能断）、替换元素，以及带边框/底色的装饰盒。
 */
export function collectContentBands(root: HTMLElement, pageHeight: number = FALLBACK_A4_HEIGHT): ContentBand[] {
  const bands: ContentBand[] = [];
  const origin = root.getBoundingClientRect().top;
  const push = (rect: { top: number; bottom: number; width: number; height: number }): void => {
    const band = toBand(rect, origin);
    if (band) bands.push(band);
  };
  const document = root.ownerDocument;
  const supportsLineRects = typeof Range !== 'undefined' && typeof Range.prototype.getClientRects === 'function';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textMetrics = new Map<Element, TextMetricsPx>();

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (isExcluded(parent)) continue;
    if (supportsLineRects) {
      const range = document.createRange();
      const metrics = resolvedTextMetrics(parent, textMetrics);
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        const band = toLineBand(rect, metrics, origin);
        if (band) bands.push(band);
      }
    } else if (parent && !parent.querySelector('*')) {
      // 退化路径（jsdom、老浏览器）：没有逐行矩形时按叶子元素整块避让，宁可少切也不错切。
      push(parent.getBoundingClientRect());
    }
  }

  for (const element of root.querySelectorAll('img, svg, canvas, video, iframe, object')) {
    if (!isExcluded(element)) push(element.getBoundingClientRect());
  }

  for (const element of root.querySelectorAll('*')) {
    if (isExcluded(element)) continue;
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) continue;
    if (rect.height > pageHeight * MAX_DECORATION_HEIGHT_RATIO) continue;
    const style = document.defaultView?.getComputedStyle(element);
    if (!style || !hasVisibleDecoration(style)) continue;
    push(rect);
  }

  return mergeContentBands(bands);
}

/** 测量并计算分页切点：预览破页线与导出切页共用这一个入口。 */
export function measurePageBreaks(root: HTMLElement, contentHeight: number, pageHeight: number): number[] {
  return computePageBreaks({ contentHeight, pageHeight, bands: collectContentBands(root, pageHeight) });
}
