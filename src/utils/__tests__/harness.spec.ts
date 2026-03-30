import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs in jsdom with localStorage available', () => {
    localStorage.setItem('probe', 'ok');
    expect(localStorage.getItem('probe')).toBe('ok');
  });
});
