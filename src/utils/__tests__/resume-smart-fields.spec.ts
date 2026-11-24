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

  it('merges overlapping experience months, shows only years when >= 1 year, and months when < 1 year', () => {
    const experiences = [
      { id: 'a', company: 'A', position: 'Dev', startDate: '2020-01', endDate: '2021-12', description: '' },
      { id: 'b', company: 'B', position: 'Dev', startDate: '2021-06', endDate: '2023-12', description: '' },
      { id: 'c', company: 'C', position: 'Dev', startDate: '2024-01', endDate: 'present', description: '' },
    ];
    // 66 个月（5 年 6 个月）→ 满一年仅显示年份
    expect(calculateWorkExperience(experiences, new Date(2025, 5, 1))).toBe('5 年');
    // 正好 12 个月 → 显示 1 年
    expect(calculateWorkExperience(
      [{ id: 'd', company: 'D', position: 'Dev', startDate: '2024-06', endDate: '2025-05', description: '' }],
      new Date(2025, 5, 1),
    )).toBe('1 年');
    // 小于一年（6 个月）→ 显示月份
    expect(calculateWorkExperience(
      [{ id: 'e', company: 'E', position: 'Dev', startDate: '2025-01', endDate: 'present', description: '' }],
      new Date(2025, 5, 1),
    )).toBe('6 个月');
    // 不猜测纯年份
    expect(calculateWorkExperience([{ ...experiences[0]!, startDate: '2020' }], new Date(2025, 5, 1))).toBeNull();
  });

  it('ignores hidden experiences and parses flexible YYYY-MM-DD / Chinese year-month / 至今 dates', () => {
    const experiences = [
      { id: 'hidden', company: 'H', position: 'Dev', startDate: '2018-01', endDate: '2022-12', description: '', visible: false },
      { id: 'cn', company: 'C', position: 'Dev', startDate: '2024年1月', endDate: '2024-08-15', description: '' },
    ];
    expect(calculateWorkExperience(experiences, new Date(2025, 5, 1))).toBe('8 个月');

    expect(calculateWorkExperience(
      [{ id: 'p', company: 'P', position: 'Dev', startDate: ' 2023.05 ', endDate: '至今', description: '' }],
      new Date(2025, 5, 1),
    )).toBe('2 年');
  });

  it('keeps calculated fields hidden unless the user enables them', () => {
    const resume = parseResumeMarkdown('# Mei').resume;
    resume.basic.birthDate = '1990-01-01';
    expect(getResumeSmartFields(resume, new Date(2025, 5, 1))).toEqual({ age: null, workExperience: null });
    resume.basic.showAge = true;
    resume.basic.showExperienceYears = true;
    resume.experiences.push({ id: 'a', company: 'A', position: 'Dev', startDate: '2020-01', endDate: 'present', description: '' });
    expect(getResumeSmartFields(resume, new Date(2025, 5, 1))).toEqual({ age: 35, workExperience: '5 年' });
  });
});
