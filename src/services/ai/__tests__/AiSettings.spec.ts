// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAiModelSettings, loadAiModelSettings, saveAiModelSettings } from '../AiSettings';

beforeEach(() => localStorage.clear());

describe('AI model settings', () => {
  it('remembers provider endpoint/model, but never stores an API key', () => {
    saveAiModelSettings({ presetId: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'secret' } as never);
    expect(loadAiModelSettings()).toEqual({ presetId: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' });
    expect(localStorage.getItem('sea-resume_ai-model-settings')).not.toContain('secret');
    expect(localStorage.getItem('sea-resume_ai-model-settings')).not.toContain('apiKey');
  });

  it('ignores malformed persisted values and can clear settings', () => {
    localStorage.setItem('sea-resume_ai-model-settings', '{broken');
    expect(loadAiModelSettings()).toBeNull();
    saveAiModelSettings({ presetId: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' });
    clearAiModelSettings();
    expect(loadAiModelSettings()).toBeNull();
  });
});
