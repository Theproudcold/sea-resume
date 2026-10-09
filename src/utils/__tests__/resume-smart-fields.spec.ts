import { describe, expect, it } from 'vitest';
import { calculateAge, calculateWorkExperience, getResumeSmartFields } from '@/utils/resumeSmartFields';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';

describe('optional resume age and work tenure', () => {
  it('calculates age only from a valid birthday and respects the birthday date', () => {
    expect(calculateAge('1990-08-12', new Date(2025, 7, 11))).toBe(34);
    expect(calculateAge('1990-08-12', new Date(2025, 7, 12))).toBe(35);
    expect(calculateAge('2026-01-01', new Date(2025, 0, 1))).toBeNull();
    expect(calculateAge('1990', new Date(2025, 0, 1))).toBeNull();
  });

  it('merges overlapping experience months and does not guess year-only dates', () => {
    const experiences = [
      { id: 'a', company: 'A', position: 'Dev', startDate: '2020-01', endDate: '2021-12', description: '' },
      { id: 'b', company: 'B', position: 'Dev', startDate: '2021-06', endDate: '2023-12', description: '' },
      { id: 'c', company: 'C', position: 'Dev', startDate: '2024-01', endDate: 'present', description: '' },
    ];
    expect(calculateWorkExperience(experiences, new Date(2025, 5, 1))).toBe('5 年 6 个月');
    expect(calculateWorkExperience([{ ...experiences[0]!, startDate: '2020' }], new Date(2025, 5, 1))).toBeNull();
  });

  it('keeps calculated fields hidden unless the user enables them', () => {
    const resume = parseResumeMarkdown('# Mei').resume;
    resume.basic.birthDate = '1990-01-01';
    expect(getResumeSmartFields(resume, new Date(2025, 5, 1))).toEqual({ age: null, workExperience: null });
    resume.basic.showAge = true;
    resume.basic.showExperienceYears = true;
    resume.experiences.push({ id: 'a', company: 'A', position: 'Dev', startDate: '2020-01', endDate: 'present', description: '' });
    expect(getResumeSmartFields(resume, new Date(2025, 5, 1))).toEqual({ age: 35, workExperience: '5 年 6 个月' });
  });
});
