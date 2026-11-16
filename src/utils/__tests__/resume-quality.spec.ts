import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { checkResumeQuality } from '@/utils/resumeQuality';

const blankResume = () => {
  const resume = parseResumeMarkdown('# Resume').resume;
  resume.basic = { ...resume.basic, name: '', title: '', email: '', phone: '', summary: '' };
  resume.experiences = [];
  resume.projects = [];
  resume.education = [];
  resume.skills = [];
  return resume;
};

const completeResume = () => {
  const resume = blankResume();
  resume.basic = { ...resume.basic, name: 'Ada', title: 'Engineer', email: 'ada@example.com', summary: '<p>Builder</p>' };
  resume.experiences = [{ id: 'e', company: 'A', position: 'Dev', startDate: '2022-01', endDate: 'present', description: '<p>Built systems</p>' }];
  resume.projects = [{ id: 'p', name: 'Tool', role: 'Lead', startDate: '2021-01', endDate: '2021-12', description: 'Shipped' }];
  resume.education = [{ id: 'd', school: 'U', degree: 'BS', major: 'CS', startDate: '2018-01', endDate: '2021-01' }];
  resume.skills = [{ id: 's', category: '语言', items: ['TypeScript'] }];
  return resume;
};

/** One experience carrying only the date range under test. */
const withExperienceRange = (startDate: string, endDate: string) => {
  const resume = completeResume();
  resume.experiences = [{ id: 'e', company: 'A', position: 'Dev', startDate, endDate, description: 'Work' }];
  return checkResumeQuality(resume).filter((issue) => issue.id.startsWith('experience-date-'));
};

describe('resume quality checks', () => {
  it('reports missing basic fields and every empty primary section without changing data', () => {
    const resume = blankResume();
    const before = JSON.stringify(resume);
    const issues = checkResumeQuality(resume);
    const ids = issues.map((issue) => issue.id);
    expect(ids).toEqual(expect.arrayContaining([
      'basic-name', 'basic-title', 'basic-contact', 'basic-summary',
      'experience-empty', 'projects-empty', 'education-empty', 'skills-empty',
    ]));
    expect(JSON.stringify(resume)).toBe(before);
  });

  it('points empty sections at the section root instead of a fake anchor', () => {
    const issues = checkResumeQuality(blankResume());
    const emptySection = issues.find((issue) => issue.id === 'experience-empty');
    expect(emptySection).toEqual(expect.objectContaining({ section: 'experience', target: null }));
  });

  it('reports each empty field of an entry separately with its own destination', () => {
    const resume = completeResume();
    resume.experiences = [{ id: 'e1', company: '', position: '', startDate: '2024-08', endDate: '2024-02', description: '' }];
    const issues = checkResumeQuality(resume).filter((issue) => issue.section === 'experience');
    expect(issues.map((issue) => [issue.id, issue.target])).toEqual([
      ['experience-company-e1', 'experience-company-e1'],
      ['experience-position-e1', 'experience-position-e1'],
      ['experience-description-e1', 'experience-description-e1'],
      ['experience-date-e1', 'experience-date-e1'],
    ]);
    expect(issues[0]!.message).toContain('公司名称为空');
  });

  it('reports projects and education fields one by one', () => {
    const resume = completeResume();
    resume.projects = [{ id: 'p1', name: '', role: 'Lead', startDate: '', endDate: '', description: 'Shipped' }];
    resume.education = [{ id: 'd1', school: '', degree: '', major: '', startDate: '', endDate: '' }];
    const issues = checkResumeQuality(resume);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'project-name-p1', target: 'project-name-p1' }),
      expect.objectContaining({ id: 'education-school-d1', target: 'education-school-d1' }),
      expect.objectContaining({ id: 'education-degree-d1', target: 'education-degree-d1' }),
      expect.objectContaining({ id: 'education-major-d1', target: 'education-major-d1' }),
    ]));
  });

  it('accepts a complete resume and valid or current date ranges', () => {
    expect(checkResumeQuality(completeResume())).toEqual([]);
  });

  it('skips hidden sections, including their empty-module reminder', () => {
    const resume = completeResume();
    resume.hiddenSections = ['projects', 'education', 'skills'];
    resume.projects = [];
    resume.education = [];
    resume.skills = [];
    expect(checkResumeQuality(resume)).toEqual([]);
  });

  it('skips entries the user hid from the resume', () => {
    const resume = completeResume();
    resume.experiences = [
      { id: 'hidden', company: '', position: '', startDate: '2024-08', endDate: '2020-01', description: '', visible: false },
      { id: 'shown', company: '', position: 'Dev', startDate: '2024-08', endDate: '2020-01', description: 'Work', visible: true },
    ];
    const ids = checkResumeQuality(resume).map((issue) => issue.id);
    expect(ids).toEqual(['experience-company-shown', 'experience-date-shown']);
  });

  it('flags skills whose entries are blank instead of counting array length', () => {
    const resume = completeResume();
    resume.skills = [{ id: 's', category: '语言', items: ['   '] }];
    expect(checkResumeQuality(resume).map((issue) => issue.id)).toContain('skill-items-s');
  });

  it('treats a non-array skill list as empty without throwing', () => {
    const resume = completeResume();
    resume.skills = [{ id: 's', category: '', items: undefined as unknown as string[] }];
    expect(checkResumeQuality(resume).map((issue) => issue.id)).toEqual(expect.arrayContaining(['skill-category-s', 'skill-items-s']));
  });

  it.each([
    ['2024-13', 'present', '起止时间格式不正确'],
    ['2024-2', 'present', '起止时间格式不正确'],
    ['2024-08', '2024-2', '起止时间格式不正确'],
    ['0000-01', 'present', '起止时间格式不正确'],
    ['', '2020-01', '起止时间不完整'],
    ['', 'present', '起止时间不完整'],
    ['2024-08', '', '起止时间不完整'],
    ['2024-08', '2024-02', '结束时间早于开始时间'],
  ])('flags range %s → %s as %s', (start, end, message) => {
    const issues = withExperienceRange(start, end);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain(message);
    expect(issues[0]!.target).toBe('experience-date-e');
  });

  it.each([
    ['', ''],
    ['2024-08', '2024-08'],
    ['2024-08', 'present'],
    ['9999-01', '9999-01'],
  ])('accepts range %s → %s', (start, end) => {
    expect(withExperienceRange(start, end)).toEqual([]);
  });

  it('grades a missing summary as a suggestion and missing essentials as warnings', () => {
    const resume = completeResume();
    resume.basic.summary = '';
    resume.basic.name = '';
    const issues = checkResumeQuality(resume);
    expect(issues.find((issue) => issue.id === 'basic-summary')?.severity).toBe('info');
    expect(issues.find((issue) => issue.id === 'basic-name')?.severity).toBe('warning');
  });
});
