import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { checkResumeQuality } from '@/utils/resumeQuality';

const blankResume = () => {
  const resume = parseResumeMarkdown('# Resume').resume;
  resume.basic = { ...resume.basic, name: '', title: '', email: '', phone: '', summary: '' };
  resume.experiences = [];
  resume.projects = [];
  resume.education = [];
  return resume;
};

describe('resume quality checks', () => {
  it('reports missing basic fields and every empty primary section without changing data', () => {
    const resume = blankResume();
    const before = JSON.stringify(resume);
    const issues = checkResumeQuality(resume);
    const ids = issues.map((issue) => issue.id);
    expect(ids).toEqual(expect.arrayContaining([
      'basic-name', 'basic-title', 'basic-contact', 'basic-summary',
      'experience-empty', 'projects-empty', 'education-empty',
    ]));
    expect(JSON.stringify(resume)).toBe(before);
  });

  it('reports incomplete content and reversed date ranges with a destination section', () => {
    const resume = blankResume();
    resume.experiences = [{ id: 'e1', company: '', position: '', startDate: '2024-08', endDate: '2024-02', description: '' }];
    resume.projects = [{ id: 'p1', name: '', role: '', startDate: '', endDate: '', description: '' }];
    resume.education = [{ id: 'd1', school: '', degree: '', major: '', startDate: '', endDate: '' }];
    const issues = checkResumeQuality(resume);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'experience-incomplete-e1', section: 'experience' }),
      expect.objectContaining({ id: 'experience-date-e1', section: 'experience' }),
      expect.objectContaining({ id: 'project-incomplete-p1', section: 'projects' }),
      expect.objectContaining({ id: 'education-incomplete-d1', section: 'education' }),
    ]));
  });

  it('accepts a complete resume and valid or current date ranges', () => {
    const resume = blankResume();
    resume.basic = { ...resume.basic, name: 'Ada', title: 'Engineer', email: 'ada@example.com', summary: '<p>Builder</p>' };
    resume.experiences = [{ id: 'e', company: 'A', position: 'Dev', startDate: '2022-01', endDate: 'present', description: '<p>Built systems</p>' }];
    resume.projects = [{ id: 'p', name: 'Tool', role: 'Lead', startDate: '2021-01', endDate: '2021-12', description: 'Shipped' }];
    resume.education = [{ id: 'd', school: 'U', degree: 'BS', major: 'CS', startDate: '2018-01', endDate: '2021-01' }];
    expect(checkResumeQuality(resume)).toEqual([]);
  });

  it('flags parseable month tokens with invalid month numbers', () => {
    const resume = blankResume();
    resume.experiences = [{ id: 'bad-date', company: 'A', position: 'Dev', startDate: '2024-13', endDate: 'present', description: 'Work' }];
    expect(checkResumeQuality(resume).map((issue) => issue.id)).toContain('experience-date-bad-date');
  });
});
