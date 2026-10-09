import { describe, expect, it } from 'vitest';
import { resolveEditorShortcut } from '@/utils/editorShortcuts';

describe('editor shortcuts', () => {
  it('maps save, undo, and redo chords', () => {
    expect(resolveEditorShortcut({ key: 's', metaKey: true, ctrlKey: false, shiftKey: false })).toBe('save');
    expect(resolveEditorShortcut({ key: 'z', metaKey: false, ctrlKey: true, shiftKey: false })).toBe('undo');
    expect(resolveEditorShortcut({ key: 'Z', metaKey: true, ctrlKey: false, shiftKey: true })).toBe('redo');
    expect(resolveEditorShortcut({ key: 'y', metaKey: false, ctrlKey: true, shiftKey: false })).toBe('redo');
    expect(resolveEditorShortcut({ key: 'z', metaKey: false, ctrlKey: false, shiftKey: false })).toBeNull();
  });
});
