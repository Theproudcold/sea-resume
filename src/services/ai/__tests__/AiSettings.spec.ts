// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAiModelSettings, clearAiSessionApiKey, getActiveAiProviderId, getAiSessionApiKey, hasAiSessionApiKey, loadAiModelSettings, loadAiProviderProfiles, saveAiModelSettings, saveAiProviderProfiles, setAiSessionApiKey } from '../AiSettings';
import { isAiProviderReady, toAiProviderConfig, normalizeAiProviderOptions } from '../AiSettings';

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
  });

  it('keeps API keys in session memory and can clear them', () => {
    setAiSessionApiKey('  session-secret  ');
    expect(getAiSessionApiKey()).toBe('session-secret');
    expect(hasAiSessionApiKey()).toBe(true);
    expect(localStorage.getItem('sea-resume_ai-model-settings')).toBeNull();
    clearAiSessionApiKey();
    expect(hasAiSessionApiKey()).toBe(false);
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
