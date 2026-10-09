import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { applyResumeAiOperations, parseResumeAiDraft } from '@/services/ai/resumeTools';

const resume = parseResumeMarkdown(`# Mei\n\n## 工作经历\n### Example | Engineer | 2022.01 — 至今\n- Build tools`).resume;

describe('resume AI tools', () => {
  it('parses only the typed allowlisted actions', () => {
    const draft = parseResumeAiDraft(JSON.stringify({ explanation: '润色简介', operations: [{ type: 'set_basic', field: 'summary', value: '专注工程效率' }] }));
    expect(draft.operations).toHaveLength(1);
    expect(() => parseResumeAiDraft({ operations: [{ type: 'run_javascript', code: 'alert(1)' }] })).toThrow('不允许');
    expect(() => parseResumeAiDraft({ operations: [{ type: 'set_basic', field: 'id', value: 'another' }] })).toThrow('不允许');
  });

  it('applies edits to a clone and rejects missing targets and unsafe links', () => {
    const originalSummary = resume.basic.summary;
    const updated = applyResumeAiOperations(resume, [{ type: 'set_basic', field: 'summary', value: '保持事实，不编造。' }]);
    expect(originalSummary).toBeUndefined();
    expect(resume.basic.summary).toBeUndefined();
    expect(updated.basic.summary).toContain('保持事实');
    expect(() => applyResumeAiOperations(resume, [{ type: 'update_experience', id: 'unknown', field: 'company', value: 'bad' }])).toThrow('不存在');
    expect(() => applyResumeAiOperations(resume, [{ type: 'set_basic', field: 'website', value: 'javascript:alert(1)' }])).toThrow('不安全');
  });
});
