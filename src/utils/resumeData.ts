import type { BasicInfo, ResumeData, ThemeConfig } from '@/types/resume';
import { generateId } from '@/utils/helpers';
import { parseAvatarShape } from '@/utils/avatarShape';
import { RECOMMENDED_FONT_FAMILY } from '@/utils/fonts';
import { readLayoutRecipe } from '@/utils/layout-template';

const DEFAULT_BASIC: BasicInfo = {
  name: '',
  title: '',
  email: '',
  phone: '',
};

export const DEFAULT_MODULE_MARGINS = { top: 0, bottom: 24, left: 0, right: 0 };
export const DEFAULT_SECTION_ORDER = ['experience', 'projects', 'education', 'skills'];
export const DEFAULT_SECTION_TITLES: ResumeData['sectionTitles'] = {
  experience: '工作经历',
  projects: '项目经验',
  education: '教育背景',
  skills: '技能证书',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export function createDefaultTheme(): ThemeConfig {
  return {
    color: '#2563eb',
    fontFamily: RECOMMENDED_FONT_FAMILY,
    fontSize: 14,
    lineHeight: 1.5,
    moduleMargins: { ...DEFAULT_MODULE_MARGINS },
    pageMargins: 24,
    dateFormat: 'YYYY.MM',
    displayIcons: true,
  };
}

/** 新建简历使用的完整默认数据。 */
export function createDefaultResumeData(): ResumeData {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    title: '我的简历',
    basic: { ...DEFAULT_BASIC },
    experiences: [],
    education: [],
    skills: [],
    projects: [],
    customBlocks: [],
    templateId: 'modern',
    theme: createDefaultTheme(),
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    hiddenSections: [],
    sectionTitles: { ...DEFAULT_SECTION_TITLES },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 按默认值补齐历史简历数据。
 *
 * 早期版本保存的简历、手工改写的 JSON、第三方导入或迁移过来的数据可能缺少
 * `theme`、`basic`、`sectionTitles` 等字段；模板直接读取 `data.theme.displayIcons`
 * 会抛出 “Cannot read properties of undefined”。读取存储、导入或迁移时先归一化，
 * 旧数据就能继续渲染，而不需要的字段保持原样。
 */
export function normalizeResumeData(source: unknown): ResumeData {
  const defaults = createDefaultResumeData();
  if (!isRecord(source)) return defaults;

  const input = source as Partial<ResumeData> & Record<string, unknown>;
  const { layout: rawLayout, ...inputWithoutLayout } = input;
  const layout = readLayoutRecipe(rawLayout);
  const theme: Record<string, unknown> = isRecord(input.theme) ? input.theme : {};
  const basic: Record<string, unknown> = isRecord(input.basic) ? input.basic : {};
  const margins: Record<string, unknown> = isRecord(theme.moduleMargins) ? theme.moduleMargins : {};
  const titles: Record<string, string> = isRecord(input.sectionTitles) ? input.sectionTitles as Record<string, string> : {};
  const fontFamily = theme.fontFamily;

  return {
    ...defaults,
    ...inputWithoutLayout,
    id: asString(input.id, defaults.id),
    title: asString(input.title, defaults.title),
    basic: {
      ...defaults.basic,
      ...(basic as Partial<BasicInfo>),
      // 可选外观字段：只保留白名单值，脏值当作未设置，交给渲染层回落到圆形。
      avatarShape: parseAvatarShape(basic.avatarShape),
    },
    experiences: asArray(input.experiences),
    education: asArray(input.education),
    skills: asArray(input.skills),
    projects: asArray(input.projects),
    customBlocks: asArray(input.customBlocks),
    templateId: asString(input.templateId, defaults.templateId),
    theme: {
      ...defaults.theme,
      ...(theme as Partial<ThemeConfig>),
      color: asString(theme.color, defaults.theme.color),
      // 旧版默认字体 'sans-serif' 已废弃，统一迁移到推荐字体。
      fontFamily: typeof fontFamily === 'string' && fontFamily && fontFamily !== 'sans-serif'
        ? fontFamily
        : defaults.theme.fontFamily,
      fontSize: isFiniteNumber(theme.fontSize) ? theme.fontSize : defaults.theme.fontSize,
      lineHeight: isFiniteNumber(theme.lineHeight) ? theme.lineHeight : defaults.theme.lineHeight,
      moduleMargins: {
        top: isFiniteNumber(margins.top) ? margins.top : defaults.theme.moduleMargins.top,
        bottom: isFiniteNumber(margins.bottom) ? margins.bottom : defaults.theme.moduleMargins.bottom,
        left: isFiniteNumber(margins.left) ? margins.left : defaults.theme.moduleMargins.left,
        right: isFiniteNumber(margins.right) ? margins.right : defaults.theme.moduleMargins.right,
      },
      pageMargins: isFiniteNumber(theme.pageMargins) ? theme.pageMargins : defaults.theme.pageMargins,
      dateFormat: asString(theme.dateFormat, defaults.theme.dateFormat),
      displayIcons: theme.displayIcons !== false,
    },
    sectionOrder: Array.isArray(input.sectionOrder) && input.sectionOrder.length
      ? [...(input.sectionOrder as string[])]
      : [...defaults.sectionOrder],
    hiddenSections: asArray(input.hiddenSections),
    sectionTitles: { ...defaults.sectionTitles, ...(titles as Record<string, string>) },
    createdAt: asString(input.createdAt, defaults.createdAt),
    updatedAt: asString(input.updatedAt, defaults.updatedAt),
    ...(layout ? { layout } : {}),
  };
}
