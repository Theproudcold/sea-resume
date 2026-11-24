import { describe, expect, it } from 'vitest';
import { collectMasterAdditions, applyMasterAdditions } from '../resumeRebase';
import type { Experience, Project, ResumeData } from '@/types/resume';

function blank(): ResumeData {
  return {
    id: 'branch',
    title: 'Acme 前端',
    basic: { name: '林晓', title: '前端工程师', email: 'a@b.com', phone: '13800001111' },
    experiences: [],
    education: [],
    skills: [],
    projects: [],
    customBlocks: [],
    templateId: 'modern',
    theme: {
      color: '#2563eb', fontFamily: 'sans-serif', fontSize: 14, lineHeight: 1.5,
      moduleMargins: { top: 0, bottom: 24, left: 0, right: 0 }, pageMargins: 24, dateFormat: 'YYYY.MM', displayIcons: true,
    },
    sectionOrder: ['experience', 'projects', 'education', 'skills'],
    sectionTitles: { experience: '工作经历', projects: '项目经验', education: '教育背景', skills: '技能证书' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function experience(id: string, company: string, highlights: string[]): Experience {
  return { id, company, position: '前端工程师', startDate: '2022-01', endDate: 'present', description: '<p>负责结算</p>', highlights };
}

function project(id: string, name: string, description: string): Project {
  return { id, name, role: '负责人', startDate: '2023-01', endDate: '2024-01', description, techStack: [] } as Project;
}

/** 主干 v1：一段经历 + 一个项目。 */
function masterV1(): ResumeData {
  const data = blank();
  data.id = 'master-v1';
  data.experiences = [experience('e1', '星海科技', ['负责结算页面改版'])];
  data.projects = [project('p1', '结算台重构', '<p>负责前端实现</p>')];
  return data;
}

describe('收集主干新增条目', () => {
  it('finds bullets added to an existing experience', () => {
    const base = masterV1();
    const latest = JSON.parse(JSON.stringify(base)) as ResumeData;
    latest.experiences[0]!.highlights = ['负责结算页面改版', '推动首屏耗时从 2s 降到 1.2s'];
    const additions = collectMasterAdditions(base, latest, base);
    expect(additions).toHaveLength(1);
    expect(additions[0]).toMatchObject({ kind: 'highlight', sourceItemId: 'e1', text: '推动首屏耗时从 2s 降到 1.2s', conflict: false });
  });

  it('ignores bullets the branch already has, even if reordered', () => {
    const base = masterV1();
    const latest = JSON.parse(JSON.stringify(base)) as ResumeData;
    latest.experiences[0]!.highlights = ['新增一条', '负责结算页面改版'];
    const branch = JSON.parse(JSON.stringify(base)) as ResumeData;
    branch.experiences[0]!.highlights = ['负责结算页面改版', '新增一条'];
    expect(collectMasterAdditions(base, latest, branch)).toHaveLength(0);
  });

  it('finds a brand new experience entry as a whole block', () => {
    const base = masterV1();
    const latest = JSON.parse(JSON.stringify(base)) as ResumeData;
    latest.experiences = [experience('e2', '新公司', ['从零搭建监控']), ...latest.experiences];
    const additions = collectMasterAdditions(base, latest, base);
    expect(additions.some((item) => item.kind === 'experience' && item.sourceItemId === 'e2')).toBe(true);
  });

  it('finds a brand new project as a whole block', () => {
    const base = masterV1();
    const latest = JSON.parse(JSON.stringify(base)) as ResumeData;
    latest.projects = [...latest.projects, project('p2', '新项目', '<p>做了一件事</p>')];
    const additions = collectMasterAdditions(base, latest, base);
    expect(additions.some((item) => item.kind === 'project' && item.sourceItemId === 'p2')).toBe(true);
  });

  it('marks a conflict when the branch rewrote the same experience', () => {
    const base = masterV1();
    const latest = JSON.parse(JSON.stringify(base)) as ResumeData;
    latest.experiences[0]!.highlights = ['负责结算页面改版', '主干预新增内容'];
    const branch = JSON.parse(JSON.stringify(base)) as ResumeData;
    branch.experiences[0]!.highlights = ['主导结算页面改版'];
    const additions = collectMasterAdditions(base, latest, branch);
    expect(additions[0]).toMatchObject({ text: '主干预新增内容', conflict: true });
  });

  it('returns nothing when the master has not changed', () => {
    const base = masterV1();
    expect(collectMasterAdditions(base, JSON.parse(JSON.stringify(base)) as ResumeData, base)).toHaveLength(0);
  });
});

describe('把新增条目并入岗位版本', () => {
  it('appends highlight additions to the matching experience, never a dangling section', () => {
    const branch = masterV1();
    const result = applyMasterAdditions(branch, [
      { kind: 'highlight', sourceItemId: 'e1', text: '新成果', conflict: false },
    ]);
    expect(result.resume.experiences[0]!.highlights).toEqual(['负责结算页面改版', '新成果']);
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]).toMatchObject({ targetItemId: 'e1' });
    // 不新增任何自定义模块，也不在文末塞「新增内容」。
    expect(result.resume.customBlocks).toHaveLength(0);
  });

  it('inserts a new experience at the top of the list', () => {
    const branch = masterV1();
    const added = experience('e9', '新公司', ['从零搭建监控']);
    const result = applyMasterAdditions(branch, [{ kind: 'experience', sourceItemId: 'e9', block: added, conflict: false }]);
    expect(result.resume.experiences[0]!.company).toBe('新公司');
    expect(result.resume.experiences).toHaveLength(2);
  });

  it('skips a bullet that is already present instead of duplicating it', () => {
    const branch = masterV1();
    const result = applyMasterAdditions(branch, [
      { kind: 'highlight', sourceItemId: 'e1', text: '负责结算页面改版', conflict: false },
    ]);
    expect(result.resume.experiences[0]!.highlights).toEqual(['负责结算页面改版']);
    expect(result.placements).toHaveLength(0);
  });

  it('falls back to the most recent experience when the source entry is gone from the branch', () => {
    const branch = masterV1();
    branch.experiences = [experience('other', '别家公司', ['原有内容'])];
    const result = applyMasterAdditions(branch, [
      { kind: 'highlight', sourceItemId: 'e1', text: '新成果', conflict: false },
    ]);
    expect(result.resume.experiences[0]!.highlights).toEqual(['原有内容', '新成果']);
    expect(result.placements[0]!.fallback).toBe(true);
  });

  it('does nothing when the branch has no experience section to receive a highlight', () => {
    const branch = masterV1();
    branch.experiences = [];
    const result = applyMasterAdditions(branch, [
      { kind: 'highlight', sourceItemId: 'e1', text: '新成果', conflict: false },
    ]);
    expect(result.resume.experiences).toHaveLength(0);
    expect(result.placements).toHaveLength(0);
    expect(result.unplaced).toHaveLength(1);
  });

  it('never mutates the input resume', () => {
    const branch = masterV1();
    const snapshot = JSON.stringify(branch);
    applyMasterAdditions(branch, [{ kind: 'highlight', sourceItemId: 'e1', text: '新成果', conflict: false }]);
    expect(JSON.stringify(branch)).toBe(snapshot);
  });

  it('keeps role-specific tailoring intact', () => {
    const branch = masterV1();
    branch.experiences[0]!.highlights = ['为 Acme 定制的表述'];
    branch.title = 'Acme 前端定制版';
    const result = applyMasterAdditions(branch, [{ kind: 'highlight', sourceItemId: 'e1', text: '新成果', conflict: false }]);
    expect(result.resume.experiences[0]!.highlights).toEqual(['为 Acme 定制的表述', '新成果']);
    expect(result.resume.title).toBe('Acme 前端定制版');
  });
});
