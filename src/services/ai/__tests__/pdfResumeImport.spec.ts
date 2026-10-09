import { describe, expect, it } from 'vitest';
import { joinPdfTextItems, parseAiPdfMarkdownResponse, validatePdfFileMetadata } from '../pdfResumeImport';

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
});
