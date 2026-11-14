import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COLOR_SCHEME_KEY,
  applyColorScheme,
  persistColorScheme,
  readStoredScheme,
  resolveColorScheme,
} from '../useColorScheme';

describe('color scheme preference', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark', 'scheme-rippling');
    delete document.documentElement.dataset.mode;
    document.documentElement.style.removeProperty('--scheme-ripple-x');
    delete (document as Document & { startViewTransition?: unknown }).startViewTransition;
    vi.unstubAllGlobals();
  });

  it('keeps an unset preference so the app can follow the system', () => {
    expect(readStoredScheme()).toBeNull();
  });

  it('remembers light, dark and system', () => {
    localStorage.setItem(COLOR_SCHEME_KEY, 'system');
    expect(readStoredScheme()).toBe('system');
    localStorage.setItem(COLOR_SCHEME_KEY, 'sideways');
    expect(readStoredScheme()).toBeNull();
  });

  it('resolves system from the current media query', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('dark'), media: query }));
    expect(resolveColorScheme('system')).toBe('dark');
    expect(resolveColorScheme('light')).toBe('light');
  });

  it('stores system without pinning a mode', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, media: '' }));
    persistColorScheme('system', { x: 12, y: 18 });

    expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBe('system');
    expect(document.documentElement.dataset.mode).toBeUndefined();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('reveals the new theme from the click instead of swapping first', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, media: '' }));
    let paintTheme: (() => void) | undefined;
    let finish = () => {};
    const ready = Promise.resolve();
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    Object.assign(document, {
      startViewTransition(update: () => void) {
        paintTheme = update;
        return { ready, finished };
      },
    });

    persistColorScheme('dark', { x: 20, y: 30 });

    expect(document.documentElement.classList.contains('scheme-rippling')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--scheme-ripple-x')).toBe('20px');
    expect(document.documentElement.style.getPropertyValue('--scheme-ripple-y')).toBe('30px');

    paintTheme?.();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    finish();
    await finished;
    await Promise.resolve();
    expect(document.documentElement.classList.contains('scheme-rippling')).toBe(false);
  });

  it('paints the document class without touching storage', () => {
    applyColorScheme(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(COLOR_SCHEME_KEY)).toBeNull();
  });
});
