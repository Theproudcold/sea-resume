// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAiModelSettings, clearAiSessionApiKey, clearAiStoredApiKey, getActiveAiProviderId, getAiSessionApiKey, getAiStoredApiKey, hasAiSessionApiKey, hasAiStoredApiKey, loadAiModelSettings, loadAiProviderProfiles, saveAiModelSettings, saveAiProviderProfiles, setAiSessionApiKey, setAiStoredApiKey } from '../AiSettings';
import { isAiProviderReady, toAiProviderConfig, normalizeAiProviderOptions } from '../AiSettings';

const STORED_KEYS = 'sea-resume_ai-provider-keys';

beforeEach(() => {
  localStorage.clear();
  clearAiSessionApiKey();
});

describe('AI model settings', () => {
  it('remembers provider endpoint/model, but never stores an API key', () => {
    saveAiModelSettings({ presetId: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'secret' } as never);
    expect(loadAiModelSettings()).toMatchObject({
      presetId: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      profileId: 'provider-default',
      profileName: 'DeepSeek（兼容接口）',
    });
    expect(localStorage.getItem('sea-resume_ai-model-settings')).not.toContain('secret');
    expect(localStorage.getItem('sea-resume_ai-model-settings')).not.toContain('apiKey');
    expect(localStorage.getItem(STORED_KEYS)).toBeNull();
  });

  it('keeps API keys in session memory and can clear them', () => {
    setAiSessionApiKey('  session-secret  ');
    expect(getAiSessionApiKey()).toBe('session-secret');
    expect(hasAiSessionApiKey()).toBe(true);
    expect(localStorage.getItem('sea-resume_ai-model-settings')).toBeNull();
    clearAiSessionApiKey();
    expect(hasAiSessionApiKey()).toBe(false);
  });

  it('persists a key only after an explicit per-provider opt-in', () => {
    saveAiProviderProfiles([
      { profileId: 'deepseek-one', profileName: 'DeepSeek', presetId: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', enabled: true, models: [] },
    ], 'deepseek-one');
    setAiSessionApiKey('remembered-secret', 'deepseek-one', { remember: true });
    expect(hasAiStoredApiKey('deepseek-one')).toBe(true);
    expect(getAiStoredApiKey('deepseek-one')).toBe('remembered-secret');
    expect(localStorage.getItem(STORED_KEYS)).toContain('remembered-secret');
    // Profiles and the exportable settings mirror stay secret-free.
    expect(localStorage.getItem('sea-resume_ai-provider-profiles')).not.toContain('remembered-secret');
    expect(localStorage.getItem('sea-resume_ai-model-settings')).not.toContain('remembered-secret');

    // Unchecking forgets the stored copy; the session key keeps working until the page reloads.
    setAiSessionApiKey('remembered-secret', 'deepseek-one', { remember: false });
    expect(hasAiStoredApiKey('deepseek-one')).toBe(false);
    expect(localStorage.getItem(STORED_KEYS)).toBeNull();
    expect(getAiSessionApiKey('deepseek-one')).toBe('remembered-secret');
  });

  it('survives a page reload by reading remembered keys from storage', async () => {
    vi.resetModules();
    const first = await import('../AiSettings');
    first.saveAiProviderProfiles([
      { profileId: 'reload-one', profileName: 'Reload', presetId: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', enabled: true, models: [] },
    ], 'reload-one');
    first.setAiSessionApiKey('reload-secret', 'reload-one', { remember: true });

    vi.resetModules();
    const second = await import('../AiSettings');
    expect(second.getAiSessionApiKey('reload-one')).toBe('reload-secret');
    expect(second.hasAiSessionApiKey('reload-one')).toBe(true);
    expect(second.isAiProviderReady(second.loadAiModelSettings())).toBe(true);

    second.clearAiSessionApiKey('reload-one');
    expect(second.hasAiStoredApiKey('reload-one')).toBe(false);
    expect(localStorage.getItem(STORED_KEYS)).toBeNull();
  });

  it('ignores tampered remembered-key storage and rejects overlong keys', () => {
    localStorage.setItem(STORED_KEYS, '{broken');
    expect(hasAiStoredApiKey()).toBe(false);
    localStorage.setItem(STORED_KEYS, JSON.stringify({ bad: 12, 'ok-id': '  valid-key  ' }));
    expect(getAiStoredApiKey('ok-id')).toBe('valid-key');
    expect(hasAiStoredApiKey('bad')).toBe(false);
    expect(() => setAiStoredApiKey('x'.repeat(4097), 'ok-id')).toThrow('过长');
    clearAiStoredApiKey();
    expect(localStorage.getItem(STORED_KEYS)).toBeNull();
  });

  it('stores multiple service profiles and keeps their session keys isolated', () => {
    const profiles = [
      { profileId: 'openai-one', profileName: 'OpenAI 工作', presetId: 'openai' as const, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', enabled: true, models: ['gpt-4o-mini', 'gpt-4.1'] },
      { profileId: 'qwen-one', profileName: '通义千问', presetId: 'qwen' as const, baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', enabled: true, models: ['qwen-plus'] },
    ];
    saveAiProviderProfiles(profiles, 'openai-one');
    setAiSessionApiKey('openai-key', 'openai-one');
    setAiSessionApiKey('qwen-key', 'qwen-one');

    expect(loadAiProviderProfiles()).toEqual(profiles.map(profile => ({ ...profile, authMode: 'bearer', jsonMode: true, timeoutMs: 90000 })));
    expect(loadAiModelSettings()?.profileId).toBe('openai-one');
    expect(getAiSessionApiKey()).toBe('openai-key');
    expect(getAiSessionApiKey('qwen-one')).toBe('qwen-key');
    expect(localStorage.getItem('sea-resume_ai-provider-profiles')).not.toContain('openai-key');

    saveAiProviderProfiles(profiles, 'qwen-one');
    expect(loadAiModelSettings()?.profileId).toBe('qwen-one');
    expect(getAiSessionApiKey()).toBe('qwen-key');
  });

  it('requires an enabled provider for default model selection', () => {
    const profiles = [
      { profileId: 'first', profileName: 'First', presetId: 'openai' as const, baseUrl: 'https://api.openai.com/v1', model: 'one', enabled: false, models: [] },
      { profileId: 'second', profileName: 'Second', presetId: 'qwen' as const, baseUrl: 'https://example.com/v1', model: 'two', enabled: true, models: [] },
    ];
    saveAiProviderProfiles(profiles, 'first');
    expect(getActiveAiProviderId()).toBe('second');
    expect(loadAiModelSettings()?.profileId).toBe('second');

    saveAiProviderProfiles(profiles.map((profile) => ({ ...profile, enabled: false })), 'second');
    expect(getActiveAiProviderId()).toBeNull();
    expect(loadAiModelSettings()).toBeNull();
  });

  it('ignores malformed persisted values and can clear settings', () => {
    localStorage.setItem('sea-resume_ai-model-settings', '{broken');
    expect(loadAiModelSettings()).toBeNull();
    saveAiModelSettings({ presetId: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' });
    clearAiModelSettings();
    expect(loadAiModelSettings()).toBeNull();
  });
  it('preserves local options in profiles and the legacy mirror without keys', () => {
    const settings = { presetId: 'ollama' as const, baseUrl: 'http://localhost:11434/v1', model: 'llama3', authMode: 'none' as const, jsonMode: false, timeoutMs: 180000 };
    saveAiModelSettings(settings);
    expect(loadAiModelSettings()).toMatchObject(settings);
    expect(isAiProviderReady(loadAiModelSettings())).toBe(true);
    expect(toAiProviderConfig(loadAiModelSettings(), 'ignored')).toEqual({ baseUrl: settings.baseUrl, model: settings.model, authMode: 'none', jsonMode: false, timeoutMs: 180000, apiKey: '' });
    localStorage.removeItem('sea-resume_ai-provider-profiles');
    expect(loadAiModelSettings()).toMatchObject(settings);
  });
  it('defaults old options safely and bounds invalid timeout values', () => {
    expect(normalizeAiProviderOptions()).toEqual({ authMode: 'bearer', jsonMode: true, timeoutMs: 90000 });
    expect(normalizeAiProviderOptions({ timeoutMs: NaN }).timeoutMs).toBe(90000);
    expect(normalizeAiProviderOptions({ timeoutMs: -1 }).timeoutMs).toBe(1000);
    expect(normalizeAiProviderOptions({ timeoutMs: 1e12 }).timeoutMs).toBe(600000);
  });
  it('requires keys for old profiles and restricts no-auth to loopback', () => {
    const settings = { baseUrl: 'https://example.com/v1', model: 'test' };
    expect(isAiProviderReady(settings, '')).toBe(false);
    expect(isAiProviderReady(settings, 'key')).toBe(true);
    for (const baseUrl of ['https://example.com/v1', 'http://192.168.1.1/v1', 'http://localhost.evil/v1', 'http://user:pass@localhost/v1']) expect(isAiProviderReady({ ...settings, baseUrl, authMode: 'none' }, 'key')).toBe(false);
    for (const baseUrl of ['http://localhost/v1', 'https://127.0.0.2/v1', 'http://[::1]/v1']) expect(isAiProviderReady({ ...settings, baseUrl, authMode: 'none' }, '')).toBe(true);
  });
});
