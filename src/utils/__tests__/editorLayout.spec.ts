import { afterEach, describe, expect, it } from 'vitest';
import {
  A4_WIDTH_PX,
  DEFAULT_EDITOR_LAYOUT,
  EDITOR_LAYOUT_STORAGE_KEY,
  EDITOR_WIDTH_DEFAULT,
  EDITOR_WIDTH_MAX,
  EDITOR_WIDTH_MIN,
  PANEL_SPLITTER_WIDTH,
  PREVIEW_MIN_WIDTH,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  maxEditorDragWidth,
  planEditorLayout,
  readStoredEditorLayout,
  sanitizeEditorLayout,
  tradeSidebarWidth,
  writeStoredEditorLayout,
  type EditorLayoutRequest,
} from '@/utils/editorLayout';

const base: Omit<EditorLayoutRequest, 'containerWidth'> = {
  sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
  editorWidth: EDITOR_WIDTH_DEFAULT,
  sidebarVisible: true,
  editorVisible: true,
  previewVisible: true,
};

const plan = (containerWidth: number, overrides: Partial<EditorLayoutRequest> = {}) =>
  planEditorLayout({ ...base, containerWidth, ...overrides });

afterEach(() => localStorage.clear());

describe('三栏布局解析', () => {
  it('宽度充足时三栏共存，预览保持完整 A4', () => {
    const result = plan(1600);
    expect(result.sidebarVisible).toBe(true);
    expect(result.editorVisible).toBe(true);
    expect(result.sidebarWidth).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(result.editorWidth).toBe(506);
    expect(result.previewWidth).toBe(PREVIEW_MIN_WIDTH);
  });

  it('空间收紧时先压编辑区、再压模块导航，仍给预览完整 A4', () => {
    const result = plan(1440);
    expect(result.editorWidth).toBe(EDITOR_WIDTH_MIN);
    expect(result.sidebarWidth).toBe(218);
    expect(result.sidebarVisible).toBe(true);
    expect(result.editorVisible).toBe(true);
    expect(result.previewWidth).toBeGreaterThanOrEqual(PREVIEW_MIN_WIDTH);
    expect(A4_WIDTH_PX).toBeLessThan(PREVIEW_MIN_WIDTH);
  });

  it('继续收窄时先自动收起模块导航，编辑区保留', () => {
    const result = plan(1280);
    expect(result.sidebarVisible).toBe(false);
    expect(result.autoCollapsedSidebar).toBe(true);
    expect(result.autoCollapsedEditor).toBe(false);
    expect(result.editorVisible).toBe(true);
    expect(result.editorWidth).toBe(EDITOR_WIDTH_MIN);
    expect(result.editorPanelWidth).toBe(PANEL_SPLITTER_WIDTH + EDITOR_WIDTH_MIN);
    expect(result.previewWidth).toBeGreaterThanOrEqual(PREVIEW_MIN_WIDTH);
  });

  it('仍然放不下时再自动收起编辑区，只留 A4 预览', () => {
    const result = plan(1100);
    expect(result.autoCollapsedSidebar).toBe(true);
    expect(result.autoCollapsedEditor).toBe(true);
    expect(result.editorPanelWidth).toBe(PANEL_SPLITTER_WIDTH);
    expect(result.previewWidth).toBe(1100 - PANEL_SPLITTER_WIDTH * 2);
    expect(result.previewWidth).toBeGreaterThanOrEqual(PREVIEW_MIN_WIDTH);
  });

  it('用户手动钉住的栏目不被收起，预览暂时窄于 A4', () => {
    const result = plan(1100, { protectEditor: true });
    expect(result.editorVisible).toBe(true);
    expect(result.editorWidth).toBe(EDITOR_WIDTH_DEFAULT);
    expect(result.autoCollapsedEditor).toBe(false);
    expect(result.autoCollapsedSidebar).toBe(true);
    expect(result.previewWidth).toBeLessThan(PREVIEW_MIN_WIDTH);
    expect(result.previewWidth).toBeGreaterThan(0);
  });

  it('钉住的模块导航同样保留，宽度不小于最小值', () => {
    const result = plan(1100, { protectSidebar: true });
    expect(result.sidebarVisible).toBe(true);
    expect(result.sidebarWidth).toBeGreaterThanOrEqual(SIDEBAR_WIDTH_MIN);
    expect(result.autoCollapsedSidebar).toBe(false);
  });

  it('未测量容器宽度时不做自动折叠', () => {
    const result = plan(0);
    expect(result.sidebarVisible).toBe(true);
    expect(result.editorVisible).toBe(true);
    expect(result.sidebarWidth).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(result.editorWidth).toBe(EDITOR_WIDTH_DEFAULT);
  });

  it('预览被隐藏时把空间让给编辑区', () => {
    const result = plan(900, { previewVisible: false });
    expect(result.previewVisible).toBe(false);
    expect(result.sidebarVisible).toBe(true);
    expect(result.editorVisible).toBe(true);
    expect(result.previewWidth).toBe(0);
    expect(result.editorPanelWidth).toBeLessThanOrEqual(900);
  });

  it('把偏好宽度收敛到允许区间', () => {
    const result = plan(2400, { sidebarWidth: 9999, editorWidth: 5 });
    expect(result.sidebarWidth).toBe(SIDEBAR_WIDTH_MAX);
    expect(result.editorWidth).toBe(EDITOR_WIDTH_MIN);
  });
});

describe('拖拽宽度', () => {
  it('模块导航与编辑区按固定总宽互换', () => {
    const traded = tradeSidebarWidth(SIDEBAR_WIDTH_DEFAULT, EDITOR_WIDTH_DEFAULT, 40);
    expect(traded.sidebarWidth).toBe(SIDEBAR_WIDTH_DEFAULT + 40);
    expect(traded.editorWidth).toBe(EDITOR_WIDTH_DEFAULT - 40);
    expect(traded.sidebarWidth + traded.editorWidth).toBe(SIDEBAR_WIDTH_DEFAULT + EDITOR_WIDTH_DEFAULT);
  });

  it('互换时两端都不越过最小值', () => {
    const wide = tradeSidebarWidth(SIDEBAR_WIDTH_DEFAULT, EDITOR_WIDTH_DEFAULT, 9999);
    expect(wide.sidebarWidth).toBe(Math.min(SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_DEFAULT + EDITOR_WIDTH_DEFAULT - EDITOR_WIDTH_MIN));
    expect(wide.editorWidth).toBeGreaterThanOrEqual(EDITOR_WIDTH_MIN);
    const narrow = tradeSidebarWidth(SIDEBAR_WIDTH_DEFAULT, EDITOR_WIDTH_DEFAULT, -9999);
    expect(narrow.sidebarWidth).toBe(SIDEBAR_WIDTH_MIN);
    expect(narrow.editorWidth).toBe(SIDEBAR_WIDTH_DEFAULT + EDITOR_WIDTH_DEFAULT - SIDEBAR_WIDTH_MIN);
  });

  it('编辑区拖拽上限给预览留出可用宽度', () => {
    expect(maxEditorDragWidth({ containerWidth: 1440, sidebarWidth: 232, previewVisible: true })).toBe(1440 - 232 - PANEL_SPLITTER_WIDTH * 2 - 320);
    expect(maxEditorDragWidth({ containerWidth: 0, sidebarWidth: 232, previewVisible: true })).toBe(EDITOR_WIDTH_MAX);
    expect(maxEditorDragWidth({ containerWidth: 400, sidebarWidth: 232, previewVisible: true })).toBe(EDITOR_WIDTH_MIN);
  });
});

describe('布局偏好存储', () => {
  it('读写往返并收敛非法值', () => {
    writeStoredEditorLayout({
      sidebarWidth: 9999,
      editorWidth: -20,
      sidebarCollapsed: true,
      editorCollapsed: true,
      previewCollapsed: true,
    });
    const stored = readStoredEditorLayout();
    expect(stored.sidebarWidth).toBe(SIDEBAR_WIDTH_MAX);
    expect(stored.editorWidth).toBe(EDITOR_WIDTH_MIN);
    expect(stored.sidebarCollapsed).toBe(true);
    expect(stored.editorCollapsed).toBe(true);
    expect(stored.previewCollapsed).toBe(true);
  });

  it('损坏或缺失的数据回落到默认布局', () => {
    localStorage.setItem(EDITOR_LAYOUT_STORAGE_KEY, '{oops');
    expect(readStoredEditorLayout()).toEqual(DEFAULT_EDITOR_LAYOUT);
    expect(sanitizeEditorLayout('nope')).toEqual(DEFAULT_EDITOR_LAYOUT);
    expect(sanitizeEditorLayout(null)).toEqual(DEFAULT_EDITOR_LAYOUT);
  });
});
