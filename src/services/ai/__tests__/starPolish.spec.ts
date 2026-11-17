import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestAiJson } from '../transport';
import { assertStarPolishCurrent, collectStarPolishTargets, novelNumbers, parseStarPolishDraft, requestStarPolish, resolveStarPolishTargets } from '../starPolish';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import type { ResumeData } from '@/types/resume';
vi.mock('../transport', () => ({ requestAiJson: vi.fn() }));
const config = { baseUrl: 'https://example.test/v1', model: 'test', apiKey: 'secret' };
function resume(): ResumeData {
  const parsed = parseResumeMarkdown('# 私密姓名\n\n## 个人简介\n负责前端工作\n\n## 工作经历\n### 私密公司 | 工程师 | 2022.01 — 至今\n在业务增长期负责结算页面，完成改版\n- 推动评审\n\n## 项目经验\n### 内部系统 | 负责人 | 2023.01 — 2023.06\n使用 Vue 重构列表').resume;
  parsed.basic.phone = 'private-phone';
  parsed.basic.email = 'private@example.test';
  return parsed;
}
describe('STAR polish', () => {
  beforeEach(() => vi.resetAllMocks());
  it('offers only narrative fields and keeps secrets and organizations out of the request', async () => {
    const source = resume();
    const keys = collectStarPolishTargets(source).map((target) => target.key);
    expect(keys).toHaveLength(4);
    vi.mocked(requestAiJson).mockResolvedValue({ explanation: '已重组', items: [] });
    await requestStarPolish(config, source, keys, ' 前端工程师 ', { signal: new AbortController().signal });
    const [, prompt, data, options] = vi.mocked(requestAiJson).mock.calls[0]!;
    const serialized = JSON.stringify(data);
    expect(prompt).toContain('STAR');
    expect(prompt).toContain('只换同义词不算改进');
    expect(options?.temperature).toBe(0.3);
    expect(data).toMatchObject({ targetRole: '前端工程师' });
    expect(serialized).toContain('结算页面');
    expect(serialized).toContain('职位：工程师');
    expect(serialized).toContain('角色：负责人');
    for (const secret of ['私密姓名', '私密公司', 'private-phone', 'private@example.test', 'secret', '2022.01', '公司 1']) expect(serialized).not.toContain(secret);
  });
  it('builds safe operations and flags numbers absent from the source', () => {
    const source = resume();
    const keys = collectStarPolishTargets(source).map((target) => target.key);
    const [summary, description, highlights, project] = keys;
    const draft = parseStarPolishDraft({
      explanation: '按 STAR 重组',
      items: [
        { key: description, value: '- 在业务增长期负责结算页面，完成改版，页面加载缩短 30%', note: '结果为新增数字' },
        { key: highlights, value: ['组织评审并落地'] },
        { key: project, value: '- 使用 Vue 重构列表，统一筛选交互' },
        { key: summary, value: '负责前端工作' },
      ],
    }, source, keys);
    expect(draft.suggestions.map((suggestion) => suggestion.operation.type)).toEqual(['update_experience', 'update_experience', 'update_project']);
    expect(draft.suggestions[0]!.novelNumbers).toEqual(['30%']);
    expect(draft.suggestions[1]!.operation).toMatchObject({ field: 'highlights', value: ['组织评审并落地'] });
    expect(novelNumbers('完成 2 项', '完成 2 项并提升 10%')).toEqual(['10%']);
  });
  it.each([
    { items: [{ key: 'unknown', value: 'bad' }] },
    { items: [{ key: 'placeholder', value: '- 公司 1 完成改版' }] },
    { items: [{ key: 'highlights', value: ['一条', '两条'] }] },
  ])('rejects unknown, placeholder or expanded output: %j', ({ items }) => {
    const source = resume();
    const targets = collectStarPolishTargets(source);
    const description = targets.find((target) => target.kind === 'experience')!.key;
    const highlights = targets.find((target) => target.kind === 'highlights')!.key;
    const keys = [description, highlights];
    const rewritten = items.map((item) => ({ ...item, key: item.key === 'placeholder' ? description : item.key === 'highlights' ? highlights : item.key }));
    expect(() => parseStarPolishDraft({ items: rewritten }, source, keys)).toThrow();
  });
  it('rejects hidden content, too many selections and stale edits before application', () => {
    const source = resume();
    const target = collectStarPolishTargets(source).find((item) => item.kind === 'experience')!;
    source.experiences[0]!.visible = false;
    expect(() => resolveStarPolishTargets(source, [target.key])).toThrow('隐藏');
    source.experiences[0]!.visible = true;
    expect(() => resolveStarPolishTargets(source, Array.from({ length: 13 }, () => target.key))).toThrow('1 到 12');
    const draft = parseStarPolishDraft({ items: [{ key: target.key, value: '- 在业务增长期负责结算页面并完成改版' }] }, source, [target.key]);
    source.experiences[0]!.description = '<p>用户后来改过</p>';
    expect(() => assertStarPolishCurrent(source, draft.suggestions)).toThrow('不会覆盖');
  });
  it('does not request when the role is too long', async () => {
    const source = resume();
    await expect(requestStarPolish(config, source, [collectStarPolishTargets(source)[0]!.key], '岗'.repeat(201))).rejects.toThrow('200');
    expect(requestAiJson).not.toHaveBeenCalled();
  });
});
