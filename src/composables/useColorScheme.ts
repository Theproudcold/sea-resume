export const COLOR_SCHEME_KEY = 'sea-resume-color-scheme';

export type ColorScheme = 'light' | 'dark';

const THEME_COLOR = { light: '#f4f6f8', dark: '#141820' } as const;

export function readStoredScheme(): ColorScheme | null {
  const mode = localStorage.getItem(COLOR_SCHEME_KEY);
  return mode === 'light' || mode === 'dark' ? mode : null;
}

export function applyColorScheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
}

export function persistColorScheme(dark: boolean) {
  const mode: ColorScheme = dark ? 'dark' : 'light';
  document.documentElement.dataset.mode = mode;
  localStorage.setItem(COLOR_SCHEME_KEY, mode);
  applyColorScheme(dark);
}
