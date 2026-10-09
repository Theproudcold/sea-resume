import type { ThemeConfig } from '@/types/resume';

export function estimateA4PageCount(contentHeight: number, pageHeight: number): number {
  if (!Number.isFinite(contentHeight) || !Number.isFinite(pageHeight) || pageHeight <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, contentHeight - 1) / pageHeight));
}

/** Compact only layout tokens; never alters or truncates resume text. */
export function getCompactThemeSettings(theme: ThemeConfig): Pick<ThemeConfig, 'fontSize' | 'lineHeight' | 'pageMargins' | 'moduleMargins'> {
  return {
    fontSize: Math.max(12, Math.min(theme.fontSize, 12)),
    lineHeight: Math.max(1.1, Math.min(theme.lineHeight, 1.2)),
    pageMargins: Math.min(theme.pageMargins, 12),
    moduleMargins: {
      top: Math.min(theme.moduleMargins.top, 0),
      bottom: Math.max(0, Math.min(theme.moduleMargins.bottom, 4)),
      left: Math.min(theme.moduleMargins.left, 0),
      right: Math.min(theme.moduleMargins.right, 0),
    },
  };
}
