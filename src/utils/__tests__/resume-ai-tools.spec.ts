import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { builtinToRecipe } from '@/utils/layout-template';
import { applyResumeAiOperations, parseResumeAiDraft } from '@/services/ai/resumeTools';

const resume = parseResumeMarkdown(`# Mei\n\n## 工作经历\n### Example | Engineer | 2022.01 — 至今\n- Build tools`).resume;

describe('resume AI tools', () => {
  it('parses only the typed allowlisted actions', () => {
    const draft = parseResumeAiDraft(JSON.stringify({ explanation: '润色简介', operations: [{ type: 'set_basic', field: 'summary', value: '专注工程效率' }] }));
    expect(draft.operations).toHaveLength(1);
    expect(() => parseResumeAiDraft({ operations: [{ type: 'run_javascript', code: 'alert(1)' }] })).toThrow('不允许');
    expect(() => parseResumeAiDraft({ operations: [{ type: 'set_basic', field: 'id', value: 'another' }] })).toThrow('不允许');
    expect(() => parseResumeAiDraft({ explanation: '没有可改的内容。', operations: [] })).toThrow('没有返回可执行');
    expect(parseResumeAiDraft({ explanation: '没有可改的内容。', operations: [] }, { allowEmpty: true })).toEqual({ explanation: '没有可改的内容。', operations: [] });
    expect(() => parseResumeAiDraft({ explanation: '   ', operations: [] }, { allowEmpty: true })).toThrow('没有返回可执行');
  });

  it('allows the AI Agent template in AI template operations', () => {
    const draft = parseResumeAiDraft({ operations: [{ type: 'set_template', templateId: 'ai-agent' }] });
    const updated = applyResumeAiOperations(resume, draft.operations);
    expect(updated.templateId).toBe('ai-agent');
  });

  it('applies a declarative layout and clears it when switching back to a built-in template', () => {
    const layout = builtinToRecipe('tech', { ...resume.theme, fontSize: 16, color: '#112233' });
    const updated = applyResumeAiOperations(resume, [{ type: 'set_layout', layout }]);
    expect(updated.layout?.paper).toBe('dark');
    expect(updated.theme).toMatchObject({ fontSize: 16, color: '#112233' });
    expect(updated.basic).toEqual(resume.basic);
    expect(resume.layout).toBeUndefined();

    const cleared = applyResumeAiOperations(updated, [{ type: 'set_template', templateId: 'modern' }]);
    expect(cleared.templateId).toBe('modern');
    expect(cleared.layout).toBeUndefined();
    expect(() => parseResumeAiDraft({ operations: [{ type: 'set_layout', layout: { ...layout, css: 'body{color:red}' } }] })).toThrow('版式');
    expect(parseResumeAiDraft({ operations: [{ type: 'set_layout', layout: null }] }).operations[0]).toEqual({ type: 'set_layout', layout: null });
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
