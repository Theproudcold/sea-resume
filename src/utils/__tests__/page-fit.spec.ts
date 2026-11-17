import { describe, expect, it } from 'vitest';
import {
  MAX_FIT_STEPS,
  MIN_FONT_SIZE,
  MIN_LINE_HEIGHT,
  MIN_MODULE_MARGIN_BOTTOM,
  MIN_PAGE_MARGINS,
  estimateA4PageCount,
  getCompactThemeSettings,
  nextFitStep,
} from '@/utils/pageFit';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import type { ThemeConfig } from '@/types/resume';

const baseTheme = parseResumeMarkdown('# Alex').resume.theme;

function themeWith(theme: Partial<ThemeConfig>): ThemeConfig {
  return { ...baseTheme, ...theme };
}

describe('A4 fit helpers', () => {
  it('estimates one or multiple pages at the A4 height boundary', () => {
    expect(estimateA4PageCount(1122, 1122.5)).toBe(1);
    expect(estimateA4PageCount(1124, 1122.5)).toBe(2);
    expect(estimateA4PageCount(0, 1123)).toBe(1);
    expect(estimateA4PageCount(2000, 0)).toBe(1);
  });
  it('recomputes the page estimate when measured resume content grows', () => {
    let measuredHeight = 900;
    const pageHeight = 1122.5;
    expect(estimateA4PageCount(measuredHeight, pageHeight)).toBe(1);
    measuredHeight = 1124;
    expect(estimateA4PageCount(measuredHeight, pageHeight)).toBe(2);
  });

  it('suggests compact theme values without modifying resume content or shrinking below 12px', () => {
    const theme = parseResumeMarkdown('# Alex').resume.theme;
    const compact = getCompactThemeSettings({
      ...theme,
      fontSize: 16,
      lineHeight: 1.7,
      pageMargins: 32,
      moduleMargins: { top: 16, bottom: 24, left: 8, right: 8 },
    });
    expect(compact).toEqual({
      fontSize: 12,
      lineHeight: 1.2,
      pageMargins: 12,
      moduleMargins: { top: 0, bottom: 4, left: 0, right: 0 },
    });
  });

  it('compacts from the largest user-settable values down to the floor', () => {
    const compact = getCompactThemeSettings(themeWith({
      fontSize: 18,
      lineHeight: 2,
      pageMargins: 60,
      moduleMargins: { top: 64, bottom: 64, left: 64, right: 64 },
    }));
    expect(compact).toEqual({
      fontSize: 12,
      lineHeight: 1.2,
      pageMargins: 12,
      moduleMargins: { top: 0, bottom: 4, left: 0, right: 0 },
    });
  });
});

describe('nextFitStep ladder', () => {
  it('tightens module margin, page margin, line height, then font size', () => {
    const first = nextFitStep(themeWith({
      fontSize: 16, lineHeight: 1.6, pageMargins: 24,
      moduleMargins: { top: 0, bottom: 16, left: 0, right: 0 },
    }));
    expect(first).toEqual({ moduleMargins: { top: 0, bottom: 12, left: 0, right: 0 } });

    const pageStep = nextFitStep(themeWith({
      fontSize: 16, lineHeight: 1.6, pageMargins: 24,
      moduleMargins: { top: 0, bottom: MIN_MODULE_MARGIN_BOTTOM, left: 0, right: 0 },
    }));
    expect(pageStep).toEqual({ pageMargins: 20 });

    const lineStep = nextFitStep(themeWith({
      fontSize: 16, lineHeight: 1.6, pageMargins: MIN_PAGE_MARGINS,
      moduleMargins: { top: 0, bottom: MIN_MODULE_MARGIN_BOTTOM, left: 0, right: 0 },
    }));
    expect(lineStep).toEqual({ lineHeight: 1.5 });

    const fontStep = nextFitStep(themeWith({
      fontSize: 16, lineHeight: MIN_LINE_HEIGHT, pageMargins: MIN_PAGE_MARGINS,
      moduleMargins: { top: 0, bottom: MIN_MODULE_MARGIN_BOTTOM, left: 0, right: 0 },
    }));
    expect(fontStep).toEqual({ fontSize: 15.5 });
  });

  it('returns null once every dimension sits on its floor', () => {
    expect(nextFitStep(themeWith({
      fontSize: MIN_FONT_SIZE,
      lineHeight: MIN_LINE_HEIGHT,
      pageMargins: MIN_PAGE_MARGINS,
      moduleMargins: { top: 0, bottom: MIN_MODULE_MARGIN_BOTTOM, left: 0, right: 0 },
    }))).toBeNull();
  });

  it('never emits a step below the floor for out-of-range or non-finite values', () => {
    const odd = themeWith({
      fontSize: Number.NaN,
      lineHeight: 0.5,
      pageMargins: -10,
      moduleMargins: { top: Number.NaN, bottom: -3, left: 0, right: 0 },
    });
    expect(nextFitStep(odd)).toBeNull();
  });

  it('walks the full ladder from the largest settable theme to the floor within the step cap', () => {
    let current = themeWith({
      fontSize: 18,
      lineHeight: 2,
      pageMargins: 60,
      moduleMargins: { top: 64, bottom: 64, left: 64, right: 64 },
    });
    const before = JSON.stringify(current);
    let steps = 0;
    for (let step = nextFitStep(current); step; step = nextFitStep(current)) {
      current = { ...current, ...step };
      steps += 1;
      expect(current.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
      expect(current.lineHeight).toBeGreaterThanOrEqual(MIN_LINE_HEIGHT);
      expect(current.pageMargins).toBeGreaterThanOrEqual(MIN_PAGE_MARGINS);
      expect(current.moduleMargins.bottom).toBeGreaterThanOrEqual(MIN_MODULE_MARGIN_BOTTOM);
    }

    // The cap must not truncate the ladder, or the UI would report "already at the
    // floor" while layout tokens still had room to tighten.
    expect(steps).toBeLessThan(MAX_FIT_STEPS);
    expect(steps).toBe(47);
    expect(current.fontSize).toBe(MIN_FONT_SIZE);
    expect(current.lineHeight).toBe(MIN_LINE_HEIGHT);
    expect(current.pageMargins).toBe(MIN_PAGE_MARGINS);
    expect(current.moduleMargins.bottom).toBe(MIN_MODULE_MARGIN_BOTTOM);
    // Resume text is untouched: the ladder only ever emits layout tokens.
    expect(nextFitStep(current)).toBeNull();
    expect(before).toContain('"fontSize":18');
  });

  it('keeps values that are already at or below the floor unchanged', () => {
    const already = themeWith({
      fontSize: MIN_FONT_SIZE,
      lineHeight: MIN_LINE_HEIGHT,
      pageMargins: MIN_PAGE_MARGINS,
      moduleMargins: { top: 0, bottom: MIN_MODULE_MARGIN_BOTTOM, left: 0, right: 0 },
    });
    const compact = getCompactThemeSettings(already);
    expect(compact.fontSize).toBe(MIN_FONT_SIZE);
    expect(compact.lineHeight).toBe(MIN_LINE_HEIGHT);
    expect(compact.pageMargins).toBe(MIN_PAGE_MARGINS);
    expect(compact.moduleMargins.bottom).toBe(MIN_MODULE_MARGIN_BOTTOM);
  });
});
