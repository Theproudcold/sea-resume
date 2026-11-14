import { describe, expect, it } from 'vitest';
import { CELL_SEPARATOR, LEFT_COLUMN_MARKER, RIGHT_COLUMN_MARKER, layoutPageText, type PositionedTextItem } from '../layoutText';

let lastItem: PositionedTextItem | null = null;

/** 用固定字宽构造文本项：charWidth 用于估算宽度，便于断言间距行为。 */
function item(text: string, x: number, y: number, options: { width?: number; height?: number; charWidth?: number } = {}): PositionedTextItem {
  const width = options.width ?? text.length * (options.charWidth ?? 10);
  lastItem = { text, x, y, width, height: options.height ?? 12 };
  return lastItem;
}

describe('layoutPageText', () => {
  it('joins items on the same line and keeps separate lines apart', () => {
    const layout = layoutPageText([
      item('于海波', 40, 40, { width: 30 }),
      item('Agent 应用开发工程师', 73, 42),
      item('杭州唐梨科技有限公司', 40, 70),
    ]);
    expect(layout.columnCount).toBe(1);
    expect(layout.text.split('\n')).toEqual(['于海波 Agent 应用开发工程师', '杭州唐梨科技有限公司']);
    expect(lastItem?.text).toBe('杭州唐梨科技有限公司');
  });

  it('converts a large horizontal gap into a cell separator instead of merging fields', () => {
    const layout = layoutPageText([
      item('公司', 40, 40, { width: 20, charWidth: 10 }),
      item('杭州唐梨科技有限公司', 300, 40),
    ]);
    expect(layout.text).toBe(`公司${CELL_SEPARATOR}杭州唐梨科技有限公司`);
  });

  it('orders lines top to bottom regardless of input order', () => {
    const layout = layoutPageText([
      item('第二行', 40, 80),
      item('第一行', 40, 40),
    ]);
    expect(layout.text).toBe('第一行\n第二行');
  });

  it('detects a two-column layout only when the gutter is empty across the page', () => {
    const sidebar = Array.from({ length: 12 }, (_, index) => item(`技能 ${index + 1}`, 40, 40 + index * 20, { width: 60 }));
    const body = Array.from({ length: 12 }, (_, index) => item(`正文内容 ${index + 1}`, 320, 40 + index * 20, { width: 200 }));
    const layout = layoutPageText([...sidebar, ...body]);
    expect(layout.columnCount).toBe(2);
    expect(layout.text.startsWith(LEFT_COLUMN_MARKER)).toBe(true);
    expect(layout.text).toContain(RIGHT_COLUMN_MARKER);
    const [left, right] = layout.text.split(RIGHT_COLUMN_MARKER);
    expect(left).toContain('技能 1');
    expect(left).not.toContain('正文内容 1');
    expect(right).toContain('正文内容 1');
  });

  it('keeps a single-column resume single-column when text crosses the middle', () => {
    const items = Array.from({ length: 12 }, (_, index) => item(`这是一段很长的项目描述文字 ${index + 1}`, 40, 40 + index * 20, { width: 420 }));
    expect(layoutPageText(items).columnCount).toBe(1);
  });

  it('ignores empty items and survives missing geometry', () => {
    const layout = layoutPageText([
      item('有效文本', 40, 40),
      { text: '   ', x: 0, y: 0, width: 0, height: 0 },
      { text: '坏坐标', x: Number.NaN, y: 10, width: 10, height: 10 },
    ]);
    expect(layout.text).toBe('有效文本');
  });
});
