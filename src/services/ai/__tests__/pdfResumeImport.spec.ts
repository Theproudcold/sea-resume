import { afterEach, describe, expect, it, vi } from 'vitest';
import { joinPdfTextItems, parseAiPdfMarkdownResponse, validatePdfFileMetadata, requestAiPdfMarkdown } from '../pdfResumeImport';
afterEach(() => vi.unstubAllGlobals());

describe('AI PDF resume import helpers', () => {
  it('validates PDF size and filename locally', () => {
    expect(() => validatePdfFileMetadata({ name: 'resume.pdf', size: 1024 })).not.toThrow();
    expect(() => validatePdfFileMetadata({ name: 'resume.txt', size: 1024 })).toThrow('PDF');
    expect(() => validatePdfFileMetadata({ name: 'resume.pdf', size: 16 * 1024 * 1024 })).toThrow('15 MB');
  });

  it('joins PDF text items and preserves line breaks', () => {
    expect(joinPdfTextItems([{ str: '姓名：林晓', hasEOL: true }, { str: '邮箱: lin@example.com', hasEOL: false }]))
      .toBe('姓名：林晓\n邮箱: lin@example.com');
  });

  it('accepts only bounded JSON Markdown results', () => {
    expect(parseAiPdfMarkdownResponse('{"markdown":"# 林晓","explanation":"提取完成"}')).toEqual({
      markdown: '# 林晓', explanation: '提取完成',
    });
    expect(() => parseAiPdfMarkdownResponse('{"markdown":""}')).toThrow('没有返回');
    expect(() => parseAiPdfMarkdownResponse('not-json')).toThrow('JSON');
  });
  it('uses local keyless transport with optional JSON mode and validates the result', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"markdown":"# Candidate"}' } }] })));
    vi.stubGlobal('fetch', fetcher);
    const local = { baseUrl: 'http://localhost:11434/v1', model: 'llama3', apiKey: '', authMode: 'none' as const, jsonMode: false };
    await expect(requestAiPdfMarkdown(local, 'resume.pdf', 'Local extracted text')).resolves.toMatchObject({ markdown: '# Candidate' });
    expect(new Headers(fetcher.mock.calls[0]![1].headers).has('Authorization')).toBe(false);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).response_format).toBeUndefined();
    await expect(requestAiPdfMarkdown({ ...local, baseUrl: 'https://remote.example/v1' }, 'resume.pdf', 'text')).rejects.toThrow('loopback');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
