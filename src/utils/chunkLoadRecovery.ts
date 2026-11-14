/**
 * 构建产物带 hash 文件名，页面长时间停留在旧版本（或构建/发布后未刷新）时，
 * 旧的懒加载 chunk 已被新构建替换，Vite 的 SPA 回退还会把缺失的 js 请求
 * 返回 index.html，于是控制台报 “Failed to fetch dynamically imported module”。
 * 这类错误刷新页面即可恢复，这里自动刷新一次，并避免刷新风暴。
 */

const RELOAD_GUARD_KEY = 'sea-resume:chunk-recovery-at';
const RELOAD_GUARD_WINDOW_MS = 15_000;

const CHUNK_ERROR_PATTERNS: readonly RegExp[] = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /error loading dynamically imported module/i,
  /failed to load module script/i,
  /unable to preload css/i,
  /is not a valid javascript mime type/i,
];

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

/** 判断是否为“懒加载 chunk 取不到”类错误（多为构建更新后的旧页面）。 */
export function isChunkLoadError(error: unknown): boolean {
  const message = messageOf(error);
  return message !== '' && CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export type ChunkRecoveryResult = 'reloaded' | 'throttled' | 'unsupported';

/**
 * 刷新页面以拉取最新构建入口。短时间内只刷新一次，
 * 若刷新后仍然失败则交由调用方提示用户手动处理，避免无限刷新。
 */
export function recoverFromChunkLoadError(now: number = Date.now()): ChunkRecoveryResult {
  if (typeof window === 'undefined' || typeof window.location?.reload !== 'function') {
    return 'unsupported';
  }

  let lastReloadAt = 0;
  try {
    lastReloadAt = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0) || 0;
  } catch {
    // 隐私模式下 sessionStorage 可能不可用，此时不节流，但仍保证不抛错。
  }
  if (lastReloadAt > 0 && now - lastReloadAt < RELOAD_GUARD_WINDOW_MS) return 'throttled';

  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
  } catch {
    // 存储失败不影响刷新本身。
  }
  window.location.reload();
  return 'reloaded';
}
