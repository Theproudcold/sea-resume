import { describe, expect, it } from 'vitest';
import { createDefaultResumeData } from '@/utils/resumeData';
import { buildCommitDiff, diffStats, diffTextLines, suggestCommitMessage } from '../diff';

function baseResume() {
  const resume = createDefaultResumeData();
  resume.basic.name = '张三';
  resume.experiences = [{
    id: 'e1', company: 'Acme', position: '前端工程师', startDate: '2022-01', endDate: 'present',
    description: '负责前端开发\n维护构建工具',
  }];
  resume.skills = [{ id: 's1', category: '工程化', items: ['Webpack'] }];
  return resume;
}

describe('版本差异', () => {
  it('renders line-level additions and deletions', () => {
    const before = baseResume();
    const after = JSON.parse(JSON.stringify(before));
    after.experiences[0].description = '主导前端架构\n维护构建工具\n首屏降到 1.2s';
    const diff = buildCommitDiff({ data: before }, { data: after });
    expect(diff.initial).toBe(false);
    const hunk = diff.hunks.find((entry) => entry.label.includes('工作内容'));
    expect(hunk).toBeTruthy();
    expect(hunk!.lines.some((line) => line.kind === 'add' && line.text.includes('主导前端架构'))).toBe(true);
    expect(hunk!.lines.some((line) => line.kind === 'del' && line.text.includes('负责前端开发'))).toBe(true);
    expect(hunk!.lines.some((line) => line.kind === 'context' && line.text.includes('维护构建工具'))).toBe(true);
    expect(diff.stats.additions).toBeGreaterThan(0);
    expect(diff.stats.deletions).toBeGreaterThan(0);
  });

  it('reports added, removed, modified and formatted changes', () => {
    const before = baseResume();
    const after = JSON.parse(JSON.stringify(before));
    after.experiences[0].description = '负责前端开发\n维护<strong>构建</strong>工具';
    after.skills.push({ id: 's2', category: '语言', items: ['TypeScript'] });
    after.education = [];
    const diff = buildCommitDiff({ data: before }, { data: after });
    expect(diff.hunks.some((hunk) => hunk.type === 'formatted')).toBe(true);
    expect(diff.hunks.some((hunk) => hunk.type === 'added' && hunk.section === '技能')).toBe(true);
  });

  it('reports presentation changes separately', () => {
    const before = baseResume();
    const after = JSON.parse(JSON.stringify(before));
    after.templateId = 'classic';
    after.theme.color = '#000000';
    after.sectionOrder = ['projects', 'experience'];
    const diff = buildCommitDiff({ data: before }, { data: after });
    const presentation = diff.hunks.filter((hunk) => hunk.section === '版式与结构');
    expect(presentation.map((hunk) => hunk.label)).toEqual(expect.arrayContaining(['模板', '主题色', '模块顺序']));
    expect(diff.stats.sections).toContain('版式与结构');
  });

  it('treats the first version as an initial summary instead of a huge diff', () => {
    const diff = buildCommitDiff(null, { data: baseResume() });
    expect(diff.initial).toBe(true);
    expect(diff.hunks).toHaveLength(0);
    expect(diff.stats.additions).toBeGreaterThan(0);
    expect(suggestCommitMessage(diff)).toBe('初始版本');
  });

  it('suggests a message from changed sections and handles presentation-only changes', () => {
    const before = baseResume();
    const after = JSON.parse(JSON.stringify(before));
    after.skills[0].items = ['Vite'];
    expect(suggestCommitMessage(buildCommitDiff({ data: before }, { data: after }))).toBe('更新技能');
    after.templateId = 'classic';
    expect(suggestCommitMessage(buildCommitDiff({ data: before }, { data: after }))).toContain('技能');
  });

  it('falls back to whole-block replacement for very large fields', () => {
    const before = Array.from({ length: 800 }, (_, index) => `line-${index}`).join('\n');
    const after = Array.from({ length: 800 }, (_, index) => `changed-${index}`).join('\n');
    const result = diffTextLines(before, after);
    expect(result.additions).toBe(800);
    expect(result.deletions).toBe(800);
    expect(result.lines.length).toBeLessThanOrEqual(400);
    expect(result.truncated).toBe(true);
  });

  it('counts stats without relying on the UI view model', () => {
    const before = baseResume();
    const after = JSON.parse(JSON.stringify(before));
    after.basic.name = '李四';
    const stats = diffStats(before, after);
    expect(stats.sections).toContain('个人信息');
    expect(stats.additions).toBeGreaterThan(0);
  });
});
