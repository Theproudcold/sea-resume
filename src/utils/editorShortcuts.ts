export type EditorShortcutAction = 'save' | 'undo' | 'redo' | 'previous-section' | 'next-section' | 'shortcut-help';

export interface EditorShortcutEvent {
  key?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
}

export function resolveEditorShortcut(event: EditorShortcutEvent): EditorShortcutAction | null {
  // 浏览器自动填充或合成输入法事件会触发无 key 字段的 keydown，必须先行放行。
  if (event.isComposing || typeof event.key !== 'string' || !event.key) return null;
  const modifier = Boolean(event.metaKey || event.ctrlKey);
  const key = event.key.toLowerCase();
  if (!modifier && !event.altKey) {
    if (event.shiftKey && key === '?') return 'shortcut-help';
    if (event.shiftKey && event.key === '/') return 'shortcut-help';
    if (!event.shiftKey && key === '[') return 'previous-section';
    if (!event.shiftKey && key === ']') return 'next-section';
    return null;
  }
  if (!modifier || event.altKey) return null;
  if (key === 's') return 'save';
  if (key === 'z' && event.shiftKey) return 'redo';
  if (key === 'y') return 'redo';
  if (key === 'z') return 'undo';
  return null;
}
