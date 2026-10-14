// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validateResumeData } from '@/utils/export-json';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { MAX_JSON_IMPORT_FILE_SIZE, validateJsonImportFileSize } from '@/utils/importLimits';

describe('validateResumeData', () => {
  it('keeps valid resume data and fills compatible theme defaults', () => {
    const parsed = parseResumeMarkdown('# Jia\n\n## 技能\n- Vue').resume;
    const validated = validateResumeData(parsed);
    expect(validated.basic.name).toBe('Jia');
    expect(validated.theme.moduleMargins).toEqual({ top: 0, bottom: 24, left: 0, right: 0 });
    expect(validated.sectionOrder).toEqual(parsed.sectionOrder);
  });

  it('preserves the AI Agent template when importing Markdown and JSON resume data', () => {
    const imported = parseResumeMarkdown('---\ntemplate: ai-agent\n---\n# Jia').resume;
    expect(imported.templateId).toBe('ai-agent');
    expect(validateResumeData(imported).templateId).toBe('ai-agent');
  });

  it('preserves custom contact labels, values, and icons when importing JSON data', () => {
    const parsed = parseResumeMarkdown('# Jia').resume;
    const imported = validateResumeData({
      ...parsed,
      basic: {
        ...parsed.basic,
        customContacts: [{ id: 'contact-1', label: '微信', value: 'jia-dev', icon: 'ChatDotRound' }],
      },
    });

    expect(imported.basic.customContacts).toEqual([
      { id: 'contact-1', label: '微信', value: 'jia-dev', icon: 'ChatDotRound' },
    ]);
  });

  it('rejects malformed structures and sanitizes rich-text HTML', () => {
    const parsed = parseResumeMarkdown('# Jia\n\n## 工作经历\n### Acme | Engineer\n- Ship product').resume;
    const untrusted = {
      ...parsed,
      basic: { ...parsed.basic, avatar: 'https://tracker.example/pixel.png', summary: '<p>Safe <strong>text</strong></p><script>alert(1)</script><img src="https://tracker.example/pixel.png">' },
      experiences: [{ ...parsed.experiences[0], description: '<p>Work</p><iframe src="https://tracker.example"></iframe>' }],
    };
    const validated = validateResumeData(untrusted);
    expect(validated.basic.avatar).toBeUndefined();
    expect(validated.basic.summary).toContain('<strong>text</strong>');
    expect(validated.basic.summary).not.toContain('<script');
    expect(validated.basic.summary).not.toContain('<img');
    expect(validated.experiences[0]?.description).not.toContain('<iframe');
    expect(() => validateResumeData({ basic: {}, experiences: [null] })).toThrow();
  });

  it('enforces a shared JSON import size limit before reading files', () => {
    expect(() => validateJsonImportFileSize(MAX_JSON_IMPORT_FILE_SIZE)).not.toThrow();
    expect(() => validateJsonImportFileSize(MAX_JSON_IMPORT_FILE_SIZE + 1)).toThrow('不能超过 20 MB');
    expect(() => validateJsonImportFileSize(Number.NaN)).toThrow('大小无效');
  });
});
