import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { applyResumeDifferences, compareResumeVersions, createJobResumeVersion } from '@/utils/resumeVersions';
import type { ResumeData } from '@/types/resume';

function resume(): ResumeData {
  return parseResumeMarkdown('# Alex').resume;
}

describe('resume job versions', () => {
  it('creates a metadata-bearing independent resume copy', () => {
    const source = resume();
    source.basic.name = 'Alex';
    const variant = createJobResumeVersion(source, { versionName: 'Acme 前端', company: 'Acme', position: '前端工程师' }, 'variant-1');
    variant.basic.name = 'Changed only in copy';
    expect(variant.id).toBe('variant-1');
    expect(variant.jobTarget).toEqual({ versionName: 'Acme 前端', company: 'Acme', position: '前端工程师', sourceResumeId: source.id });
    expect(source.basic.name).toBe('Alex');
    expect(source.jobTarget).toBeUndefined();
  });

  it('returns readable, labeled field differences and detects whole-item additions', () => {
    const before = resume();
    const after = JSON.parse(JSON.stringify(before)) as ResumeData;
    after.basic.title = 'Product Designer';
    after.projects = [{ id: 'p', name: 'Portfolio', role: 'Owner', startDate: '', endDate: '', description: '<p>Built&nbsp;it</p>' }];

    const changes = compareResumeVersions(before, after);
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        section: '个人信息', item: '基本信息', field: '求职意向',
        before: '', after: 'Product Designer', type: 'added', scope: 'field',
        beforePath: ['basic', 'title'], afterPath: ['basic', 'title'],
      }),
      expect.objectContaining({
        section: '项目经验', item: 'Portfolio · Owner', field: '整项',
        before: '', after: expect.stringContaining('项目名称：Portfolio'), type: 'added', scope: 'item',
        beforePath: ['projects'], afterPath: ['projects', 0],
      }),
    ]));
    expect(changes.some((change) => 'path' in change)).toBe(false);
  });

  it('matches reordered records by identity even if record IDs changed', () => {
    const before = resume();
    before.experiences = [
      { id: 'old-a', company: 'Acme', position: '工程师', startDate: '2023-01', endDate: 'present', description: '<p>建设平台</p>' },
      { id: 'old-b', company: 'Beta', position: '研究员', startDate: '2020-01', endDate: '2022-01', description: '研究数据' },
    ];
    const after = JSON.parse(JSON.stringify(before)) as ResumeData;
    after.experiences = [
      { ...after.experiences[1]!, id: 'new-b' },
      { ...after.experiences[0]!, id: 'new-a', description: '<p>建设<b>智能</b>平台</p>' },
    ];

    const changes = compareResumeVersions(before, after);
    expect(changes).toEqual([
      expect.objectContaining({
        section: '工作经历', item: 'Acme · 工程师', field: '工作内容',
        before: '建设平台', after: '建设智能平台', type: 'modified',
        beforePath: ['experiences', 0, 'description'], afterPath: ['experiences', 1, 'description'],
      }),
    ]);
  });

  it('marks deleted records as one item-level change and cleared fields separately', () => {
    const before = resume();
    before.experiences = [{ id: 'exp', company: 'Acme', position: '工程师', startDate: '', endDate: '', description: '<p>建设系统</p>' }];
    const after = JSON.parse(JSON.stringify(before)) as ResumeData;
    after.experiences = [];

    const changes = compareResumeVersions(before, after);
    expect(changes).toEqual([
      expect.objectContaining({ section: '工作经历', item: 'Acme · 工程师', field: '整项', type: 'removed', scope: 'item', beforePath: ['experiences', 0] }),
    ]);
    expect(changes[0]?.before).toContain('工作内容：建设系统');

    const cleared = JSON.parse(JSON.stringify(before)) as ResumeData;
    cleared.experiences[0]!.description = '';
    expect(compareResumeVersions(before, cleared)).toContainEqual(
      expect.objectContaining({ field: '工作内容', type: 'removed', scope: 'field' }),
    );
  });

  it('applies only selected changes into a new copy without mutating either source', () => {
    const before = resume();
    before.basic.title = '工程师';
    before.experiences = [{ id: 'exp', company: 'Acme', position: '工程师', startDate: '', endDate: '', description: '旧内容' }];
    before.projects = [{ id: 'legacy', name: '旧项目', role: '', startDate: '', endDate: '', description: '保留项目' }];
    const after = JSON.parse(JSON.stringify(before)) as ResumeData;
    after.basic.title = '高级工程师';
    after.experiences[0]!.description = '新版内容';
    after.projects = [{ id: 'new', name: '新项目', role: '负责人', startDate: '', endDate: '', description: '新增项目' }];

    const differences = compareResumeVersions(before, after);
    const selected = differences.map((difference) => difference.id);
    const merged = applyResumeDifferences(before, after, differences, selected);
    expect(merged.basic.title).toBe('高级工程师');
    expect(merged.experiences[0]?.description).toBe('新版内容');
    expect(merged.projects.map((project) => project.name)).toEqual(['新项目']);
    expect(before.basic.title).toBe('工程师');
    expect(before.experiences[0]?.description).toBe('旧内容');
    expect(before.projects.map((project) => project.name)).toEqual(['旧项目']);
    expect(after.projects.map((project) => project.name)).toEqual(['新项目']);

    const onlyTitle = differences.find((difference) => difference.field === '求职意向');
    const partial = applyResumeDifferences(before, after, differences, onlyTitle ? [onlyTitle.id] : []);
    expect(partial.basic.title).toBe('高级工程师');
    expect(partial.experiences[0]?.description).toBe('旧内容');
    expect(partial.projects.map((project) => project.name)).toEqual(['旧项目']);
  });

  it('applies nested additions to the matching source module when modules are reordered', () => {
    const before = resume();
    before.customBlocks = [
      { id: 'languages', title: '语言', type: 'list', content: [], order: 0 },
      { id: 'awards', title: '奖项', type: 'list', content: [], order: 1 },
    ];
    const after = JSON.parse(JSON.stringify(before)) as ResumeData;
    after.customBlocks = [after.customBlocks[1]!, after.customBlocks[0]!];
    after.customBlocks[0]!.content = [{ id: 'award', title: '优秀员工', description: '年度表彰' }];

    const differences = compareResumeVersions(before, after);
    expect(differences).toEqual([
      expect.objectContaining({
        section: '奖项', item: '优秀员工', field: '整项', type: 'added', scope: 'item',
        beforePath: ['customBlocks', 1, 'content'],
        afterPath: ['customBlocks', 0, 'content', 0],
      }),
    ]);

    const merged = applyResumeDifferences(before, after, differences, differences.map((difference) => difference.id));
    expect(merged.customBlocks[0]?.title).toBe('语言');
    expect(merged.customBlocks[0]?.content).toEqual([]);
    expect(merged.customBlocks[1]?.title).toBe('奖项');
    expect(merged.customBlocks[1]?.content).toEqual([{ id: 'award', title: '优秀员工', description: '年度表彰' }]);
  });

  it('ignores presentation metadata and unordered skills', () => {
    const before = resume();
    before.skills = [{ id: 'skill-1', category: '技术', items: ['Vue', 'TypeScript'] }];
    const after = JSON.parse(JSON.stringify(before)) as ResumeData;
    after.id = 'different-resume-id';
    after.updatedAt = '2099-01-01T00:00:00.000Z';
    after.templateId = 'professional';
    after.theme.color = '#ff0000';
    after.sectionOrder.reverse();
    after.skills[0]!.items.reverse();
    after.jobTarget = { versionName: '岗位版', company: 'Acme', position: '前端', sourceResumeId: before.id };

    expect(compareResumeVersions(before, after)).toEqual([]);
  });

  it('compares changes inside custom list modules by their entry identity', () => {
    const before = resume();
    before.customBlocks = [{
      id: 'awards', title: '奖项', type: 'list', order: 0,
      content: [{ id: 'old-entry', title: '优秀员工', date: '2024', description: '<p>团队表彰</p>' }],
    }];
    const after = JSON.parse(JSON.stringify(before)) as ResumeData;
    after.customBlocks[0]!.content = [{ id: 'new-entry', title: '优秀员工', date: '2024', description: '<p>年度团队表彰</p>' }];

    expect(compareResumeVersions(before, after)).toEqual([
      expect.objectContaining({ section: '奖项', item: '优秀员工', field: '内容', before: '团队表彰', after: '年度团队表彰', type: 'modified' }),
    ]);
  });
  it('compares and merges visibility changes for standard and custom entries', () => {
    const before = resume();
    before.experiences = [{ id: 'exp', company: 'Acme', position: '工程师', startDate: '', endDate: '', description: '经历' }];
    before.education = [{ id: 'edu', school: '学校', degree: '', major: '', startDate: '', endDate: '' }];
    before.projects = [{ id: 'project', name: '项目', role: '', startDate: '', endDate: '', description: '项目描述' }];
    before.skills = [{ id: 'skill', category: '技能', items: ['TypeScript'] }];
    before.customBlocks = [{
      id: 'awards', title: '奖项', type: 'list', order: 0,
      content: [{ id: 'award', title: '奖项一', description: '获奖说明' }],
    }];
    const after = JSON.parse(JSON.stringify(before)) as ResumeData;
    after.experiences[0]!.visible = false;
    after.education[0]!.visible = false;
    after.projects[0]!.visible = false;
    after.skills[0]!.visible = false;
    const customItems = after.customBlocks[0]!.content;
    if (Array.isArray(customItems)) customItems[0]!.visible = false;

    const differences = compareResumeVersions(before, after);
    const visibilityChanges = differences.filter((difference) => difference.field === '显示状态');
    expect(visibilityChanges).toHaveLength(5);
    expect(visibilityChanges.every((difference) => difference.before === '显示' && difference.after === '隐藏')).toBe(true);

    const merged = applyResumeDifferences(before, after, differences, visibilityChanges.map((difference) => difference.id));
    expect(merged.experiences[0]?.visible).toBe(false);
    expect(merged.education[0]?.visible).toBe(false);
    expect(merged.projects[0]?.visible).toBe(false);
    expect(merged.skills[0]?.visible).toBe(false);
    expect(merged.customBlocks[0]?.content).toEqual(expect.arrayContaining([expect.objectContaining({ visible: false })]));
  });

});
