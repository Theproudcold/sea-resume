import { computed, ref, type ComputedRef, type Ref } from 'vue';
import {
  DEFAULT_EDITOR_LAYOUT,
  EDITOR_WIDTH_MIN,
  clampNumber,
  maxEditorDragWidth,
  planEditorLayout,
  readStoredEditorLayout,
  tradeSidebarWidth,
  writeStoredEditorLayout,
  type EditorLayoutPane,
  type EditorLayoutPreference,
} from '@/utils/editorLayout';

const COMPACT_QUERY = '(max-width: 1024px)';

/** 三栏布局是会话级偏好：编辑器各组件共享同一份状态。 */
const preference = ref<EditorLayoutPreference>(readStoredEditorLayout());
const containerWidth = ref(0);
const compact = ref(false);
/** 用户在空间不足时手动展开的栏目：不再自动折叠，预览暂时横向滚动。 */
const pinned = ref<{ sidebar: boolean; editor: boolean }>({ sidebar: false, editor: false });
let compactQuery: MediaQueryList | null = null;

function ensureCompactQuery() {
  if (compactQuery || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  compactQuery = window.matchMedia(COMPACT_QUERY);
  compact.value = compactQuery.matches;
  compactQuery.addEventListener('change', (event) => {
    compact.value = event.matches;
    if (event.matches) pinned.value = { sidebar: false, editor: false };
  });
}

function setPreference(patch: Partial<EditorLayoutPreference>) {
  preference.value = { ...preference.value, ...patch };
  writeStoredEditorLayout(preference.value);
}

export interface EditorLayoutApi {
  preference: Ref<EditorLayoutPreference>;
  compact: Ref<boolean>;
  containerWidth: Ref<number>;
  /** 解析后的有效布局：宽度、可见性、编辑区容器宽度与自动折叠标记。 */
  resolved: ComputedRef<ReturnType<typeof planEditorLayout>>;
  /** 编辑区拖拽上限。 */
  maxEditorWidth: ComputedRef<number>;
  paneVisible: (pane: EditorLayoutPane) => boolean;
  canToggle: (pane: EditorLayoutPane) => boolean;
  togglePane: (pane: EditorLayoutPane) => void;
  /** 仅切换预览可见性，用于导出 / 打印前临时显示画布。 */
  setPreviewVisible: (visible: boolean) => void;
  resizeSidebar: (delta: number) => void;
  resizeEditor: (delta: number) => void;
  resetLayout: () => void;
  setContainerWidth: (width: number) => void;
  observeContainer: (element: HTMLElement | null) => () => void;
}

export function useEditorLayout(): EditorLayoutApi {
  ensureCompactQuery();

  const request = computed(() => ({
    // 窄屏切到「编辑 / 预览」Tab，宽度交给样式表，不做自动折叠。
    containerWidth: compact.value ? 0 : containerWidth.value,
    sidebarWidth: preference.value.sidebarWidth,
    editorWidth: preference.value.editorWidth,
    sidebarVisible: !preference.value.sidebarCollapsed,
    editorVisible: !preference.value.editorCollapsed,
    previewVisible: !preference.value.previewCollapsed,
    protectSidebar: pinned.value.sidebar,
    protectEditor: pinned.value.editor,
  }));

  const resolved = computed(() => {
    if (compact.value) {
      // 窄屏由「编辑 / 预览」Tab 决定显示哪一栏，桌面端的折叠状态不生效。
      return planEditorLayout({ ...request.value, sidebarVisible: true, editorVisible: true, previewVisible: true });
    }
    return planEditorLayout(request.value);
  });

  /** 编辑区分隔条可拖到的最大宽度（给预览保留一段可用宽度）。 */
  const maxEditorWidth = computed(() => maxEditorDragWidth({
    containerWidth: compact.value ? 0 : containerWidth.value,
    sidebarWidth: resolved.value.sidebarVisible ? resolved.value.sidebarWidth : 0,
    previewVisible: resolved.value.previewVisible,
  }));

  const paneVisible = (pane: EditorLayoutPane) => {
    const plan = resolved.value;
    if (pane === 'sidebar') return plan.sidebarVisible;
    if (pane === 'editor') return plan.editorVisible;
    return plan.previewVisible;
  };

  const canToggle = (pane: EditorLayoutPane) => {
    if (compact.value) return false;
    const plan = resolved.value;
    if (pane === 'sidebar') return !plan.sidebarVisible || plan.editorVisible || plan.previewVisible;
    if (pane === 'editor') return !plan.editorVisible || plan.sidebarVisible || plan.previewVisible;
    return !plan.previewVisible || plan.sidebarVisible || plan.editorVisible;
  };

  const togglePane = (pane: EditorLayoutPane) => {
    if (!canToggle(pane)) return;
    const visible = paneVisible(pane);
    if (pane === 'preview') {
      // 重新显示预览即重新以 A4 优先，必要时自动折叠左栏或编辑区。
      setPreference({ previewCollapsed: visible });
      pinned.value = { sidebar: false, editor: false };
      return;
    }
    if (visible) {
      setPreference(pane === 'sidebar' ? { sidebarCollapsed: true } : { editorCollapsed: true });
      pinned.value = { ...pinned.value, [pane]: false };
      return;
    }
    const otherSidebarVisible = resolved.value.sidebarVisible;
    const otherEditorVisible = resolved.value.editorVisible;
    // 手动展开：先按 A4 优先试算能给到的宽度，确实放不下才让预览横向滚动。
    const candidate = planEditorLayout({
      ...request.value,
      sidebarVisible: pane === 'sidebar' || otherSidebarVisible,
      editorVisible: pane === 'editor' || otherEditorVisible,
    });
    setPreference(pane === 'sidebar'
      ? { sidebarCollapsed: false, sidebarWidth: candidate.sidebarWidth }
      : { editorCollapsed: false, editorWidth: candidate.editorWidth });
    // 手动展开的栏目，以及展开时本来就可见的栏目，都保持不动。
    pinned.value = {
      sidebar: pane === 'sidebar' || otherSidebarVisible,
      editor: pane === 'editor' || otherEditorVisible,
    };
  };

  const setContainerWidth = (width: number) => {
    const next = Number.isFinite(width) && width > 0 ? Math.round(width) : 0;
    if (next === containerWidth.value) return;
    containerWidth.value = next;
    // 容器尺寸变化时重新按 A4 优先评估，手动展开只是临时状态。
    if (next > 0) pinned.value = { sidebar: false, editor: false };
  };

  const setPreviewVisible = (visible: boolean) => {
    if (preference.value.previewCollapsed === !visible) return;
    setPreference({ previewCollapsed: !visible });
  };

  const resizeSidebar = (delta: number) => {
    if (compact.value || !resolved.value.sidebarVisible || !delta) return;
    const { sidebarWidth, editorWidth } = tradeSidebarWidth(
      resolved.value.sidebarWidth,
      resolved.value.editorWidth,
      delta,
    );
    // 拖拽是显式选择：保留当前宽度，不再让 A4 优先把它压回去。
    pinned.value = { ...pinned.value, sidebar: true };
    setPreference({ sidebarWidth, editorWidth });
  };

  const resizeEditor = (delta: number) => {
    if (compact.value || !resolved.value.editorVisible || !delta) return;
    const next = clampNumber(resolved.value.editorWidth + delta, EDITOR_WIDTH_MIN, maxEditorWidth.value);
    // 拖拽编辑区时保留已经可见的模块导航，让预览去承担宽度变化。
    pinned.value = { sidebar: resolved.value.sidebarVisible, editor: true };
    setPreference({ editorWidth: next });
  };

  const resetLayout = () => {
    pinned.value = { sidebar: false, editor: false };
    setPreference({ ...DEFAULT_EDITOR_LAYOUT });
  };

  const observeContainer = (element: HTMLElement | null) => {
    if (!element) return () => {};
    if (typeof ResizeObserver === 'undefined') {
      const measure = () => setContainerWidth(element.clientWidth);
      measure();
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0]?.contentRect.width ?? element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  };

  return {
    preference,
    compact,
    containerWidth,
    resolved,
    maxEditorWidth,
    paneVisible,
    canToggle,
    togglePane,
    setPreviewVisible,
    resizeSidebar,
    resizeEditor,
    resetLayout,
    setContainerWidth,
    observeContainer,
  };
}

/** 仅供测试使用：把布局偏好与容器宽度恢复到默认。 */
export function resetEditorLayoutState() {
  pinned.value = { sidebar: false, editor: false };
  containerWidth.value = 0;
  setPreference({ ...DEFAULT_EDITOR_LAYOUT });
}
