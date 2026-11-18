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

    // 内容区 16px，行高 20px：上下各补 2px，切点才不会落进其实还有字形的行距里。
    expect(bands).toEqual([{ top: 98, bottom: 118 }]);
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
