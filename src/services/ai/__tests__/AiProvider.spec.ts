// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listProviderModels, requestResumeAiDraft } from '../AiProvider';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';

afterEach(() => vi.unstubAllGlobals());

describe('AI provider privacy', () => {
  it('does not send stored birthDate even when the selected resume includes one', async () => {
    const resume = parseResumeMarkdown('---\nname: Mei\nbirthdate: 1990-01-02\n---\n# Mei').resume;
    resume.basic.birthDate = '1990-01-02';
    const content = JSON.stringify({ operations: [{ type: 'set_basic', field: 'title', value: 'Engineer' }] });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await requestResumeAiDraft({ baseUrl: 'https://api.example.com/v1', apiKey: 'session-key', model: 'model-1' }, resume, 'update title');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(init.body)) as { messages: Array<{ content: string }> };
    const userPayload = JSON.parse(payload.messages[1]?.content || '{}') as { selectedResume: { basic: Record<string, unknown> } };
    expect(userPayload.selectedResume.basic.birthDate).toBeUndefined();
    expect(resume.basic.birthDate).toBe('1990-01-02');
  });
  it('fetches and sorts models from an OpenAI-compatible models endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'model-z' }, { id: 'model-a' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listProviderModels('https://api.example.com/v1', 'test-key')).resolves.toEqual(['model-a', 'model-z']);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/models');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-key');
  });

  it('explains that models may need to be entered manually when listing is blocked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(listProviderModels('https://api.example.com/v1', 'test-key')).rejects.toThrow('浏览器跨域限制');
  });
  it('lists local models without a key or Authorization header', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'llama3' }] })));
    vi.stubGlobal('fetch', fetcher);
    await expect(listProviderModels('http://localhost:11434/v1', '', { authMode: 'none' })).resolves.toEqual(['llama3']);
    expect(new Headers(fetcher.mock.calls[0]![1].headers).has('Authorization')).toBe(false);
    await expect(listProviderModels('https://example.com/v1', '', { authMode: 'none' })).rejects.toThrow('loopback');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
