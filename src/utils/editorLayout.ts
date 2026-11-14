/**
 * 编辑器三栏布局的纯计算与持久化规则。
 *
 * 三栏分别是「模块导航 / 编辑区 / 预览区」。宽度由用户拖拽决定，但
 * 右侧预览要尽可能保持 A4 实际尺寸：空间不足时先压缩、再按「模块导航 →
 * 编辑区」的顺序自动折叠；窗口恢复宽度后自动展开。
 */

export const EDITOR_LAYOUT_STORAGE_KEY = 'sea-resume-editor-layout';

export const SIDEBAR_WIDTH_MIN = 168;
export const SIDEBAR_WIDTH_MAX = 360;
export const SIDEBAR_WIDTH_DEFAULT = 232;
export const EDITOR_WIDTH_MIN = 360;
export const EDITOR_WIDTH_MAX = 1080;
export const EDITOR_WIDTH_DEFAULT = 720;
export const PANEL_SPLITTER_WIDTH = 8;

/** CSS 参考像素下 210mm 的宽度（1in = 96px）。 */
export const A4_WIDTH_PX = 794;
/**
 * 预览画布左右留白（--space-md 两侧 32px）加滚动条预留：垂直滚动条会占掉
 * 预览容器宽度，留够空间才能保证 A4 不被压窄。
 */
export const PREVIEW_GUTTER_PX = 52;
export const PREVIEW_MIN_WIDTH = A4_WIDTH_PX + PREVIEW_GUTTER_PX;

export interface EditorLayoutPreference {
  sidebarWidth: number;
  editorWidth: number;
  sidebarCollapsed: boolean;
  editorCollapsed: boolean;
  previewCollapsed: boolean;
}

export const DEFAULT_EDITOR_LAYOUT: EditorLayoutPreference = {
  sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
  editorWidth: EDITOR_WIDTH_DEFAULT,
  sidebarCollapsed: false,
  editorCollapsed: false,
  previewCollapsed: false,
};

export type EditorLayoutPane = 'sidebar' | 'editor' | 'preview';

export function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

export function sanitizeEditorLayout(raw: unknown): EditorLayoutPreference {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_EDITOR_LAYOUT };
  const record = raw as Record<string, unknown>;
  return {
    sidebarWidth: clampNumber(Number(record.sidebarWidth), SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX),
    editorWidth: clampNumber(Number(record.editorWidth), EDITOR_WIDTH_MIN, EDITOR_WIDTH_MAX),
    sidebarCollapsed: readBoolean(record.sidebarCollapsed, false),
    editorCollapsed: readBoolean(record.editorCollapsed, false),
    previewCollapsed: readBoolean(record.previewCollapsed, false),
  };
}

export function readStoredEditorLayout(storage: Storage | undefined = globalThis.localStorage): EditorLayoutPreference {
  if (!storage) return { ...DEFAULT_EDITOR_LAYOUT };
  try {
    const raw = storage.getItem(EDITOR_LAYOUT_STORAGE_KEY);
    return raw ? sanitizeEditorLayout(JSON.parse(raw)) : { ...DEFAULT_EDITOR_LAYOUT };
  } catch {
    return { ...DEFAULT_EDITOR_LAYOUT };
  }
}

export function writeStoredEditorLayout(
  preference: EditorLayoutPreference,
  storage: Storage | undefined = globalThis.localStorage,
) {
  if (!storage) return;
  try {
    storage.setItem(EDITOR_LAYOUT_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // 隐私模式或配额不足时保持当前会话内的布局即可。
  }
}

export interface EditorLayoutRequest {
  /** 三栏容器的可用宽度；0 表示尚未测量，此时不做自动折叠。 */
  containerWidth: number;
  sidebarWidth: number;
  editorWidth: number;
  sidebarVisible: boolean;
  editorVisible: boolean;
  previewVisible: boolean;
  /** 用户手动展开的栏目不再自动折叠，代价是预览暂时横向滚动。 */
  protectSidebar?: boolean;
  protectEditor?: boolean;
  previewMinWidth?: number;
  splitterWidth?: number;
}

export interface EditorLayoutPlan {
  sidebarWidth: number;
  editorWidth: number;
  sidebarVisible: boolean;
  editorVisible: boolean;
  previewVisible: boolean;
  /** 编辑区容器宽度（模块导航 + 分隔条 + 编辑区）。 */
  editorPanelWidth: number;
  previewWidth: number;
  /** 因宽度不足被自动折叠，与用户自己的折叠选择区分。 */
  autoCollapsedSidebar: boolean;
  autoCollapsedEditor: boolean;
}

export function planEditorLayout({
  containerWidth,
  sidebarWidth,
  editorWidth,
  sidebarVisible,
  editorVisible,
  previewVisible,
  protectSidebar = false,
  protectEditor = false,
  previewMinWidth = PREVIEW_MIN_WIDTH,
  splitterWidth = PANEL_SPLITTER_WIDTH,
}: EditorLayoutRequest): EditorLayoutPlan {
  let sidebar = clampNumber(Math.round(sidebarWidth), SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX);
  let editor = clampNumber(Math.round(editorWidth), EDITOR_WIDTH_MIN, EDITOR_WIDTH_MAX);
  let showSidebar = sidebarVisible;
  let showEditor = editorVisible;
  let autoSidebar = false;
  let autoEditor = false;

  const measured = Number.isFinite(containerWidth) && containerWidth > 0;
  const previewStrips = previewVisible ? splitterWidth : 0;
  const strips = splitterWidth + previewStrips;

  if (measured && previewVisible) {
    // 留给「模块导航 + 编辑区」的上限：容器减去分隔条和完整 A4 预览。
    const room = containerWidth - strips - previewMinWidth;
    let total = (showSidebar ? sidebar : 0) + (showEditor ? editor : 0);

    // 先压缩再折叠；用户手动调整过的栏目保持宽度与可见性，代价是预览横向滚动。
    if (total > room && showEditor && !protectEditor) {
      const shrink = Math.min(editor - EDITOR_WIDTH_MIN, total - room);
      editor -= shrink;
      total -= shrink;
    }
    if (total > room && showSidebar && !protectSidebar) {
      const shrink = Math.min(sidebar - SIDEBAR_WIDTH_MIN, total - room);
      sidebar -= shrink;
      total -= shrink;
    }
    // 先收模块导航，再收编辑区。
    if (total > room && showSidebar && !protectSidebar) {
      showSidebar = false;
      autoSidebar = true;
      total -= sidebar;
    }
    if (total > room && showEditor && !protectEditor) {
      showEditor = false;
      autoEditor = true;
      total -= editor;
    }
  }

  let editorPanelWidth = (showSidebar ? sidebar : 0) + splitterWidth + (showEditor ? editor : 0);
  if (measured) editorPanelWidth = Math.min(editorPanelWidth, Math.max(0, containerWidth - previewStrips));
  const previewWidth = measured ? Math.max(0, containerWidth - editorPanelWidth - previewStrips) : previewMinWidth;

  return {
    sidebarWidth: sidebar,
    editorWidth: editor,
    sidebarVisible: showSidebar,
    editorVisible: showEditor,
    previewVisible,
    editorPanelWidth,
    previewWidth,
    autoCollapsedSidebar: autoSidebar,
    autoCollapsedEditor: autoEditor,
  };
}

/**
 * 拖拽「模块导航 | 编辑区」分隔条：在编辑区容器总宽不变的前提下交换两栏宽度，
 * 这样预览宽度不受影响，A4 保持稳定。
 */
export function tradeSidebarWidth(
  sidebarWidth: number,
  editorWidth: number,
  delta: number,
): { sidebarWidth: number; editorWidth: number } {
  const total = clampNumber(sidebarWidth, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX)
    + clampNumber(editorWidth, EDITOR_WIDTH_MIN, EDITOR_WIDTH_MAX);
  const sidebar = clampNumber(
    sidebarWidth + delta,
    SIDEBAR_WIDTH_MIN,
    Math.min(SIDEBAR_WIDTH_MAX, total - EDITOR_WIDTH_MIN),
  );
  return {
    sidebarWidth: sidebar,
    editorWidth: clampNumber(total - sidebar, EDITOR_WIDTH_MIN, EDITOR_WIDTH_MAX),
  };
}

/**
 * 手动拖拽编辑区时允许的最大宽度：容器内扣除分隔条与模块导航，并给预览
 * 留一段可用的宽度。拖拽是用户显式覆盖，允许预览暂时窄于 A4。
 */
export const PREVIEW_DRAG_MIN_WIDTH = 320;

export function maxEditorDragWidth(input: {
  containerWidth: number;
  sidebarWidth: number;
  previewVisible: boolean;
  previewMinWidth?: number;
  splitterWidth?: number;
}) {
  const {
    containerWidth,
    sidebarWidth,
    previewVisible,
    previewMinWidth = PREVIEW_DRAG_MIN_WIDTH,
    splitterWidth = PANEL_SPLITTER_WIDTH,
  } = input;
  const measured = Number.isFinite(containerWidth) && containerWidth > 0;
  if (!measured) return EDITOR_WIDTH_MAX;
  const strips = splitterWidth + (previewVisible ? splitterWidth : 0);
  const reserved = strips + sidebarWidth + (previewVisible ? previewMinWidth : 0);
  return clampNumber(containerWidth - reserved, EDITOR_WIDTH_MIN, EDITOR_WIDTH_MAX);
}
