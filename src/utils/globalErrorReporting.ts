import type { App } from 'vue';
import { ElMessage } from 'element-plus';
import { isChunkLoadError, recoverFromChunkLoadError } from './chunkLoadRecovery';

const REPEAT_WINDOW_MS = 5000;
const recentMessages = new Map<string, number>();

// chunk 加载失败可能同时触发 router.onError 与 unhandledrejection，
// 统一用同一段文案上报，让去重逻辑把它们合并成一条提示。
const CHUNK_ERROR_SCOPE = '页面加载失败';
const CHUNK_ERROR_DETAIL = '页面资源已更新，请刷新后重试';

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return '未知错误';
}

/**
 * 统一的运行时错误上报：控制台保留完整错误，界面给出简短提示。
 * 相同错误在短时间内只提示一次，避免重复弹窗。
 * 懒加载 chunk 失效属于可自愈问题，优先自动刷新而不是弹窗。
 */
export function reportRuntimeError(scope: string, error: unknown): void {
  console.error(`${scope}:`, error);
  const chunkError = isChunkLoadError(error);
  if (chunkError) {
    // 刷新成功则不再打扰用户；已被节流说明刷新无效，退化为可读提示。
    if (recoverFromChunkLoadError() === 'reloaded') return;
    scope = CHUNK_ERROR_SCOPE;
    error = CHUNK_ERROR_DETAIL;
  }
  const key = `${scope}|${describe(error)}`;
  const now = Date.now();
  if ((recentMessages.get(key) ?? 0) > now - REPEAT_WINDOW_MS) return;
  recentMessages.set(key, now);
  try {
    ElMessage.error(`${scope}：${describe(error).slice(0, 300)}`);
  } catch {
    // 提示失败不应影响主流程。
  }
}

/**
 * 安装全局错误捕获。此前渲染或异步错误只会让界面静默卡住，用户看不到任何原因。
 */
export function installGlobalErrorReporting(app: App): void {
  app.config.errorHandler = (error) => reportRuntimeError('界面渲染出错', error);
  if (typeof window === 'undefined') return;
  window.addEventListener('unhandledrejection', (event) => {
    reportRuntimeError('未处理的异步错误', (event as PromiseRejectionEvent).reason);
  });
  window.addEventListener('error', (event) => {
    // 资源加载失败（图片、字体）不弹窗，只处理脚本错误。
    if (!(event instanceof ErrorEvent) || !event.message) return;
    reportRuntimeError('页面运行错误', event.error ?? event.message);
  });
  // Vite 在预加载/动态导入失败时会派发该事件，payload 为原始错误。
  window.addEventListener('vite:preloadError', (event) => {
    const payload: unknown = event.payload;
    if (!isChunkLoadError(payload)) return;
    event.preventDefault();
    reportRuntimeError('页面加载失败', payload);
  });
}
