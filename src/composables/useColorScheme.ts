export const COLOR_SCHEME_KEY = 'sea-resume-color-scheme';

export type ColorScheme = 'light' | 'dark';
export type ColorSchemePreference = ColorScheme | 'system';

const THEME_COLOR = { light: '#f4f6f8', dark: '#141820' } as const;
const SCHEME_RIPPLE_MS = 750;

interface SchemeViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
}

export function readStoredScheme(): ColorSchemePreference | null {
  const mode = localStorage.getItem(COLOR_SCHEME_KEY);
  return mode === 'light' || mode === 'dark' || mode === 'system' ? mode : null;
}

export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveColorScheme(preference: ColorSchemePreference): ColorScheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

export function applyColorScheme(preference: ColorSchemePreference) {
  const dark = resolveColorScheme(preference) === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
  // `color-scheme` meta 决定 CSS 生效前的首屏配色：跟随系统时保持 "light dark"，
  // 用户固定主题时写成具体值，避免深色偏好下先闪一帧浅色浏览器 UI。
  document.querySelector('meta[name="color-scheme"]')
    ?.setAttribute('content', preference === 'system' ? 'light dark' : preference);
}

/**
 * 新主题从点击处按水滴扩开，旧主题留在涟圈外。
 * 不支持视图过渡、用户关闭动画或没有点击位置时直接切换。
 */
export function revealColorScheme(preference: ColorSchemePreference, origin?: { x: number; y: number }) {
  const dark = resolveColorScheme(preference) === 'dark';
  const root = document.documentElement;
  const reduceMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startViewTransition = (document as Document & {
    startViewTransition?: (update: () => void) => SchemeViewTransition;
  }).startViewTransition?.bind(document);
  if (
    root.classList.contains('dark') === dark
    || !origin
    || reduceMotion
    || typeof startViewTransition !== 'function'
    || root.classList.contains('scheme-rippling')
  ) {
    applyColorScheme(preference);
    return;
  }

  const x = Math.max(0, Math.min(window.innerWidth, origin.x));
  const y = Math.max(0, Math.min(window.innerHeight, origin.y));
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );
  root.style.setProperty('--scheme-ripple-x', `${x}px`);
  root.style.setProperty('--scheme-ripple-y', `${y}px`);
  root.style.setProperty('--scheme-ripple-radius', `${Math.ceil(endRadius)}px`);
  root.classList.add('scheme-rippling');

  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    root.classList.remove('scheme-rippling');
  };
  const fail = () => {
    applyColorScheme(preference);
    settle();
  };
  let transition: SchemeViewTransition;
  try {
    transition = startViewTransition(() => applyColorScheme(preference));
  } catch {
    fail();
    return;
  }

  // 等新旧快照都准备好，再让新主题从点击处扩开，避免先闪一下再动画。
  void transition.ready?.then(() => {
    try {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: SCHEME_RIPPLE_MS,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'both',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    } catch {
      // 伪元素动画不可用时，主题切换本身仍然完成。
    }
  }).catch(fail);
  transition.finished?.then(settle, fail);
  window.setTimeout(fail, SCHEME_RIPPLE_MS + 240);
}

export function persistColorScheme(preference: ColorSchemePreference, origin?: { x: number; y: number }) {
  if (preference === 'system') delete document.documentElement.dataset.mode;
  else document.documentElement.dataset.mode = preference;
  localStorage.setItem(COLOR_SCHEME_KEY, preference);
  revealColorScheme(preference, origin);
}
