import type { AiProviderConfig } from '@/types/ai';

export type AiProviderPresetId = 'openai' | 'deepseek' | 'qwen' | 'ollama' | 'lmstudio' | 'custom';
export interface AiProviderOptions {
  authMode?: 'bearer' | 'none';
  jsonMode?: boolean;
  timeoutMs?: number;
}
export interface AiModelSettings extends AiProviderOptions {
  presetId: AiProviderPresetId;
  baseUrl: string;
  model: string;
  profileId?: string;
  profileName?: string;
}

export interface AiProviderProfile extends AiModelSettings {
  profileId: string;
  profileName: string;
  enabled: boolean;
  models: string[];
}

export interface AiProviderPreset extends AiProviderOptions {
  id: AiProviderPresetId;
  label: string;
  baseUrl: string;
  model: string;
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'deepseek', label: 'DeepSeek（兼容接口）', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'qwen', label: '通义千问（兼容接口）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: '', authMode: 'none' },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: '', authMode: 'none' },
  { id: 'custom', label: '自定义 OpenAI-compatible 接口', baseUrl: '', model: '' },
];

const SETTINGS_KEY = 'sea-resume_ai-model-settings';
const PROVIDERS_KEY = 'sea-resume_ai-provider-profiles';
const ACTIVE_PROVIDER_KEY = 'sea-resume_ai-active-provider';
const DEFAULT_PROFILE_ID = 'provider-default';
const MAX_PROFILES = 30;
const MAX_MODELS_PER_PROFILE = 1000;
const presetIds = new Set<AiProviderPresetId>(AI_PROVIDER_PRESETS.map((preset) => preset.id));
const sessionApiKeys = new Map<string, string>();

function isPresetId(value: unknown): value is AiProviderPresetId {
  return typeof value === 'string' && presetIds.has(value as AiProviderPresetId);
}

function parseLegacySettings(): AiModelSettings | null {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return null;
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const settings = value as Record<string, unknown>;
    if (!isPresetId(settings.presetId) || typeof settings.baseUrl !== 'string' || typeof settings.model !== 'string') return null;
    if (settings.baseUrl.length > 2048 || settings.model.length > 200) return null;
    return { presetId: settings.presetId, baseUrl: settings.baseUrl, model: settings.model, ...normalizeAiProviderOptions(settings) };
  } catch {
    return null;
  }
}

/** Credentials are intentionally excluded; legacy single-provider settings are migrated on read. */
export function loadAiProviderProfiles(): AiProviderProfile[] {
  try {
    const saved = localStorage.getItem(PROVIDERS_KEY);
    if (saved !== null) {
      const value: unknown = JSON.parse(saved);
      if (!Array.isArray(value)) return [];
      const profiles = value.slice(0, MAX_PROFILES).flatMap((entry): AiProviderProfile[] => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
        const profile = entry as Record<string, unknown>;
        if (typeof profile.profileId !== 'string' || !profile.profileId || profile.profileId.length > 120) return [];
        if (typeof profile.profileName !== 'string' || !profile.profileName.trim() || profile.profileName.length > 80) return [];
        if (!isPresetId(profile.presetId) || typeof profile.baseUrl !== 'string' || typeof profile.model !== 'string') return [];
        if (profile.baseUrl.length > 2048 || profile.model.length > 200) return [];
        const models = Array.isArray(profile.models)
          ? profile.models.filter((item): item is string => typeof item === 'string' && item.length <= 200).slice(0, MAX_MODELS_PER_PROFILE)
          : [];
        return [{
          profileId: profile.profileId,
          profileName: profile.profileName.trim(),
          presetId: profile.presetId,
          baseUrl: profile.baseUrl,
          model: profile.model,
          enabled: profile.enabled !== false,
          ...normalizeAiProviderOptions(profile),
          models,
        }];
      });
      return profiles.filter((profile, index) => profiles.findIndex((candidate) => candidate.profileId === profile.profileId) === index);
    }
  } catch {
    // Fall through to the previous single-provider setting format.
  }

  const legacy = parseLegacySettings();
  if (!legacy) return [];
  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === legacy.presetId);
  return [{
    ...legacy,
    profileId: DEFAULT_PROFILE_ID,
    profileName: preset?.label ?? 'AI 服务',
    enabled: true,
    models: [],
  }];
}

/** Returns the saved default provider, or the first enabled provider if that default was disabled. */
export function getActiveAiProviderId(): string | null {
  const enabledProfiles = loadAiProviderProfiles().filter((profile) => profile.enabled);
  if (!enabledProfiles.length) return null;
  try {
    const activeId = localStorage.getItem(ACTIVE_PROVIDER_KEY);
    if (activeId && enabledProfiles.some((profile) => profile.profileId === activeId)) return activeId;
  } catch {
    // Use the first enabled profile when storage is unavailable.
  }
  return enabledProfiles[0]?.profileId ?? null;
}

export function loadAiModelSettings(): AiModelSettings | null {
  const profiles = loadAiProviderProfiles();
  const activeId = getActiveAiProviderId();
  if (!activeId) return null;
  const active = profiles.find((profile) => profile.profileId === activeId && profile.enabled);
  if (!active) return null;
  return {
    profileId: active.profileId,
    profileName: active.profileName,
    presetId: active.presetId,
    baseUrl: active.baseUrl,
    model: active.model,
    ...normalizeAiProviderOptions(active),
  };
}

export function saveAiProviderProfiles(profiles: AiProviderProfile[], activeProviderId?: string): void {
  if (profiles.length > MAX_PROFILES) throw new Error(`最多支持 ${MAX_PROFILES} 个服务商配置。`);
  const normalized = profiles.map((profile) => {
    if (!profile.profileId.trim() || profile.profileId.length > 120 || !profile.profileName.trim() || profile.profileName.length > 80) {
      throw new Error('AI 服务商名称或 ID 无效。');
    }
    if (!isPresetId(profile.presetId) || profile.baseUrl.length > 2048 || profile.model.length > 200) {
      throw new Error('AI 服务配置无效。');
    }
    return {
      profileId: profile.profileId.trim(),
      profileName: profile.profileName.trim(),
      presetId: profile.presetId,
      baseUrl: profile.baseUrl.trim(),
      model: profile.model.trim(),
      ...normalizeAiProviderOptions(profile),
      enabled: profile.enabled !== false,
      models: Array.isArray(profile.models)
        ? profile.models.filter((item): item is string => typeof item === 'string' && item.length <= 200).slice(0, MAX_MODELS_PER_PROFILE)
        : [],
    } satisfies AiProviderProfile;
  });
  if (new Set(normalized.map((profile) => profile.profileId)).size !== normalized.length) {
    throw new Error('服务商配置 ID 不能重复。');
  }

  if (!normalized.length) {
    clearAiModelSettings();
    return;
  }

  const active = normalized.find((profile) => profile.profileId === activeProviderId && profile.enabled)
    ?? normalized.find((profile) => profile.enabled);
  if (active) localStorage.setItem(ACTIVE_PROVIDER_KEY, active.profileId);
  else localStorage.removeItem(ACTIVE_PROVIDER_KEY);

  localStorage.setItem(PROVIDERS_KEY, JSON.stringify(normalized));
  // Keep a non-secret legacy mirror for older app builds and existing integrations.
  const legacyMirror = active ?? normalized[0]!;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    presetId: legacyMirror.presetId,
    baseUrl: legacyMirror.baseUrl,
    model: legacyMirror.model,
    ...normalizeAiProviderOptions(legacyMirror),
  }));
}

export function saveAiModelSettings(settings: AiModelSettings): void {
  if (!isPresetId(settings.presetId) || settings.baseUrl.length > 2048 || settings.model.length > 200) {
    throw new Error('AI 服务配置无效。');
  }
  const profiles = loadAiProviderProfiles();
  const profileId = settings.profileId || getActiveAiProviderId() || DEFAULT_PROFILE_ID;
  const existing = profiles.find((profile) => profile.profileId === profileId);
  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === settings.presetId);
  const updated: AiProviderProfile = {
    profileId,
    profileName: settings.profileName?.trim() || existing?.profileName || preset?.label || 'AI 服务',
    presetId: settings.presetId,
    baseUrl: settings.baseUrl,
    model: settings.model,
    ...normalizeAiProviderOptions({ ...existing, ...settings }),
    enabled: existing?.enabled ?? true,
    models: existing?.models ?? [],
  };
  saveAiProviderProfiles(
    existing ? profiles.map((profile) => profile.profileId === profileId ? updated : profile) : [...profiles, updated],
    profileId,
  );
}

export function clearAiModelSettings(): void {
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(PROVIDERS_KEY);
  localStorage.removeItem(ACTIVE_PROVIDER_KEY);
  sessionApiKeys.clear();
}

function resolveProfileId(profileId?: string): string {
  return profileId || getActiveAiProviderId() || DEFAULT_PROFILE_ID;
}

/** Keep credentials in page memory only; each configured provider has its own session key. */
export function getAiSessionApiKey(profileId?: string): string {
  return sessionApiKeys.get(resolveProfileId(profileId)) ?? '';
}

export function setAiSessionApiKey(apiKey: string, profileId?: string): void {
  const id = resolveProfileId(profileId);
  const normalized = apiKey.trim();
  if (normalized) sessionApiKeys.set(id, normalized);
  else sessionApiKeys.delete(id);
}

export function hasAiSessionApiKey(profileId?: string): boolean {
  return sessionApiKeys.has(resolveProfileId(profileId));
}

export function clearAiSessionApiKey(profileId?: string): void {
  if (profileId) sessionApiKeys.delete(profileId);
  else sessionApiKeys.clear();
}

export const AI_TIMEOUT_MIN_MS = 1000;
export const AI_TIMEOUT_MAX_MS = 600000;
export const AI_TIMEOUT_DEFAULT_MS = 90000;

export function normalizeAiProviderOptions(value: { authMode?: unknown; jsonMode?: unknown; timeoutMs?: unknown } = {}): Required<AiProviderOptions> {
  return {
    authMode: value.authMode === 'none' ? 'none' : 'bearer',
    jsonMode: typeof value.jsonMode === 'boolean' ? value.jsonMode : true,
    timeoutMs: typeof value.timeoutMs === 'number' && Number.isFinite(value.timeoutMs)
      ? Math.min(AI_TIMEOUT_MAX_MS, Math.max(AI_TIMEOUT_MIN_MS, Math.round(value.timeoutMs))) : AI_TIMEOUT_DEFAULT_MS,
  };
}

/** No DNS aliases, LAN hosts or remote keyless endpoints. */
export function isAiLoopbackUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && (['localhost', '[::1]'].includes(url.hostname) || /^127(?:\.\d{1,3}){3}$/.test(url.hostname));
  } catch { return false; }
}

export function aiAuthorizationHeaders(baseUrl: string, key = '', options: AiProviderOptions = {}): Record<string, string> {
  const url = new URL(baseUrl.trim());
  if (url.username || url.password || (url.protocol !== 'https:' && !isAiLoopbackUrl(baseUrl))) throw new Error('AI 服务地址无效；远程服务仅允许 HTTPS。');
  if (normalizeAiProviderOptions(options).authMode === 'none') {
    if (!isAiLoopbackUrl(baseUrl)) throw new Error('无鉴权仅允许本机 loopback 服务。');
    return {};
  }
  if (!key.trim()) throw new Error('请配置本次会话 API Key。');
  return { Authorization: `Bearer ${key.trim()}` };
}

type AiReadySettings = AiProviderOptions & { baseUrl: string; model: string; profileId?: string; enabled?: boolean };
export function isAiProviderReady(settings: AiReadySettings | null | undefined, key?: string): boolean {
  if (!settings || settings.enabled === false || !settings.model.trim() || !settings.baseUrl.trim()) return false;
  try { aiAuthorizationHeaders(settings.baseUrl, key ?? getAiSessionApiKey(settings.profileId), settings); return true; }
  catch { return false; }
}

export function toAiProviderConfig(settings: AiReadySettings | null | undefined, key?: string): AiProviderConfig {
  if (!settings || !isAiProviderReady(settings, key)) throw new Error('请配置有效的模型服务及所需会话 API Key；无鉴权仅支持本机服务。');
  const options = normalizeAiProviderOptions(settings);
  return { baseUrl: settings.baseUrl.trim(), model: settings.model.trim(), apiKey: options.authMode === 'none' ? '' : (key ?? getAiSessionApiKey(settings.profileId)).trim(), ...options };
}
