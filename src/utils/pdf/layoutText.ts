/**
 * 把 PDF 文本项按版面还原成可读文本。
 *
 * pdfjs 只给出每段文本的坐标与宽度；直接按拼接顺序输出会打乱双栏与表格简历的阅读顺序。
 * 这里按纵坐标分行、按横向间距切分单元格，并在检测到稳定的纵向留白时按栏输出。
 */

export interface PositionedTextItem {
  text: string;
  /** 左边界（与 y 同一坐标系；y 向下增大） */
  x: number;
  /** 顶边（向下增大） */
  y: number;
  width: number;
  height: number;
}

export interface PageLayout {
  text: string;
  columnCount: 1 | 2;
}

export interface LayoutTextOptions {
  /** 行合并的纵向容差相对字号的比例 */
  lineToleranceRatio?: number;
  /** 同一行内切分单元格的最小水平间距相对字宽的比例 */
  cellGapRatio?: number;
}

/** 单元格分隔符：用制表符而不是竖线，避免与简历正文中的“公司 | 职位”混淆。 */
export const CELL_SEPARATOR = '\t';
export const LEFT_COLUMN_MARKER = '[[左栏]]';
export const RIGHT_COLUMN_MARKER = '[[右栏]]';

const DEFAULT_LINE_TOLERANCE_RATIO = 0.6;
const DEFAULT_CELL_GAP_RATIO = 1.5;
const MIN_CELL_GAP = 8;
const MIN_GUTTER_WIDTH = 8;
const MIN_ITEMS_FOR_COLUMN_DETECTION = 20;
const MIN_COLUMN_ITEM_SHARE = 0.15;
const GUTTER_SEARCH_MIN_RATIO = 0.28;
const GUTTER_SEARCH_MAX_RATIO = 0.72;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** 按纵坐标把文本项聚成行；同一行的项按横坐标排序。 */
function groupLines(items: PositionedTextItem[], tolerance: number): PositionedTextItem[][] {
  const lines: PositionedTextItem[][] = [];
  let current: PositionedTextItem[] = [];
  let anchor = Number.NEGATIVE_INFINITY;
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (!current.length || item.y - anchor <= tolerance) {
      if (!current.length) anchor = item.y;
      current.push(item);
    } else {
      lines.push(current);
      current = [item];
      anchor = item.y;
    }
  }
  if (current.length) lines.push(current);
  return lines.map((line) => [...line].sort((a, b) => a.x - b.x));
}

/** 行内按横向间距切分单元格；间距很小但存在时补一个空格。 */
function renderLine(line: PositionedTextItem[], cellGapRatio: number, fallbackCharWidth: number): string {
  let text = '';
  let previousEnd: number | null = null;
  let previousCharWidth = fallbackCharWidth;
  for (const item of line) {
    const charWidth = item.text.length ? item.width / [...item.text].length : previousCharWidth;
    if (previousEnd !== null) {
      const gap = item.x - previousEnd;
      const cellThreshold = Math.max(MIN_CELL_GAP, cellGapRatio * previousCharWidth);
      if (gap > cellThreshold) text += CELL_SEPARATOR;
      else if (gap > previousCharWidth * 0.25 && text && !/\s$/.test(text)) text += ' ';
    }
    text += item.text;
    previousEnd = item.x + item.width;
    if (charWidth > 0) previousCharWidth = charWidth;
  }
  return text.replace(/[ \t]+$/, '');
}

/**
 * 寻找贯穿整页的纵向留白：只有所有文本项都不跨越该区间时才判定为分栏。
 * 单栏简历中的居中标题、右对齐日期不会形成贯穿留白，因此不会误判。
 */
function detectGutter(items: PositionedTextItem[], pageWidth: number): number | null {
  if (items.length < MIN_ITEMS_FOR_COLUMN_DETECTION) return null;
  const spans = items
    .map((item): [number, number] => [item.x, item.x + item.width])
    .sort((a, b) => a[0] - b[0]);
  const gaps: Array<[number, number]> = [];
  let cursor = Number.NEGATIVE_INFINITY;
  for (const [start, end] of spans) {
    if (start > cursor) gaps.push([cursor === Number.NEGATIVE_INFINITY ? start : cursor, start]);
    cursor = Math.max(cursor, end);
  }
  const searchFrom = pageWidth * GUTTER_SEARCH_MIN_RATIO;
  const searchTo = pageWidth * GUTTER_SEARCH_MAX_RATIO;
  let best: [number, number] | null = null;
  for (const [start, end] of gaps) {
    const from = Math.max(start, searchFrom);
    const to = Math.min(end, searchTo);
    if (to - from < MIN_GUTTER_WIDTH) continue;
    if (!best || to - from > best[1] - best[0]) best = [from, to];
  }
  if (!best) return null;
  const middle = (best[0] + best[1]) / 2;
  const leftCount = items.filter((item) => item.x + item.width <= middle).length;
  const rightCount = items.filter((item) => item.x >= middle).length;
  if (leftCount < items.length * MIN_COLUMN_ITEM_SHARE) return null;
  if (rightCount < items.length * MIN_COLUMN_ITEM_SHARE) return null;
  return middle;
}

export function layoutPageText(items: PositionedTextItem[], options: LayoutTextOptions = {}): PageLayout {
  const usable = items.filter((item) =>
    item.text.trim() && Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.width));
  if (!usable.length) return { text: '', columnCount: 1 };

  const heights = usable.map((item) => item.height).filter((height) => height > 0);
  const fallbackHeight = median(heights) || 10;
  const tolerance = Math.max(2, fallbackHeight * (options.lineToleranceRatio ?? DEFAULT_LINE_TOLERANCE_RATIO));
  const cellGapRatio = options.cellGapRatio ?? DEFAULT_CELL_GAP_RATIO;
  const fallbackCharWidth = fallbackHeight / 2;
  const pageWidth = Math.max(...usable.map((item) => item.x + item.width));
  const render = (subset: PositionedTextItem[]): string =>
    groupLines(subset, tolerance)
      .map((line) => renderLine(line, cellGapRatio, fallbackCharWidth))
      .filter((line) => line.length)
      .join('\n');

  const gutter = detectGutter(usable, pageWidth);
  if (gutter === null) return { text: render(usable), columnCount: 1 };

  const left = usable.filter((item) => item.x < gutter);
  const right = usable.filter((item) => item.x >= gutter);
  const text = [
    LEFT_COLUMN_MARKER,
    render(left),
    '',
    RIGHT_COLUMN_MARKER,
    render(right),
  ].filter((part, index) => part.length || index === 2).join('\n');
  return { text, columnCount: 2 };
}
