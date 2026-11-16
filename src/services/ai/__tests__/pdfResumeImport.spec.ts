import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildVisionTruncationWarning,
  parseAiPdfMarkdownResponse,
  positionedItems,
  requestAiPdfMarkdown,
  requestAiPdfMarkdownFromImages,
  toAiPdfMarkdownResult,
  validatePdfFileMetadata,
} from '../pdfResumeImport';
afterEach(() => vi.unstubAllGlobals());

describe('AI PDF resume import helpers', () => {
  it('validates PDF size and filename locally', () => {
    expect(() => validatePdfFileMetadata({ name: 'resume.pdf', size: 1024 })).not.toThrow();
    expect(() => validatePdfFileMetadata({ name: 'resume.txt', size: 1024 })).toThrow('PDF');
    expect(() => validatePdfFileMetadata({ name: 'resume.pdf', size: 16 * 1024 * 1024 })).toThrow('15 MB');
  });

  it('accepts only bounded JSON Markdown results', () => {
    expect(parseAiPdfMarkdownResponse('{"markdown":"# 林晓","explanation":"提取完成"}')).toEqual({
      markdown: '# 林晓', explanation: '提取完成',
    });
    expect(() => parseAiPdfMarkdownResponse('{"markdown":""}')).toThrow('没有返回');
    expect(() => parseAiPdfMarkdownResponse('not-json')).toThrow('JSON');
  });
  it('validates an already-parsed AI object without a round trip through JSON', () => {
    expect(toAiPdfMarkdownResult({ markdown: ' # 林晓 ', explanation: 'ok' })).toEqual({ markdown: ' # 林晓 ', explanation: 'ok' });
    expect(toAiPdfMarkdownResult({ markdown: '# A' }).explanation).toBe('请检查 AI 识别出的简历信息。');
    expect(() => toAiPdfMarkdownResult([{ markdown: '# A' }])).toThrow('结构无效');
    expect(() => toAiPdfMarkdownResult({ markdown: 42 })).toThrow('没有返回');
  });

  it('warns when vision mode cannot cover every PDF page', () => {
    expect(buildVisionTruncationWarning(18, 12)).toEqual({
      code: 'truncated-pages',
      message: 'PDF 共 18 页，视觉识别单次最多发送 12 页；后 6 页未识别，请拆分后单独导入。',
    });
    expect(buildVisionTruncationWarning(12, 12)).toBeNull();
    expect(buildVisionTruncationWarning(8, 12)).toBeNull();
    expect(buildVisionTruncationWarning(Number.NaN, 12)).toBeNull();
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

  it('sends the exact Markdown contract the parser expects', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"markdown":"# A"}' } }] })));
    vi.stubGlobal('fetch', fetcher);
    await requestAiPdfMarkdown({ baseUrl: 'https://api.example.com/v1', model: 'gpt-4o-mini', apiKey: 'k', authMode: 'bearer' }, 'resume.pdf', '文本');
    const body = JSON.parse(fetcher.mock.calls[0]![1].body);
    const system = body.messages[0].content as string;
    expect(system).toContain('## 工作经历');
    expect(system).toContain('### <公司> | <职位> | <YYYY-MM> — <YYYY-MM 或 至今>');
    expect(system).toContain('## 教育背景');
    expect(system).toContain('不要编造');
    expect(system).toContain('不要并进工作经历或项目经历');
    expect(system).not.toContain('可量化');
    expect(body.temperature).toBe(0.1);
  });

  it('sends page images as image_url parts only when the user chose vision mode', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"markdown":"# B"}' } }] })));
    vi.stubGlobal('fetch', fetcher);
    const config = { baseUrl: 'https://api.example.com/v1', model: 'gpt-4o', apiKey: 'k', authMode: 'bearer' as const };
    const images = ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'];
    await expect(requestAiPdfMarkdownFromImages(config, 'resume.pdf', images)).resolves.toMatchObject({ markdown: '# B' });
    const parts = JSON.parse(fetcher.mock.calls[0]![1].body).messages[1].content as Array<Record<string, unknown>>;
    expect(parts[0]).toMatchObject({ type: 'text' });
    expect(parts.slice(1)).toEqual(images.map((url) => ({ type: 'image_url', image_url: { url } })));
    await expect(requestAiPdfMarkdownFromImages(config, 'resume.pdf', [])).rejects.toThrow('没有可发送的页面图片');
  });

  it('converts pdf text items into top-down layout coordinates', () => {
    // viewport 会把 PDF 左下原点翻转到左上原点，否则阅读顺序会上下颠倒。
    const items = positionedItems(
      [{ str: '于海波', transform: [1, 0, 0, 1, 10, 20], width: 30, height: 12 }],
      [2, 0, 0, -2, 0, 800],
    );
    expect(items).toEqual([{ text: '于海波', x: 20, y: 760, width: 60, height: 24 }]);
    expect(positionedItems([{ str: '' }, { str: 'x', transform: 'bad' }], [1, 0, 0, 1, 0, 0])).toEqual([
      { text: 'x', x: 0, y: 0, width: 0, height: 0 },
    ]);
  });
});
