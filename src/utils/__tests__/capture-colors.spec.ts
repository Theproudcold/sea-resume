import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
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
