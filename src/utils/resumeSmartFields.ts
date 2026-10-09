import type { ResumeData } from '@/types/resume';

export interface ResumeSmartFields {
  age: number | null;
  workExperience: string | null;
}

function parseYearMonth(value: string): number | null {
  const match = value.match(/^(\d{4})[./-](\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1900 || month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

export function calculateAge(birthDate: string | undefined, today = new Date()): number | null {
  if (!birthDate) return null;
  const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date > today) return null;
  let age = today.getFullYear() - year;
  if (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)) age -= 1;
  return age >= 0 ? age : null;
}

/** Counts distinct employed calendar months, merging overlaps and never guessing year-only dates. */
export function calculateWorkExperience(experiences: ResumeData['experiences'], today = new Date()): string | null {
  const currentMonth = today.getFullYear() * 12 + today.getMonth();
  const intervals = experiences.flatMap((experience) => {
    const start = parseYearMonth(experience.startDate);
    const end = experience.endDate === 'present' ? currentMonth : parseYearMonth(experience.endDate);
    return start !== null && end !== null && end >= start ? [{ start, end }] : [];
  }).sort((a, b) => a.start - b.start);

  if (!intervals.length) return null;
  let totalMonths = 0;
  let start = intervals[0]!.start;
  let end = intervals[0]!.end;
  for (const interval of intervals.slice(1)) {
    if (interval.start <= end + 1) end = Math.max(end, interval.end);
    else {
      totalMonths += end - start + 1;
      start = interval.start;
      end = interval.end;
    }
  }
  totalMonths += end - start + 1;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years && months) return `${years} 年 ${months} 个月`;
  if (years) return `${years} 年`;
  return `${months} 个月`;
}

export function getResumeSmartFields(resume: ResumeData, today = new Date()): ResumeSmartFields {
  return {
    age: resume.basic.showAge ? calculateAge(resume.basic.birthDate, today) : null,
    workExperience: resume.basic.showExperienceYears ? calculateWorkExperience(resume.experiences, today) : null,
  };
}
