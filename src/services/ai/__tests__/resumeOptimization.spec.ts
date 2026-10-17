import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { applyOptimizationSuggestions, createOptimizationRun, parseOptimizationAnalysis, parseOptimizationOperation, parseOptimizationReview, parseOptimizationSuggestions, restoreOptimizationRun, validateOptimizationFacts } from '../resumeOptimization';
import type { OptimizationOptions } from '@/types/ai';

const options: OptimizationOptions = { target: '工程师', company: '', jd: '', style: 'concise', personalSample: '', generalizeOrganizations: true };
const config = { baseUrl: 'https://example.test/v1', model: 'mock', apiKey: 'secret-key' };
function fixture() {
  const resume = parseResumeMarkdown('# Mei\n\n## 工作经历\n### Real Company | Engineer | 2022.01 — 至今\n- Build tools').resume;
  resume.basic.summary = '<p>原始描述</p>';
  const run = createOptimizationRun(resume, options, config);
  const suggestion = { id: 's1', operation: { type: 'set_basic', field: 'summary', value: '清楚地描述个人行动' }, before: '模型伪造原值', reason: '更具体', requirement: '', sourceRefs: ['basic.summary'] };
  return { resume, run, suggestion };
}
describe('bounded optimization output and application', () => {
  it('keeps raw baselines and excludes secrets/contact fields from run and sent context', () => {
    const { resume, run } = fixture();
    resume.basic.phone = 'private-phone';
    expect(run.baseline['basic.summary']).toBe('<p>原始描述</p>');
    expect(run.context.basic.summary).toBe('原始描述');
    expect(JSON.stringify(run)).not.toContain('secret-key');
    expect(run.context.experiences[0]!.company).toBe('公司 1');
    expect(Object.keys(run.baseline).some(key => /company|Date|phone|email/.test(key))).toBe(false);
  });
  it('accepts empty suggestions and a single empty review', () => {
    const { run } = fixture();
    expect(parseOptimizationSuggestions({ suggestions: [] }, run)).toEqual([]);
    expect(parseOptimizationReview({ reviews: [] }, run)).toEqual([]);
  });
  it('binds before values to client baselines, not model claims', () => {
    const { run, suggestion } = fixture();
    const parsed = parseOptimizationSuggestions({ suggestions: [suggestion] }, run)[0]!;
    expect(parsed.before).toBe('<p>原始描述</p>');
    expect(parsed.review).toBe('unreviewed');
    expect(parsed.selected).toBe(false);
  });
  it.each([
    { type: 'set_basic', field: 'phone', value: '1' },
    { type: 'set_basic', field: 'name', value: 'bad' },
    { type: 'set_template', templateId: 'minimal' },
    { type: 'reorder_sections', sectionOrder: [] },
    { type: 'update_experience', id: 'missing', field: 'description', value: 'bad' },
  ])('rejects unsafe or nonexistent operation %j', operation => {
    expect(() => parseOptimizationOperation(operation, fixture().run)).toThrow();
  });
  it('forbids organizations/dates, hidden items and structured custom content', () => {
    const { resume, run } = fixture();
    const id = resume.experiences[0]!.id;
    for (const field of ['company', 'startDate', 'endDate', 'id']) expect(() => parseOptimizationOperation({ type: 'update_experience', id, field, value: 'bad' }, run)).toThrow();
    resume.experiences[0]!.visible = false;
    const hidden = createOptimizationRun(resume, options, config);
    expect(() => parseOptimizationOperation({ type: 'update_experience', id, field: 'description', value: 'bad' }, hidden)).toThrow();
    resume.customBlocks = [{ id: 'block', title: '奖项', type: 'list', order: 1, content: [{ id: 'a', title: '真实奖项', description: '内容' }] }];
    expect(() => parseOptimizationOperation({ type: 'update_custom_block', id: 'block', field: 'content', value: 'bad' }, createOptimizationRun(resume, options, config))).toThrow();
  });
  it('validates evidence, uniqueness and fact target association', () => {
    const { run, suggestion, resume } = fixture();
    for (const sourceRefs of [[], ['fake'], ['basic.summary', 'basic.summary']]) expect(() => parseOptimizationSuggestions({ suggestions: [{ ...suggestion, sourceRefs }] }, run)).toThrow();
    expect(() => parseOptimizationSuggestions({ suggestions: [suggestion, suggestion] }, run)).toThrow('重复');
    run.facts = [{ id: 'answer', text: '用户亲自执行了测试', targetId: resume.experiences[0]!.id }];
    expect(() => parseOptimizationSuggestions({ suggestions: [{ ...suggestion, sourceRefs: ['fact.answer'] }] }, run)).toThrow('其他条目');
    expect(() => validateOptimizationFacts([{ id: 'coach', text: '建议学习技术', targetId: 'unknown' }], run.context)).toThrow();
  });
  it('caps supplementation at three validated questions', () => {
    const { run } = fixture();
    const analysis = { summary: '缺少个人行动', matches: [], issues: [], questions: [{ id: 'q', text: '如何验证？', targetId: 'basic' }] };
    expect(parseOptimizationAnalysis(analysis, run).questions).toHaveLength(1);
    expect(() => parseOptimizationAnalysis({ ...analysis, questions: Array(4).fill(analysis.questions[0]) }, run)).toThrow();
    expect(() => parseOptimizationAnalysis({ ...analysis, questions: [{ ...analysis.questions[0], targetId: 'unknown' }] }, run)).toThrow();
  });
  it('requires complete review coverage; rejected and unconfirmed suggestions never apply', () => {
    const { resume, run, suggestion } = fixture();
    run.suggestions = parseOptimizationSuggestions({ suggestions: [suggestion] }, run);
    expect(() => parseOptimizationReview({ reviews: [] }, run)).toThrow('覆盖');
    run.stage = 'ready';
    for (const status of ['reject', 'confirm', 'pass'] as const) {
      run.suggestions = parseOptimizationReview({ reviews: [{ id: 's1', status, reason: '需核对' }] }, run);
      run.suggestions[0]!.selected = true;
      if (status !== 'pass') expect(() => applyOptimizationSuggestions(resume, run)).toThrow('确认');
      else expect(applyOptimizationSuggestions(resume, run).basic.summary).toContain('清楚');
    }
    expect(resume.basic.summary).toBe('<p>原始描述</p>');
    run.suggestions[0]!.rejected = true;
    expect(() => applyOptimizationSuggestions(resume, run)).toThrow();
  });
  it('conflicts on concurrent changes, deletion or newly hidden fields, without partial mutation', () => {
    const { resume, run, suggestion } = fixture();
    run.suggestions = parseOptimizationSuggestions({ suggestions: [suggestion] }, run);
    Object.assign(run.suggestions[0]!, { review: 'pass', selected: true }); run.stage = 'ready';
    resume.basic.summary = '用户手动改动';
    expect(() => applyOptimizationSuggestions(resume, run)).toThrow('不会覆盖');
    expect(resume.basic.summary).toBe('用户手动改动');
    const id = resume.experiences[0]!.id;
    run.suggestions = parseOptimizationSuggestions({ suggestions: [{ ...suggestion, operation: { type: 'update_experience', id, field: 'description', value: 'test' } }] }, run);
    Object.assign(run.suggestions[0]!, { review: 'pass', selected: true });
    resume.experiences[0]!.visible = false;
    expect(() => applyOptimizationSuggestions(resume, run)).toThrow('隐藏');
    resume.experiences = [];
    expect(() => applyOptimizationSuggestions(resume, run)).toThrow('删除');
  });
  it('restores exact long raw HTML and list baselines without applying AI output limits', () => {
    const { resume, suggestion } = fixture();
    const raw = `  <p>${'原文'.repeat(6000)}</p>  `;
    resume.basic.summary = raw;
    resume.experiences[0]!.description = raw;
    resume.experiences[0]!.highlights = ['  ' + '事实'.repeat(300) + '  '];
    const run = createOptimizationRun(resume, options, config);
    run.suggestions = parseOptimizationSuggestions({ suggestions: [suggestion] }, run);
    expect(run.context.basic.summary.length).toBe(10000);
    const restored = restoreOptimizationRun(JSON.parse(JSON.stringify(run)));
    expect(restored.baseline).toEqual(run.baseline);
    expect(restored.suggestions[0]!.before).toBe(raw);
    expect(restored.context).toEqual(run.context);
  });

  it('restores in-flight runs as interrupted and clears saved selections', () => {
    const { run, suggestion } = fixture();
    run.suggestions = parseOptimizationSuggestions({ suggestions: [suggestion] }, run);
    Object.assign(run.suggestions[0]!, { review: 'confirm', selected: true, confirmed: true });
    run.stage = 'review';
    const restored = restoreOptimizationRun(run);
    expect(restored.stage).toBe('cancelled');
    expect(restored.failedStep).toBe('review');
    expect(restored.suggestions[0]!.selected).toBe(false);
    expect(restored.suggestions[0]!.confirmed).toBe(false);
  });
  it('rejects reserved question IDs and sanitizes restored context fields', () => {
    const { run } = fixture();
    expect(() => parseOptimizationAnalysis({ summary: '', matches: [], issues: [], questions: [{ id: '__proto__', text: 'bad', targetId: 'basic' }] }, run)).toThrow('ID');
    Object.assign(run.context.basic, { email: 'private@example.test', phone: 'private' });
    expect(JSON.stringify(restoreOptimizationRun(run).context)).not.toContain('private');
    expect(() => restoreOptimizationRun({ ...run, usage: {} } as typeof run)).toThrow('用量');
  });
});
