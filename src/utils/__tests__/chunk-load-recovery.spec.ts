import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'vue';

const { errorSpy } = vi.hoisted(() => ({ errorSpy: vi.fn() }));

vi.mock('element-plus', () => ({ ElMessage: { error: errorSpy } }));

import { isChunkLoadError, recoverFromChunkLoadError } from '@/utils/chunkLoadRecovery';
import { installGlobalErrorReporting, reportRuntimeError } from '@/utils/globalErrorReporting';

const realLocation = window.location;
const STALE_CHUNK =
  'Failed to fetch dynamically imported module: http://localhost:4173/assets/Editor-Bps63NO3.js';

function stubReload() {
  const reload = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { reload },
  });
  return reload;
}

let clock = 1_000_000;

beforeEach(() => {
  // 每次用例推进系统时间，避免全局去重窗口在用例之间串味。
  clock += 60_000;
  vi.useFakeTimers();
  vi.setSystemTime(clock);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  sessionStorage.clear();
  errorSpy.mockClear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('chunk 加载失败识别', () => {
  it('识别动态导入失败', () => {
    expect(isChunkLoadError(new Error(STALE_CHUNK))).toBe(true);
    expect(isChunkLoadError('Importing a module script failed.')).toBe(true);
    expect(isChunkLoadError(new TypeError("'text/html' is not a valid JavaScript MIME type."))).toBe(true);
  });

  it('不误判普通业务错误', () => {
    expect(isChunkLoadError(new Error('网络请求超时'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
  });
});

describe('chunk 加载失败恢复', () => {
  it('首次失败自动刷新，短时间内不重复刷新', () => {
    const reload = stubReload();

    expect(recoverFromChunkLoadError(1_000)).toBe('reloaded');
    expect(reload).toHaveBeenCalledTimes(1);

    expect(recoverFromChunkLoadError(2_000)).toBe('throttled');
    expect(reload).toHaveBeenCalledTimes(1);

    expect(recoverFromChunkLoadError(1_000 + 15_000)).toBe('reloaded');
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('chunk 失效时刷新页面而不是弹窗', () => {
    const reload = stubReload();

    reportRuntimeError('未处理的异步错误', new Error(STALE_CHUNK));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('刷新无效后把重复上报合并为一条可读提示', () => {
    const reload = stubReload();
    sessionStorage.setItem('sea-resume:chunk-recovery-at', String(Date.now()));

    reportRuntimeError('页面加载失败', new Error(STALE_CHUNK));
    reportRuntimeError('未处理的异步错误', new Error(STALE_CHUNK));

    expect(reload).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain('页面资源已更新');
  });

  it('Vite 预加载失败事件也会触发恢复', () => {
    const reload = stubReload();
    installGlobalErrorReporting({ config: {} } as unknown as App);

    const event = new CustomEvent('vite:preloadError', { cancelable: true });
    Object.assign(event, { payload: new Error(STALE_CHUNK) });
    window.dispatchEvent(event);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});
