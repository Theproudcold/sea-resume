import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasUnsupportedColorFunction,
  normalizeCaptureColors,
  prepareResumeCapture,
  replaceUnsupportedColors,
} from '@/utils/capture-colors';

describe('modern CSS color normalization for html2canvas', () => {
  it('converts achromatic oklch() to rgb()', () => {
    expect(replaceUnsupportedColors('oklch(0 0 0)')).toBe('rgb(0, 0, 0)');
    expect(replaceUnsupportedColors('oklch(0.5 0 0)')).toBe('rgb(99, 99, 99)');
    expect(replaceUnsupportedColors('oklch(1 0 0)')).toBe('rgb(255, 255, 255)');
  });

  it('accepts percentage lightness and chroma tokens', () => {
    expect(replaceUnsupportedColors('oklch(50% 0 0)')).toBe(replaceUnsupportedColors('oklch(0.5 0 0)'));
  });

  it('keeps the alpha channel', () => {
    expect(replaceUnsupportedColors('oklch(0.5 0 0 / 0.5)')).toBe('rgba(99, 99, 99, 0.5)');
    expect(replaceUnsupportedColors('oklch(0.5 0 0 / 50%)')).toBe('rgba(99, 99, 99, 0.5)');
  });

  it('converts oklab() and color(srgb ...)', () => {
    expect(replaceUnsupportedColors('oklab(0.5 0 0)')).toBe('rgb(99, 99, 99)');
    expect(replaceUnsupportedColors('color(srgb 1 0 0)')).toBe('rgb(255, 0, 0)');
    expect(replaceUnsupportedColors('color(srgb 0 0 1 / 0.25)')).toBe('rgba(0, 0, 255, 0.25)');
  });

  it('converts colors embedded in box-shadow and gradients', () => {
    expect(replaceUnsupportedColors('0px 12px 32px -12px oklch(21% 0.028 262 / 0.24)'))
      .toMatch(/^0px 12px 32px -12px rgba\(\d+, \d+, \d+, 0\.24\)$/);

    const gradient = replaceUnsupportedColors('repeating-linear-gradient(to right, oklch(52% 0.19 27) 0, oklch(52% 0.19 27) 5px)');
    expect(gradient).not.toContain('oklch');
    expect(gradient).toContain('rgb(');
  });

  it('leaves colors html2canvas already supports untouched', () => {
    for (const value of ['rgb(1, 2, 3)', 'rgba(1, 2, 3, 0.5)', '#abc', '#aabbccdd', 'red', 'transparent']) {
      expect(replaceUnsupportedColors(value)).toBe(value);
    }
    expect(replaceUnsupportedColors('1px solid #d9dee3')).toBe('1px solid #d9dee3');
  });

  it('detects unsupported color functions without false positives', () => {
    expect(hasUnsupportedColorFunction('oklch(52% 0.19 258)')).toBe(true);
    expect(hasUnsupportedColorFunction('color-mix(in oklab, red 50%, blue)')).toBe(true);
    expect(hasUnsupportedColorFunction('oklab(0.5 0 0)')).toBe(true);
    expect(hasUnsupportedColorFunction('rgb(1, 2, 3)')).toBe(false);
    expect(hasUnsupportedColorFunction('#123456')).toBe(false);
    expect(hasUnsupportedColorFunction('var(--color-ink)')).toBe(false);
    expect(hasUnsupportedColorFunction('1px solid currentColor')).toBe(false);
  });

  it('converts every oklch token declared in the design tokens', () => {
    const tokensCss = readFileSync('src/styles/tokens.css', 'utf8');
    const declared = tokensCss.match(/oklch\([^)]*\)/g) ?? [];

    expect(declared.length).toBeGreaterThan(0);
    for (const token of declared) {
      const converted = replaceUnsupportedColors(token);
      expect(converted, token).toMatch(/^rgba?\(\d+, \d+, \d+(, [\d.]+)?\)$/);
      expect(hasUnsupportedColorFunction(converted), token).toBe(false);
    }
  });

  /**
   * jsdom 没有真实 canvas 颜色引擎（HTMLCanvasElement.getContext 返回 null），
   * 所以这里按 Chrome 的真实语义打桩，覆盖那些必须走浏览器回退分支的颜色函数。
   *
   * 关键点：Chrome 的 fillStyle setter 会原样回读 lab()/oklab()/color() 等现代颜色函数，
   * 不做 sRGB 转换；只有 getImageData 才会真正落到 sRGB 像素。
   */
  describe('canvas fallback for functions without a local formula', () => {
    const CHROME_COMPUTED: Record<string, string> = {
      'lab(50 40 30)': 'rgb(187, 88, 70)',
      'lab(50% 40 30)': 'rgb(187, 88, 70)',
      'lch(52% 60 40)': 'rgb(202, 86, 61)',
      'hwb(194 0% 0%)': 'rgb(0, 195, 255)',
      'color-mix(in oklab, red 50%, blue)': 'rgb(140, 83, 162)',
      'lab(50 40 30 / 0.24)': 'rgba(187, 88, 70, 0.24)',
    };

    beforeEach(() => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
        this: HTMLCanvasElement,
      ) {
        let painted = '#123456';
        return {
          // Chrome 原样回读现代颜色函数，不做转换。
          set fillStyle(value: string) {
            painted = String(value);
          },
          get fillStyle() {
            return painted;
          },
          fillRect: () => {},
          clearRect: () => {},
          getImageData: () => {
            const resolved = CHROME_COMPUTED[painted];
            if (!resolved) throw new Error(`unresolvable color: ${painted}`);
            const [r, g, b] = resolved.match(/\d+/g)!.map(Number);
            const alpha = /rgba\([^)]*,\s*([\d.]+)\)/.exec(resolved);
            const a = alpha ? Math.round(Number(alpha[1]) * 255) : 255;
            return { data: new Uint8ClampedArray([r!, g!, b!, a]) };
          },
        } as unknown as CanvasRenderingContext2D;
      });
      vi.stubGlobal('CSS', { supports: () => true });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('resolves lab(), lch() and hwb() instead of leaking them to html2canvas', () => {
      for (const [input, expected] of Object.entries(CHROME_COMPUTED)) {
        if (input.startsWith('color-mix')) continue;
        const converted = replaceUnsupportedColors(input);
        const [er, eg, eb] = expected.match(/\d+/g)!.map(Number);
        expect(converted, input).toMatch(new RegExp(`^rgba?\\(${er}, ${eg}, ${eb}(, [\\d.]+)?\\)$`));
        expect(hasUnsupportedColorFunction(converted), input).toBe(false);
      }
    });

    it('resolves a color-mix() value to sRGB', () => {
      const converted = replaceUnsupportedColors('color-mix(in oklab, red 50%, blue)');
      expect(converted).toBe('rgb(140, 83, 162)');
      expect(hasUnsupportedColorFunction(converted)).toBe(false);
    });

    it('keeps lab() colors embedded in box-shadow parseable', () => {
      const converted = replaceUnsupportedColors('0px 12px 32px -12px lab(50 40 30 / 0.24)');
      expect(converted).not.toContain('lab(');
      expect(converted).toContain('rgba(');
    });
  });
});

describe('normalizeCaptureColors', () => {
  const cleanups: HTMLElement[] = [];

  afterEach(() => {
    cleanups.splice(0).forEach((element) => element.remove());
  });

  it('rewrites computed oklch colors in the cloned subtree', () => {
    const root = document.createElement('div');
    root.style.setProperty('color', 'oklch(0.5 0 0)');
    root.style.setProperty('box-shadow', '0 1px 2px oklch(21% 0.028 262 / 0.06)');
    const child = document.createElement('span');
    child.style.setProperty('color', 'oklch(0 0 0)');
    root.appendChild(child);
    document.body.appendChild(root);
    cleanups.push(root);

    normalizeCaptureColors(document, root);

    expect(root.style.getPropertyValue('color')).toBe('rgb(99, 99, 99)');
    expect(root.style.getPropertyValue('box-shadow')).not.toContain('oklch');
    expect(root.style.getPropertyValue('box-shadow')).toContain('rgba(');
    expect(child.style.getPropertyValue('color')).toBe('rgb(0, 0, 0)');
  });

  it('rewrites oklch values declared through CSS custom properties', () => {
    const root = document.createElement('div');
    root.style.setProperty('--brand', 'oklch(0.5 0 0)');
    const child = document.createElement('span');
    child.style.setProperty('color', 'var(--brand)');
    root.appendChild(child);
    document.body.appendChild(root);
    cleanups.push(root);

    normalizeCaptureColors(document, root);

    expect(root.style.getPropertyValue('--brand')).toBe('rgb(99, 99, 99)');
  });

  it('leaves already parseable colors untouched', () => {
    const root = document.createElement('div');
    root.style.setProperty('color', 'rgb(1, 2, 3)');
    document.body.appendChild(root);
    cleanups.push(root);

    normalizeCaptureColors(document, root);

    expect(root.style.getPropertyValue('color')).toBe('rgb(1, 2, 3)');
  });

  it('drops the screen dark class before reading capture colors', () => {
    document.documentElement.classList.add('dark');
    const root = document.createElement('div');
    document.body.appendChild(root);
    cleanups.push(root);

    prepareResumeCapture(document, root);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
