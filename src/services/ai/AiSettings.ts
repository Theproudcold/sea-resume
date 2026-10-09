export type AiProviderPresetId = 'openai' | 'deepseek' | 'qwen' | 'custom';

export interface AiModelSettings {
  presetId: AiProviderPresetId;
  baseUrl: string;
  model: string;
}

export interface AiProviderPreset {
  id: AiProviderPresetId;
  label: string;
  baseUrl: string;
  model: string;
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'deepseek', label: 'DeepSeek（兼容接口）', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'qwen', label: '通义千问（兼容接口）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'custom', label: '自定义 OpenAI-compatible 接口', baseUrl: '', model: '' },
];

const SETTINGS_KEY = 'sea-resume_ai-model-settings';
const presetIds = new Set<AiProviderPresetId>(AI_PROVIDER_PRESETS.map((preset) => preset.id));

/** Read only non-secret AI settings. Credentials are intentionally not part of this schema. */
export function loadAiModelSettings(): AiModelSettings | null {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return null;
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== 'object') return null;
    const settings = value as Record<string, unknown>;
    if (typeof settings.presetId !== 'string' || !presetIds.has(settings.presetId as AiProviderPresetId)) return null;
    if (typeof settings.baseUrl !== 'string' || typeof settings.model !== 'string') return null;
    if (settings.baseUrl.length > 2048 || settings.model.length > 200) return null;
    return { presetId: settings.presetId as AiProviderPresetId, baseUrl: settings.baseUrl, model: settings.model };
  } catch {
    return null;
  }
}

export function saveAiModelSettings(settings: AiModelSettings): void {
  if (!presetIds.has(settings.presetId) || settings.baseUrl.length > 2048 || settings.model.length > 200) {
    throw new Error('AI 服务配置无效。');
  }
  // Explicitly serialize an allowlist; accidental apiKey properties can never be persisted.
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    presetId: settings.presetId,
    baseUrl: settings.baseUrl,
    model: settings.model,
  }));
}

export function clearAiModelSettings(): void {
  localStorage.removeItem(SETTINGS_KEY);
}
