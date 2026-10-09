// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestResumeAiDraft } from '../AiProvider';
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
});
