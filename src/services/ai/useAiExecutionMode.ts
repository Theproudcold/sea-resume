import { ref } from 'vue';

export type AiDriverPreference = 'auto' | 'mcp' | 'api';
export type ResolvedAiDriver = 'mcp' | 'api' | 'none';

const DRIVER_PREFERENCE_KEY = 'sea-resume_ai-driver-mode';

function readPreference(): AiDriverPreference {
  try {
    const raw = localStorage.getItem(DRIVER_PREFERENCE_KEY);
    if (raw === 'mcp' || raw === 'api' || raw === 'auto') return raw;
  } catch { /* 存储不可用时回退自动模式 */ }
  return 'auto';
}

const driverPreference = ref<AiDriverPreference>(readPreference());

export function setAiDriverPreference(next: AiDriverPreference): void {
  driverPreference.value = next;
  try {
    localStorage.setItem(DRIVER_PREFERENCE_KEY, next);
  } catch { /* 忽略受限存储 */ }
}

/**
 * 统一解析当前 AI 执行通道：
 * - MCP 已连接时优先满足免 API Key 体验（除非用户显式切回网页 API 且网页 API 已就绪）；
 * - 未连接 MCP 时行为与原有网页 API Key / 本机 Ollama 逻辑完全一致。
 */
export function resolveAiDriver(
  mcpConnected: boolean,
  apiReady: boolean,
  preference: AiDriverPreference = driverPreference.value,
): ResolvedAiDriver {
  if (preference === 'api' && apiReady) return 'api';
  if (preference === 'mcp' && mcpConnected) return 'mcp';
  if (mcpConnected) return 'mcp';
  if (apiReady) return 'api';
  return 'none';
}

export function useAiDriverPreference() {
  return {
    driverPreference,
    setAiDriverPreference,
  };
}
