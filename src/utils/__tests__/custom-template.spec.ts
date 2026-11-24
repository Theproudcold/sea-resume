import { describe, expect, it } from 'vitest';
import type { ResumeData } from '@/types/resume';
import {
  buildCustomTemplateFromResume,
  customTemplateToMetadata,
  resumeFromCustomTemplate,
} from '@/utils/custom-template';
import { builtinToRecipe } from '@/utils/layout-template';

const resume = {
  id: 'resume-1',
  title: '前端简历',
  basic: { name: '林夏', title: '前端工程师', email: 'lin@example.com', phone: '13800000000' },
  experiences: [],
  education: [],
  skills: [],
  projects: [{ id: 'project-1', name: '组件库', role: '负责人', startDate: '2024-01', endDate: 'present', description: '搭建组件' }],
  customBlocks: [],
  templateId: 'tech',
  jobTarget: { versionName: '校招', company: '示例公司', position: '前端', sourceResumeId: 'source-1' },
  theme: {
    color: '#0f766e',
    fontFamily: 'Source Han Sans',
    fontSize: 15,
    lineHeight: 1.6,
    moduleMargins: { top: 4, bottom: 20, left: 0, right: 0 },
    pageMargins: 28,
    dateFormat: 'YYYY-MM',
    displayIcons: false,
  },
  sectionOrder: ['projects', 'skills'],
  hiddenSections: ['education'],
  sectionTitles: { experience: '经历', projects: '项目', education: '教育', skills: '技能' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
} as ResumeData;

describe('custom templates', () => {
  it('keeps the resume content and theme without the job-specific target', () => {
    const template = buildCustomTemplateFromResume(resume, {
      name: '  校招通用版  ',
      description: '  带项目经历  ',
    }, { id: 'template-1', now: 100 });

    expect(template).toMatchObject({
      id: 'template-1',
      name: '校招通用版',
      description: '带项目经历',
      baseTemplateId: 'tech',
      createdAt: 100,
      updatedAt: 100,
    });
    expect(template.snapshot.projects).toEqual(resume.projects);
    expect(template.snapshot.theme.color).toBe('#0f766e');
    expect(template.snapshot.jobTarget).toBeUndefined();
    expect(template.snapshot).not.toBe(resume);
  });

  it('creates an independent resume copy that still uses the built-in layout', () => {
    const template = buildCustomTemplateFromResume(resume, { name: '校招通用版' }, { id: 'template-1' });
    template.snapshot.basic.name = '已改模板';

    const created = resumeFromCustomTemplate(template);
    created.basic.name = '新简历';

    expect(created.templateId).toBe('tech');
    expect(created.jobTarget).toBeUndefined();
    expect(template.snapshot.basic.name).toBe('已改模板');
    expect(customTemplateToMetadata(template)).toMatchObject({
      id: 'template-1',
      category: 'custom',
      categoryLabel: '我的',
      source: 'custom',
      baseTemplateId: 'tech',
    });
  });

  it('rejects a blank name', () => {
    expect(() => buildCustomTemplateFromResume(resume, { name: '   ' })).toThrow('请填写模板名称。');
  });

  it('keeps a valid layout inside a content snapshot', () => {
    const withLayout = {
      ...resume,
      templateId: 'layout:saved',
      layout: builtinToRecipe('tech', resume.theme),
    };
    const template = buildCustomTemplateFromResume(withLayout, { name: '深色内容' }, { id: 'with-layout' });
    expect(template.baseTemplateId).toBe('tech');
    expect(template.snapshot.templateId).toBe('layout:saved');
    expect(template.snapshot.layout?.paper).toBe('dark');

    const created = resumeFromCustomTemplate(template);
    expect(created.templateId).toBe('layout:saved');
    expect(created.layout?.paper).toBe('dark');
    created.layout = undefined;
    expect(template.snapshot.layout?.paper).toBe('dark');
  });
});
