import { beforeEach, describe, expect, it } from 'vitest';
import type { ResumeData } from '@/types/resume';
import {
  deleteCustomTemplate,
  listCustomTemplates,
  renameCustomTemplate,
  saveCustomTemplate,
} from '@/services/templates/CustomTemplateRepository';
import { buildCustomTemplateFromResume } from '@/utils/custom-template';

const resume = {
  id: 'resume-1',
  title: '简历',
  basic: { name: '', title: '', email: '', phone: '' },
  experiences: [],
  education: [],
  skills: [],
  projects: [],
  customBlocks: [],
  templateId: 'modern',
  theme: {
    color: '#2563eb',
    fontFamily: 'sans-serif',
    fontSize: 14,
    lineHeight: 1.5,
    moduleMargins: { top: 0, bottom: 24, left: 0, right: 0 },
    pageMargins: 24,
    dateFormat: 'YYYY.MM',
    displayIcons: true,
  },
  sectionOrder: ['experience'],
  sectionTitles: { experience: '经历', projects: '项目', education: '教育', skills: '技能' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as ResumeData;

describe('custom template repository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves, renames and deletes templates in this browser', () => {
    const first = buildCustomTemplateFromResume(resume, { name: '第一版' }, { id: 'one', now: 10 });
    const second = buildCustomTemplateFromResume(resume, { name: '第二版' }, { id: 'two', now: 20 });

    saveCustomTemplate(first);
    saveCustomTemplate(second);
    expect(listCustomTemplates().map((item) => item.id)).toEqual(['two', 'one']);

    renameCustomTemplate('one', '校招版', 30);
    expect(listCustomTemplates()[0]).toMatchObject({ id: 'one', name: '校招版', updatedAt: 30 });

    deleteCustomTemplate('one');
    expect(listCustomTemplates().map((item) => item.id)).toEqual(['two']);
  });

  it('refuses to rewrite storage when one stored template is broken', () => {
    const valid = buildCustomTemplateFromResume(resume, { name: '可用模板' }, { id: 'valid', now: 10 });
    const stored = JSON.stringify([valid, { id: 'broken' }]);
    localStorage.setItem('sea-resume_custom-templates', stored);
    const replacement = buildCustomTemplateFromResume(resume, { name: '新模板' }, { id: 'next', now: 20 });

    expect(() => listCustomTemplates()).toThrow('未继续写入');
    expect(() => saveCustomTemplate(replacement)).toThrow('未继续写入');
    expect(() => renameCustomTemplate('valid', '改名', 30)).toThrow('未继续写入');
    expect(() => deleteCustomTemplate('valid')).toThrow('未继续写入');
    expect(localStorage.getItem('sea-resume_custom-templates')).toBe(stored);
  });
});
