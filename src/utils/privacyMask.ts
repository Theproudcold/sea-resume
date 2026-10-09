import type { ResumeData } from '@/types/resume';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?<!\d)\+?\d[\d\s().-]{8,}\d(?!\d)/g;

/** Redact recognizable contact details in rich text without touching stored data. */
export function maskSensitiveText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, '[邮箱已隐藏]')
    .replace(PHONE_PATTERN, (match) => (match.match(/\d/g)?.length ?? 0) >= 10 ? '[电话已隐藏]' : match);
}

/** Return a detached, presentation-only copy for preview and printing. */
export function createPrivacyMaskedResume(source: ResumeData): ResumeData {
  const resume = JSON.parse(JSON.stringify(source)) as ResumeData;
  resume.title = '匿名简历';
  resume.basic.name = '匿名用户';
  resume.basic.email = '***@***.***';
  resume.basic.phone = '***-****-****';
  resume.basic.location = '所在地已隐藏';
  resume.basic.website = '';
  resume.basic.avatar = undefined;
  resume.basic.birthDate = undefined;
  resume.basic.showAge = false;
  resume.basic.showExperienceYears = false;
  if (resume.basic.summary) resume.basic.summary = maskSensitiveText(resume.basic.summary);

  resume.experiences = resume.experiences.map((item) => ({
    ...item,
    description: maskSensitiveText(item.description),
    highlights: item.highlights?.map(maskSensitiveText),
  }));
  resume.projects = resume.projects.map((item) => ({ ...item, description: maskSensitiveText(item.description) }));
  resume.customBlocks = resume.customBlocks.map((block) => ({
    ...block,
    title: maskSensitiveText(block.title),
    content: typeof block.content === 'string'
      ? maskSensitiveText(block.content)
      : block.content.map((item) => ({ ...item, title: maskSensitiveText(item.title), subtitle: item.subtitle ? maskSensitiveText(item.subtitle) : undefined, description: maskSensitiveText(item.description) })),
  }));
  return resume;
}
