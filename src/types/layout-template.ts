/** 版式语汇的第一版。未来版本不猜，直接拒绝。 */
export const LAYOUT_SCHEMA_VERSION = 1;

export type LayoutSeedId =
  | 'modern'
  | 'professional'
  | 'creative'
  | 'minimal'
  | 'tech'
  | 'ai-agent'
  | 'classic'
  | 'editorial'
  | 'engineer'
  | 'executive'
  | 'campus';

export type LayoutStructure = 'single' | 'sidebar-left' | 'sidebar-right';
export type HeaderVariant = 'inline' | 'banner' | 'stacked';
export type HeaderAlign = 'start' | 'center';
export type AvatarPlacement = 'start' | 'end' | 'none';
export type HeadingStyle = 'underline' | 'accent' | 'plain';
export type SummaryPlacement = 'main' | 'sidebar' | 'hidden';
export type ContactsPlacement = 'header' | 'sidebar';
export type PaperTone = 'light' | 'dark';
export type LayoutDateFormat = 'YYYY.MM' | 'YYYY-MM' | 'YYYY/MM' | 'MM/YYYY' | 'MMM YYYY';

/** 只决定结构与色板。字号、边距、强调色在套用时写入简历主题，之后不再从这里读。 */
export interface LayoutTokens {
  accent: string;
  ink: string;
  muted: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  pageMargins: number;
  moduleMargins: { top: number; bottom: number; left: number; right: number };
  dateFormat: LayoutDateFormat;
  displayIcons: boolean;
}

export interface LayoutHeader {
  variant: HeaderVariant;
  align: HeaderAlign;
  avatar: AvatarPlacement;
  /** none 无底；accent 用当前主题色做页眉底，文字反白。 */
  fill: 'none' | 'accent';
}

/**
 * 声明式版式。不放 CSS 字符串，只放枚举、白名单和有界数字。
 * seedId 只记它从哪套内置模板派生，渲染不读它。
 */
export interface LayoutRecipe {
  schemaVersion: typeof LAYOUT_SCHEMA_VERSION;
  seedId?: LayoutSeedId;
  structure: LayoutStructure;
  /** 侧栏占内容宽的百分比，24–42；单栏时保留但不使用。 */
  sidebarWidth: number;
  /** sectionOrder 里的模块 id。不在集合里的可见模块进主栏。 */
  sidebarSections: string[];
  customBlockRegion: 'main' | 'sidebar';
  summaryPlacement: SummaryPlacement;
  contactsPlacement: ContactsPlacement;
  header: LayoutHeader;
  heading: HeadingStyle;
  paper: PaperTone;
  tokens: LayoutTokens;
}

/** 模板库里的一条版式。已套用的简历自带配方，不随这条记录删除而变。 */
export interface SavedRecipe {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  recipe: LayoutRecipe;
}

/** 导出文件。导入总是新 id，kind 不符或版本不是 1 就整份拒绝。 */
export interface SavedRecipeFile {
  kind: 'sea-resume-layout';
  schemaVersion: typeof LAYOUT_SCHEMA_VERSION;
  name: string;
  description: string;
  recipe: LayoutRecipe;
}
