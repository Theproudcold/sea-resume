export type EditorShortcutAction = 'save' | 'undo' | 'redo';

export function resolveEditorShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>): EditorShortcutAction | null {
  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier) return null;
  const key = event.key.toLowerCase();
  if (key === 's') return 'save';
  if (key === 'z' && event.shiftKey) return 'redo';
  if (key === 'y') return 'redo';
  if (key === 'z') return 'undo';
  return null;
}
