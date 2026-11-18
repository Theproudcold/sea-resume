import { describe, expect, it } from 'vitest';
import { AVATAR_SHAPE_OPTIONS, DEFAULT_AVATAR_SHAPE, avatarBorderRadius, normalizeAvatarShape, parseAvatarShape } from '@/utils/avatarShape';

describe('avatar shape values', () => {
  it('defaults to the circle that every existing resume already rendered as', () => {
    expect(DEFAULT_AVATAR_SHAPE).toBe('circle');
    expect(normalizeAvatarShape(undefined)).toBe('circle');
    expect(avatarBorderRadius(undefined)).toBe('999px');
    expect(avatarBorderRadius('circle')).toBe('999px');
  });

  it('renders the square option without a circular radius', () => {
    expect(normalizeAvatarShape('square')).toBe('square');
    expect(avatarBorderRadius('square')).toBe('2px');
  });

  it('never lets an unknown value reach the style sink', () => {
    for (const dirty of ['triangle', '', 'CIRCLE', 0, 1, null, {}, [], 'square ']) {
      expect(normalizeAvatarShape(dirty)).toBe('circle');
      expect(avatarBorderRadius(dirty as never)).toBe('999px');
    }
  });

  it('keeps unset and unknown values out of stored data instead of inventing a choice', () => {
    expect(parseAvatarShape('square')).toBe('square');
    expect(parseAvatarShape('circle')).toBe('circle');
    expect(parseAvatarShape(undefined)).toBeUndefined();
    expect(parseAvatarShape('triangle')).toBeUndefined();
  });

  it('offers exactly the two shapes the renderers can draw', () => {
    expect(AVATAR_SHAPE_OPTIONS.map((option) => option.value)).toEqual(['circle', 'square']);
  });
});
