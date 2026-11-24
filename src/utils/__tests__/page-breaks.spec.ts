// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectContentBands, computePageBreaks, measureA4PageHeight } from '@/utils/pageBreaks';

/** jsdom 没有排版，A4 高度只能退回 96dpi 换算值。 */
const A4_HEIGHT = (297 * 96) / 25.4;

/**
 * 用真实 DOMRect：它的字段挂在原型上，`{...rect}` 会得到空对象。
 * 这正是曾经漏掉所有文本行盒的原因，用假对象测不出来。
 */
function rect(top: number, height: number, width = 700): DOMRect {
  return new DOMRect(0, top, width, height);
}

function stubRects(entries: Array<[Element, DOMRect]>): void {
  const map = new Map(entries);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return map.get(this) ?? rect(0, 0);
  });
}

function stubLineRects(rectsByCall: DOMRect[][]): () => void {
  const calls = [...rectsByCall];
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    writable: true,
    value: () => (calls.shift() ?? []) as unknown as DOMRectList,
  });
  return () => {
    Reflect.deleteProperty(Range.prototype, 'getClientRects');
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  Reflect.deleteProperty(Range.prototype, 'getClientRects');
});

describe('page break computation', () => {
  it('falls back to the A4 height when no content band blocks the cut', () => {
    expect(computePageBreaks({ contentHeight: 1122, pageHeight: 1122.5, bands: [] })).toEqual([1122]);
    expect(computePageBreaks({ contentHeight: 1124, pageHeight: 1122.5, bands: [] })).toEqual([1122.5, 1124]);
    expect(computePageBreaks({ contentHeight: 0, pageHeight: 1123, bands: [] })).toEqual([]);
    expect(computePageBreaks({ contentHeight: 2000, pageHeight: 0, bands: [] })).toEqual([2000]);
  });

  it('moves the break up to the gap above a line that would be cut in half', () => {
    const breaks = computePageBreaks({
      contentHeight: 2500,
      pageHeight: 1122.5,
      bands: [{ top: 1100, bottom: 1160 }],
    });
    expect(breaks).toEqual([1100, 2222.5, 2500]);
  });

  it('never cuts inside a content band and never lets a page exceed the paper height', () => {
    const bands = [
      { top: 0, bottom: 120 },
      { top: 118, bottom: 300 },
      { top: 940, bottom: 1010 },
      { top: 1200, bottom: 1500 },
      { top: 1950, bottom: 2100 },
    ];
    const breaks = computePageBreaks({ contentHeight: 2600, pageHeight: 1000, bands });
    expect(breaks).toEqual([940, 1940, 2600]);
    for (const [index, end] of breaks.entries()) {
      const start = index === 0 ? 0 : breaks[index - 1]!;
      expect(end).toBeGreaterThan(start);
      expect(end - start).toBeLessThanOrEqual(1000);
      for (const band of bands) {
        expect(end > band.top && end < band.bottom).toBe(false);
      }
    }
  });

  it('accepts a band edge as a cut so the line is pushed whole onto the next page', () => {
    // 行尾还有空隙：切在空隙里，这一行留在上一页。
    expect(computePageBreaks({ contentHeight: 1500, pageHeight: 1000, bands: [{ top: 960, bottom: 990 }] })).toEqual([1000, 1500]);
    // 行正好压在页缝上：切在行盒上边缘，整行挪到下一页，一样不切字。
    expect(computePageBreaks({ contentHeight: 1500, pageHeight: 1000, bands: [{ top: 960, bottom: 1010 }] })).toEqual([960, 1500]);
  });

  it('keeps filling pages when a band covers the whole page', () => {
    expect(computePageBreaks({ contentHeight: 2500, pageHeight: 1000, bands: [{ top: 0, bottom: 2600 }] })).toEqual([1000, 2000, 2500]);
  });

  it('ignores bands that end before the current page starts', () => {
    const breaks = computePageBreaks({
      contentHeight: 3400,
      pageHeight: 1000,
      bands: [{ top: 10, bottom: 40 }, { top: 2960, bottom: 3000 }],
    });
    expect(breaks[breaks.length - 1]).toBe(3400);
    for (const [index, end] of breaks.entries()) {
      const start = index === 0 ? 0 : breaks[index - 1]!;
      expect(end - start).toBeLessThanOrEqual(1000);
      expect(end > 2960 && end < 3000).toBe(false);
    }
  });
});

describe('A4 page height measurement', () => {
  it('falls back to the 96dpi value when the probe has no layout box', () => {
    expect(measureA4PageHeight()).toBeCloseTo(A4_HEIGHT, 5);
  });
});

describe('content band collection', () => {
  it('measures one band per text line and skips print-only markers', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>第一行</p><div class="no-print"><span>Page 2</span></div>';
    document.body.appendChild(root);
    const paragraph = root.querySelector('p')!;
    stubRects([[root, rect(100, 400)], [paragraph, rect(100, 40)]]);
    const restore = stubLineRects([[rect(100, 20), rect(130, 20)]]);

    const bands = collectContentBands(root, 1122.5);
    restore();

    expect(bands).toEqual([{ top: 0, bottom: 20 }, { top: 30, bottom: 50 }]);
  });

  it('expands text runs to their line boxes so a cut never lands in the leading', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>正文</p>';
    document.body.appendChild(root);
    const paragraph = root.querySelector('p')!;
    paragraph.style.lineHeight = '20px';
    stubRects([[root, rect(100, 400)]]);
    const restore = stubLineRects([[rect(200, 16)]]);

    const bands = collectContentBands(root, 1122.5);
    restore();

    // 内容区 16px、行高 20px：上方补满半个行距 2px，下方先放渲染余量、再留 2px 切缝。
    // 行盒总高 18px < 行距 20px，相邻两行之间才有可切的空隙。
    expect(bands).toEqual([{ top: 98, bottom: 116 }]);
  });

  it('reserves the renderer ink slack below each line', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>正文</p>';
    document.body.appendChild(root);
    const paragraph = root.querySelector('p')!;
    // 行距足够宽（30px）时才有真正的余量可分：封顶「行距 - 切缝」= 28px，
    // 上方补满半个行距 7px，下方先放 3.9px 字形余量，剩下的再补行距。
    paragraph.style.lineHeight = '30px';
    paragraph.style.fontSize = '13px';
    stubRects([[root, rect(100, 400)]]);
    const restore = stubLineRects([[rect(200, 16)]]);

    const bands = collectContentBands(root, 1122.5);
    restore();

    // 内容带坐标相对 root 顶边；root 顶边在 100，行内容区在 200，字框高 16。
    const glyphTop = 200 - 100;
    const glyphBottom = glyphTop + 16;
    const above = glyphTop - bands[0]!.top;
    const below = bands[0]!.bottom - glyphBottom;
    // 上方补满半个行距（30px 行距、16px 字框 → 7px）。
    expect(above).toBeCloseTo((30 - 16) / 2, 5);
    // 浏览器把字形画在内容区里，html2canvas 会低约 0.3em：下边缘因此还要多留余量。
    expect(below).toBeCloseTo(13 * 0.3, 5);
    // 余量不会无上限：行盒仍比行距短，相邻两行之间留得住切缝。
    expect(bands[0]!.bottom - bands[0]!.top).toBeLessThan(30);
  });

  it('never lets the ink slack close the gap to the next line', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>正文</p>';
    document.body.appendChild(root);
    const paragraph = root.querySelector('p')!;
    // 行距紧到只剩 2px 富余：余量必须让位，行盒不能长到行距。
    paragraph.style.lineHeight = '18px';
    paragraph.style.fontSize = '16px';
    stubRects([[root, rect(100, 400)]]);
    const restore = stubLineRects([[rect(200, 16), rect(218, 16)]]);

    const bands = collectContentBands(root, 1122.5);
    restore();

    expect(bands).toHaveLength(2);
    expect(bands[1]!.top - bands[0]!.bottom).toBeGreaterThanOrEqual(2 - 1e-6);
  });

  /**
   * 真实编辑器里量到的正文几何：font-size 13px、line-height 20.8px（1.6）、
   * Range 行内容区 15.5px，相邻行间距 11.6px。
   */
  function paragraphOfLines(count: number): DOMRect[] {
    const PITCH = 20.8;
    const GLYPH = 15.5;
    const firstTop = 200;
    return Array.from({ length: count }, (_, index) => rect(firstTop + index * PITCH, GLYPH));
  }

  it('keeps the gap between consecutive lines cuttable instead of merging them into one band', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>正文</p>';
    document.body.appendChild(root);
    const paragraph = root.querySelector('p')!;
    paragraph.style.lineHeight = '20.8px';
    paragraph.style.fontSize = '13px';
    stubRects([[root, rect(100, 400)]]);
    const restore = stubLineRects([paragraphOfLines(4)]);

    const bands = collectContentBands(root, 1122.5);
    restore();

    // 每行一段内容带：切点只能落在行与行之间的空隙里。
    expect(bands).toHaveLength(4);
    // 相邻两行之间必须留出空隙，而不是首尾相接并成一条长带。
    expect(bands[1]!.top - bands[0]!.bottom).toBeGreaterThanOrEqual(2 - 1e-6);
    // 行距 20.8px 里必须留出可切的空隙，而不是被上下补边和渲染余量吃光。
    expect(bands[1]!.bottom - bands[1]!.top).toBeLessThan(20.8);
  });

  it('still finds a cut between lines when a page ends in the middle of a paragraph', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>正文</p>';
    document.body.appendChild(root);
    const paragraph = root.querySelector('p')!;
    paragraph.style.lineHeight = '20.8px';
    paragraph.style.fontSize = '13px';
    paragraph.style.margin = '0';
    stubRects([[root, rect(0, 400)]]);
    const restore = stubLineRects([paragraphOfLines(120)]);

    const bands = collectContentBands(root, 1122.5);
    restore();

    const contentHeight = 200 + 120 * 20.8;
    const breaks = computePageBreaks({ contentHeight, pageHeight: 1122.5, bands });
    // 旧实现把整段并成一条内容带，只能退到段首：第一页只剩 0~200px，后面按页高硬切。
    // 修复后第一页要装满到接近页底，且每个切点都落在两行之间。
    expect(breaks[0]).toBeGreaterThan(1100);
    expect(breaks[0]).toBeLessThanOrEqual(1122.5 + 1e-6);
    for (const [index, end] of breaks.slice(0, -1).entries()) {
      const start = index === 0 ? 0 : breaks[index - 1]!;
      expect(end - start).toBeLessThanOrEqual(1122.5 + 1e-6);
      expect(end > 200 && end < contentHeight).toBe(true);
      // 切点不能落在任何一行的行盒内部。
      for (const band of bands) expect(end > band.top + 1e-6 && end < band.bottom - 1e-6).toBe(false);
    }
  });

  it('falls back to whole blocks and keeps replaced elements when line rects are unavailable', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>正文</p><img src="avatar.png"><div class="no-print"><span>Page 2</span></div>';
    document.body.appendChild(root);
    const paragraph = root.querySelector('p')!;
    const image = root.querySelector('img')!;
    stubRects([[root, rect(50, 400)], [paragraph, rect(60, 30)], [image, rect(400, 112)]]);

    expect(collectContentBands(root, 1122.5)).toEqual([
      { top: 10, bottom: 40 },
      { top: 350, bottom: 462 },
    ]);
  });

  it('reserves decorated boxes but lets page-sized backgrounds be cut', () => {
    const root = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = '工作经历';
    title.style.borderBottom = '1.5px solid rgb(36, 52, 71)';
    const backdrop = document.createElement('div');
    backdrop.style.height = '2000px';
    backdrop.style.backgroundColor = 'rgb(250, 250, 250)';
    root.append(title, backdrop);
    document.body.appendChild(root);
    stubRects([[root, rect(0, 2000)], [title, rect(10, 24)], [backdrop, rect(40, 2000)]]);

    expect(collectContentBands(root, 1122.5)).toEqual([{ top: 10, bottom: 34 }]);
  });
});
