import { describe, expect, it } from 'vitest';
import { estimateA4PageCount, getCompactThemeSettings } from '@/utils/pageFit';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';

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
});
