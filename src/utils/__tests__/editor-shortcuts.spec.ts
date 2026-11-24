import { describe, expect, it } from 'vitest';
import { resolveEditorShortcut } from '@/utils/editorShortcuts';

describe('editor shortcuts', () => {
  it('maps save, undo, and redo chords', () => {
    expect(resolveEditorShortcut({ key: 's', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false })).toBe('save');
    expect(resolveEditorShortcut({ key: 'z', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false })).toBe('undo');
    expect(resolveEditorShortcut({ key: 'Z', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true })).toBe('redo');
    expect(resolveEditorShortcut({ key: 'y', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false })).toBe('redo');
    expect(resolveEditorShortcut({ key: 'z', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })).toBeNull();
    expect(resolveEditorShortcut({ key: '[', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })).toBe('previous-section');
    expect(resolveEditorShortcut({ key: ']', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })).toBe('next-section');
    expect(resolveEditorShortcut({ key: '?', metaKey: false, ctrlKey: false, altKey: false, shiftKey: true })).toBe('shortcut-help');
    expect(resolveEditorShortcut({ key: '[', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false })).toBeNull();
  });

  it('ignores browser autofill and IME synthetic keydown events without a key string', () => {
    expect(resolveEditorShortcut({ key: undefined, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })).toBeNull();
    expect(resolveEditorShortcut({ key: '', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false })).toBeNull();
    expect(resolveEditorShortcut({ key: 's', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, isComposing: true })).toBeNull();
  });
});
