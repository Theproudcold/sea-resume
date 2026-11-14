export type EditorShortcutAction = 'save' | 'undo' | 'redo' | 'previous-section' | 'next-section' | 'shortcut-help';

export function resolveEditorShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): EditorShortcutAction | null {
  const modifier = event.metaKey || event.ctrlKey;
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
