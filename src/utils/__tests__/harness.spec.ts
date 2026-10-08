import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs in jsdom with localStorage available', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
    localStorage.setItem('probe', 'ok');
    expect(localStorage.getItem('probe')).toBe('ok');
  });
});
