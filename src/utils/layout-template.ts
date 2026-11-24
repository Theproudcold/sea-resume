import { generateId } from '@/utils/helpers';
import { RECOMMENDED_FONT_FAMILY } from '@/utils/fonts';
import type {
  LayoutDateFormat,
  LayoutHeader,
  LayoutRecipe,
  LayoutSeedId,
  LayoutStructure,
  SavedRecipe,
  SavedRecipeFile,
  LayoutTokens,
} from '@/types/layout-template';
import { LAYOUT_SCHEMA_VERSION } from '@/types/layout-template';
import type { ResumeData, ThemeConfig } from '@/types/resume';

export const LAYOUT_TEMPLATE_PREFIX = 'layout:';
export const LAYOUT_TEMPLATE_LIMIT = 30;
export const LAYOUT_TEMPLATE_MAX_CHARS = 16_000;
export const LAYOUT_NAME_MAX = 40;
export const LAYOUT_DESCRIPTION_MAX = 120;
export const LAYOUT_FILE_KIND = 'sea-resume-layout';

const SIDEBAR_WIDTH_MIN = 24;
const SIDEBAR_WIDTH_MAX = 42;
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 18;
const LINE_HEIGHT_MIN = 1;
const LINE_HEIGHT_MAX = 2;
const PAGE_MARGIN_MAX = 60;
const MODULE_MARGIN_MAX = 64;
const SECTION_ID_MAX = 80;
const SIDEBAR_SECTION_LIMIT = 12;

/** 与 custom-template 的内置 id 保持一致。这里单独写是为了避免和内容模板工具互相引用。 */
const BUILTIN_LAYOUT_SEED_IDS = [
  'modern', 'professional', 'creative', 'minimal', 'tech', 'ai-agent',
  'classic', 'editorial', 'engineer', 'executive', 'campus',
] as const satisfies readonly LayoutSeedId[];

export function isLayoutSeedId(value: string): value is LayoutSeedId {
  return (BUILTIN_LAYOUT_SEED_IDS as readonly string[]).includes(value);
}

const STRUCTURES = ['single', 'sidebar-left', 'sidebar-right'] as const;
const HEADER_VARIANTS = ['inline', 'banner', 'stacked'] as const;
const HEADER_ALIGNS = ['start', 'center'] as const;
const AVATAR_PLACEMENTS = ['start', 'end', 'none'] as const;
const HEADING_STYLES = ['underline', 'accent', 'plain'] as const;
const SUMMARY_PLACEMENTS = ['main', 'sidebar', 'hidden'] as const;
const CONTACTS_PLACEMENTS = ['header', 'sidebar'] as const;
const PAPER_TONES = ['light', 'dark'] as const;
const DATE_FORMATS = ['YYYY.MM', 'YYYY-MM', 'YYYY/MM', 'MM/YYYY', 'MMM YYYY'] as const;
const FILLS = ['none', 'accent'] as const;
const REGIONS = ['main', 'sidebar'] as const;

const FONT_FAMILIES = [
  RECOMMENDED_FONT_FAMILY,
  'sans-serif',
  'serif',
  'monospace',
] as const;

const LIGHT_INK = '#1f2937';
const LIGHT_MUTED = '#64748b';
const DARK_INK = '#d7dee6';
const DARK_MUTED = '#9aa6b2';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function hexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function bounded(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function sectionId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= SECTION_ID_MAX && !value.includes(' ');
}

function readTokens(value: unknown): LayoutTokens | null {
  if (!isRecord(value) || !isRecord(value.moduleMargins)) return null;
  const margins = value.moduleMargins;
  const dateFormat = value.dateFormat;
  if (
    !hexColor(value.accent)
    || !hexColor(value.ink)
    || !hexColor(value.muted)
    || !oneOf(value.fontFamily, FONT_FAMILIES)
    || !bounded(value.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX)
    || !bounded(value.lineHeight, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX)
    || !bounded(value.pageMargins, 0, PAGE_MARGIN_MAX)
    || !bounded(margins.top, 0, MODULE_MARGIN_MAX)
    || !bounded(margins.bottom, 0, MODULE_MARGIN_MAX)
    || !bounded(margins.left, 0, MODULE_MARGIN_MAX)
    || !bounded(margins.right, 0, MODULE_MARGIN_MAX)
    || !oneOf(dateFormat, DATE_FORMATS)
    || typeof value.displayIcons !== 'boolean'
  ) return null;
  return {
    accent: value.accent,
    ink: value.ink,
    muted: value.muted,
    fontFamily: value.fontFamily,
    fontSize: value.fontSize,
    lineHeight: value.lineHeight,
    pageMargins: value.pageMargins,
    moduleMargins: {
      top: margins.top,
      bottom: margins.bottom,
      left: margins.left,
      right: margins.right,
    },
    dateFormat,
    displayIcons: value.displayIcons,
  };
}

function readHeader(value: unknown): LayoutHeader | null {
  if (!isRecord(value)) return null;
  if (
    !oneOf(value.variant, HEADER_VARIANTS)
    || !oneOf(value.align, HEADER_ALIGNS)
    || !oneOf(value.avatar, AVATAR_PLACEMENTS)
    || !oneOf(value.fill, FILLS)
  ) return null;
  return { variant: value.variant, align: value.align, avatar: value.avatar, fill: value.fill };
}

/**
 * 严格读一份版式。多一个字段、错一个枚举、颜色不是 #RRGGBB，都返回 null。
 * 调用方决定是丢掉（读简历）还是拒绝（导入文件、AI 操作）。
 */
export function readLayoutRecipe(value: unknown): LayoutRecipe | null {
  if (!isRecord(value)) return null;
  const allowed = new Set([
    'schemaVersion', 'seedId', 'structure', 'sidebarWidth', 'sidebarSections',
    'customBlockRegion', 'summaryPlacement', 'contactsPlacement', 'header', 'heading', 'paper', 'tokens',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  if (value.schemaVersion !== LAYOUT_SCHEMA_VERSION) return null;
  if (value.seedId !== undefined && (typeof value.seedId !== 'string' || !isLayoutSeedId(value.seedId))) return null;
  if (!oneOf(value.structure, STRUCTURES)) return null;
  if (!bounded(value.sidebarWidth, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX)) return null;
  if (
    !Array.isArray(value.sidebarSections)
    || value.sidebarSections.length > SIDEBAR_SECTION_LIMIT
    || value.sidebarSections.some((id) => !sectionId(id))
    || new Set(value.sidebarSections).size !== value.sidebarSections.length
  ) return null;
  if (!oneOf(value.customBlockRegion, REGIONS)) return null;
  if (!oneOf(value.summaryPlacement, SUMMARY_PLACEMENTS)) return null;
  if (!oneOf(value.contactsPlacement, CONTACTS_PLACEMENTS)) return null;
  const header = readHeader(value.header);
  const tokens = readTokens(value.tokens);
  if (!header || !tokens) return null;
  if (!oneOf(value.heading, HEADING_STYLES)) return null;
  if (!oneOf(value.paper, PAPER_TONES)) return null;
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    ...(typeof value.seedId === 'string' ? { seedId: value.seedId } : {}),
    structure: value.structure,
    sidebarWidth: value.sidebarWidth,
    sidebarSections: [...value.sidebarSections],
    customBlockRegion: value.customBlockRegion,
    summaryPlacement: value.summaryPlacement,
    contactsPlacement: value.contactsPlacement,
    header,
    heading: value.heading,
    paper: value.paper,
    tokens,
  };
}

export function savedRecipeId(id: string): string {
  return `${LAYOUT_TEMPLATE_PREFIX}${id}`;
}

export function isSavedRecipeId(value: string): boolean {
  return value.startsWith(LAYOUT_TEMPLATE_PREFIX) && value.length > LAYOUT_TEMPLATE_PREFIX.length;
}

/** 渲染入口：合法配方优先于 templateId。没有配方才按内置 id 走旧组件。 */
export function effectiveLayout(data: { templateId?: string; layout?: unknown }): LayoutRecipe | null {
  return readLayoutRecipe(data.layout);
}

function tokensFromTheme(theme: ThemeConfig, paper: LayoutRecipe['paper'], accent: string): LayoutTokens {
  const fontFamily = (FONT_FAMILIES as readonly string[]).includes(theme.fontFamily)
    ? theme.fontFamily
    : RECOMMENDED_FONT_FAMILY;
  const dateFormat = (DATE_FORMATS as readonly string[]).includes(theme.dateFormat)
    ? theme.dateFormat as LayoutDateFormat
    : 'YYYY.MM';
  const clamp = (value: number, min: number, max: number, fallback: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return {
    accent: hexColor(accent) ? accent : '#2563eb',
    ink: paper === 'dark' ? DARK_INK : LIGHT_INK,
    muted: paper === 'dark' ? DARK_MUTED : LIGHT_MUTED,
    fontFamily,
    fontSize: clamp(theme.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX, 14),
    lineHeight: clamp(theme.lineHeight, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX, 1.5),
    pageMargins: clamp(theme.pageMargins, 0, PAGE_MARGIN_MAX, 24),
    moduleMargins: {
      top: clamp(theme.moduleMargins?.top ?? 0, 0, MODULE_MARGIN_MAX, 0),
      bottom: clamp(theme.moduleMargins?.bottom ?? 24, 0, MODULE_MARGIN_MAX, 24),
      left: clamp(theme.moduleMargins?.left ?? 0, 0, MODULE_MARGIN_MAX, 0),
      right: clamp(theme.moduleMargins?.right ?? 0, 0, MODULE_MARGIN_MAX, 0),
    },
    dateFormat,
    displayIcons: theme.displayIcons !== false,
  };
}

function baseRecipe(theme: ThemeConfig, accent: string, paper: LayoutRecipe['paper'] = 'light'): Omit<LayoutRecipe, 'structure' | 'sidebarSections' | 'header' | 'heading' | 'summaryPlacement' | 'contactsPlacement'> {
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    sidebarWidth: 32,
    customBlockRegion: 'main',
    paper,
    tokens: tokensFromTheme(theme, paper, accent),
  };
}

/**
 * 六套内置模板的可编辑种子。它描述结构，不承诺和对应 Vue 文件像素级一致。
 * 从内置模板点「基于当前模板自定义」会立刻改走统一渲染器，界面需要说明这一点。
 */
export function builtinToRecipe(id: LayoutSeedId, theme: ThemeConfig): LayoutRecipe {
  const accent = hexColor(theme.color) ? theme.color : '#2563eb';
  if (id === 'professional') {
    return {
      ...baseRecipe(theme, accent),
      seedId: id,
      structure: 'sidebar-left',
      sidebarSections: ['education', 'skills'],
      summaryPlacement: 'sidebar',
      contactsPlacement: 'sidebar',
      header: { variant: 'inline', align: 'start', avatar: 'end', fill: 'none' },
      heading: 'underline',
    };
  }
  if (id === 'minimal') {
    return {
      ...baseRecipe(theme, accent),
      seedId: id,
      structure: 'single',
      sidebarSections: [],
      summaryPlacement: 'main',
      contactsPlacement: 'header',
      header: { variant: 'stacked', align: 'start', avatar: 'none', fill: 'none' },
      heading: 'plain',
    };
  }
  if (id === 'creative') {
    return {
      ...baseRecipe(theme, accent),
      seedId: id,
      structure: 'single',
      sidebarSections: [],
      summaryPlacement: 'main',
      contactsPlacement: 'header',
      header: { variant: 'banner', align: 'start', avatar: 'end', fill: 'accent' },
      heading: 'accent',
    };
  }
  if (id === 'tech') {
    return {
      ...baseRecipe(theme, accent, 'dark'),
      seedId: id,
      structure: 'single',
      sidebarSections: [],
      summaryPlacement: 'main',
      contactsPlacement: 'header',
      header: { variant: 'inline', align: 'start', avatar: 'end', fill: 'none' },
      heading: 'plain',
    };
  }
  if (id === 'ai-agent') {
    return {
      ...baseRecipe(theme, accent),
      seedId: id,
      structure: 'single',
      sidebarSections: [],
      summaryPlacement: 'main',
      contactsPlacement: 'header',
      header: { variant: 'inline', align: 'start', avatar: 'start', fill: 'none' },
      heading: 'underline',
    };
  }
  if (id === 'classic') {
    return {
      ...baseRecipe(theme, accent),
      seedId: id,
      structure: 'single',
      sidebarSections: [],
      summaryPlacement: 'main',
      contactsPlacement: 'header',
      header: { variant: 'stacked', align: 'center', avatar: 'none', fill: 'none' },
      heading: 'underline',
    };
  }
  if (id === 'editorial') {
    return {
      ...baseRecipe(theme, accent),
      seedId: id,
      structure: 'sidebar-right',
      sidebarWidth: 34,
      sidebarSections: ['skills', 'education'],
      summaryPlacement: 'sidebar',
      contactsPlacement: 'header',
      header: { variant: 'inline', align: 'start', avatar: 'end', fill: 'none' },
      heading: 'accent',
    };
  }
  if (id === 'engineer') {
    return {
      ...baseRecipe(theme, accent),
      seedId: id,
      structure: 'single',
      sidebarSections: [],
      summaryPlacement: 'main',
      contactsPlacement: 'header',
      header: { variant: 'inline', align: 'start', avatar: 'end', fill: 'none' },
      heading: 'accent',
    };
  }
  if (id === 'executive') {
    return {
      ...baseRecipe(theme, accent),
      seedId: id,
      structure: 'single',
      sidebarSections: [],
      summaryPlacement: 'main',
      contactsPlacement: 'header',
      header: { variant: 'inline', align: 'start', avatar: 'end', fill: 'none' },
      heading: 'underline',
    };
  }
  if (id === 'campus') {
    return {
      ...baseRecipe(theme, accent),
      seedId: id,
      structure: 'single',
      sidebarSections: [],
      summaryPlacement: 'main',
      contactsPlacement: 'header',
      header: { variant: 'inline', align: 'start', avatar: 'start', fill: 'none' },
      heading: 'accent',
    };
  }
  return {
    ...baseRecipe(theme, accent),
    seedId: 'modern',
    structure: 'single',
    sidebarSections: [],
    summaryPlacement: 'main',
    contactsPlacement: 'header',
    header: { variant: 'inline', align: 'start', avatar: 'end', fill: 'none' },
    heading: 'underline',
  };
}

/** 当前简历已经有合法版式就用它；否则按内置模板生成种子，未知 id 用现代简约。 */
export function recipeForResume(resume: ResumeData): LayoutRecipe {
  const current = readLayoutRecipe(resume.layout);
  if (current) return current;
  const seed = isLayoutSeedId(resume.templateId) ? resume.templateId : 'modern';
  return builtinToRecipe(seed, resume.theme);
}

/** 另存时结构取当前版式，token 取当前主题，这样滑块改过的字号不会被种子默认值盖回去。 */
export function recipeFromCurrent(resume: ResumeData): LayoutRecipe {
  return layoutWithVisibleTheme(recipeForResume(resume), resume.theme);
}

/** 保留版式自己的墨色，只把当前主题里看得见的字号、边距和强调色盖进去。预览读 theme，不读这里写回去的 tokens。 */
export function layoutWithVisibleTheme(recipe: LayoutRecipe, theme: ThemeConfig): LayoutRecipe {
  const visible = tokensFromTheme(theme, recipe.paper, theme.color);
  return {
    ...recipe,
    tokens: {
      ...recipe.tokens,
      accent: visible.accent,
      fontFamily: visible.fontFamily,
      fontSize: visible.fontSize,
      lineHeight: visible.lineHeight,
      pageMargins: visible.pageMargins,
      moduleMargins: { ...visible.moduleMargins },
      dateFormat: visible.dateFormat,
      displayIcons: visible.displayIcons,
    },
  };
}

export function themeFromRecipe(recipe: LayoutRecipe): ThemeConfig {
  return {
    color: recipe.tokens.accent,
    fontFamily: recipe.tokens.fontFamily,
    fontSize: recipe.tokens.fontSize,
    lineHeight: recipe.tokens.lineHeight,
    pageMargins: recipe.tokens.pageMargins,
    moduleMargins: { ...recipe.tokens.moduleMargins },
    dateFormat: recipe.tokens.dateFormat,
    displayIcons: recipe.tokens.displayIcons,
  };
}

export function normalizeLayoutName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new Error('请填写版式名称。');
  if (trimmed.length > LAYOUT_NAME_MAX) throw new Error(`版式名称不能超过 ${LAYOUT_NAME_MAX} 个字。`);
  return trimmed;
}

export function normalizeLayoutDescription(description?: string): string {
  const trimmed = (description ?? '').trim().replace(/\s+/g, ' ');
  if (trimmed.length > LAYOUT_DESCRIPTION_MAX) {
    throw new Error(`版式说明不能超过 ${LAYOUT_DESCRIPTION_MAX} 个字。`);
  }
  return trimmed;
}

export function buildSavedRecipe(
  recipe: LayoutRecipe,
  input: { name: string; description?: string },
  options: { id?: string; now?: number } = {},
): SavedRecipe {
  const stored = readLayoutRecipe(recipe);
  if (!stored) throw new Error('这份版式无法保存。请检查栏数、颜色和模块分区。');
  const now = options.now ?? Date.now();
  const template: SavedRecipe = {
    id: options.id ?? generateId(),
    name: normalizeLayoutName(input.name),
    description: normalizeLayoutDescription(input.description),
    createdAt: now,
    updatedAt: now,
    recipe: stored,
  };
  if (JSON.stringify(template).length > LAYOUT_TEMPLATE_MAX_CHARS) {
    throw new Error('这份版式太大，无法保存。');
  }
  return template;
}

export function savedRecipeToMetadata(template: SavedRecipe) {
  const structureLabel: Record<LayoutStructure, string> = {
    single: '单栏',
    'sidebar-left': '左侧栏',
    'sidebar-right': '右侧栏',
  };
  return {
    id: template.id,
    name: template.name,
    description: template.description || `${structureLabel[template.recipe.structure]}版式，只改排版，不改简历内容`,
    category: 'layout' as const,
    categoryLabel: '版式',
    keywords: ['自定义版式', structureLabel[template.recipe.structure], template.recipe.paper === 'dark' ? '深色' : '浅色'],
    recommendedOrder: -template.updatedAt,
    source: 'layout' as const,
  };
}

/** 套用只换排版和主题。正文、顺序、隐藏模块、标题和岗位信息由调用方保留。 */
export function applyLayoutToResume(resume: ResumeData, template: SavedRecipe): ResumeData {
  const recipe = readLayoutRecipe(template.recipe);
  if (!recipe) throw new Error('这份版式已损坏，不能使用。');
  return {
    ...resume,
    templateId: savedRecipeId(template.id),
    layout: recipe,
    theme: themeFromRecipe(recipe),
  };
}

export function serializeSavedRecipe(template: SavedRecipe): SavedRecipeFile {
  const recipe = readLayoutRecipe(template.recipe);
  if (!recipe) throw new Error('这份版式已损坏，不能导出。');
  return {
    kind: LAYOUT_FILE_KIND,
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    name: template.name,
    description: template.description,
    recipe,
  };
}

/** 未知 kind 或不是版本 1，整份拒绝，不降级。导入得到的 id 由调用方新生成。 */
export function parseSavedRecipeFile(value: unknown): { name: string; description: string; recipe: LayoutRecipe } {
  if (!isRecord(value)) throw new Error('版式文件不是有效的 JSON 对象。');
  if (value.kind !== LAYOUT_FILE_KIND) throw new Error('这不是海简历的版式文件。');
  if (value.schemaVersion !== LAYOUT_SCHEMA_VERSION) throw new Error('这份版式文件的版本不受支持。');
  const recipe = readLayoutRecipe(value.recipe);
  if (!recipe) throw new Error('版式内容无效。只支持当前版本的栏数、页眉和颜色设置。');
  return {
    name: normalizeLayoutName(typeof value.name === 'string' ? value.name : ''),
    description: normalizeLayoutDescription(typeof value.description === 'string' ? value.description : ''),
    recipe,
  };
}

/** 单栏忽略侧栏集合。侧栏里的可见模块不再出现在主栏，栏内顺序仍跟 sectionOrder。 */
export function splitSections(recipe: LayoutRecipe, sectionOrder: readonly string[], hidden: readonly string[] = []): { main: string[]; sidebar: string[] } {
  const hiddenSet = new Set(hidden);
  const visible = sectionOrder.filter((id) => !hiddenSet.has(id));
  if (recipe.structure === 'single') return { main: visible, sidebar: [] };
  const sidebarSet = new Set(recipe.sidebarSections);
  return {
    sidebar: visible.filter((id) => sidebarSet.has(id)),
    main: visible.filter((id) => !sidebarSet.has(id)),
  };
}

/** 只替换当前栏里的 id，其它模块（含隐藏模块和另一栏）留在原位。 */
export function reorderColumn(
  sectionOrder: readonly string[],
  column: readonly string[],
  nextColumn: readonly string[],
): string[] {
  const columnSet = new Set(column);
  if (
    nextColumn.length !== column.length
    || new Set(nextColumn).size !== nextColumn.length
    || nextColumn.some((id) => !columnSet.has(id))
  ) {
    throw new Error('只能调整当前栏里已有模块的顺序。');
  }
  const queue = [...nextColumn];
  return sectionOrder.map((id) => (columnSet.has(id) ? queue.shift()! : id));
}
