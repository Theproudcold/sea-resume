import type { ResumeData } from '@/types/resume';

export interface ResumeQualityIssue {
  id: string;
  section: 'basic' | 'experience' | 'projects' | 'education' | 'skills';
  /** The editor field this issue should scroll to and focus. */
  target: string;
  message: string;
  severity: 'warning' | 'info';
}

function plainText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim()
    : '';
}

function monthValue(value: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year > 0 && month >= 1 && month <= 12 ? year * 12 + month : null;
}

function hasInvalidRange(start: string, end: string): boolean {
  if (!start || !/^\d{4}-\d{2}$/.test(start)) return false;
  const startMonth = monthValue(start);
  if (startMonth === null) return true;
  if (!end || end === 'present' || !/^\d{4}-\d{2}$/.test(end)) return false;
  const endMonth = monthValue(end);
  return endMonth === null || endMonth < startMonth;
}

export function checkResumeQuality(resume: ResumeData): ResumeQualityIssue[] {
  const issues: ResumeQualityIssue[] = [];
  const add = (id: string, section: ResumeQualityIssue['section'], target: string, message: string) => issues.push({ id, section, target, message, severity: 'warning' });

  if (!plainText(resume.basic.name)) add('basic-name', 'basic', 'basic-name', '请填写姓名。');
  if (!plainText(resume.basic.title)) add('basic-title', 'basic', 'basic-title', '请填写求职意向。');
  if (!plainText(resume.basic.email) && !plainText(resume.basic.phone)) add('basic-contact', 'basic', 'basic-contact', '请至少填写邮箱或电话。');
  if (!plainText(resume.basic.summary)) add('basic-summary', 'basic', 'basic-summary', '建议补充个人简介。');

  if (!resume.experiences.length) add('experience-empty', 'experience', 'experience-empty', '尚未添加工作经历。');
  resume.experiences.forEach((item, index) => {
    const missing = !plainText(item.company) ? 'experience-company'
      : !plainText(item.position) ? 'experience-position'
      : !plainText(item.description) ? 'experience-description'
      : '';
    if (missing) add(`experience-incomplete-${item.id}`, 'experience', `${missing}-${item.id}`, `工作经历 ${index + 1} 的公司、职位或工作描述为空。`);
    if (hasInvalidRange(item.startDate, item.endDate)) add(`experience-date-${item.id}`, 'experience', `experience-date-${item.id}`, `工作经历 ${index + 1} 的结束时间早于开始时间。`);
  });

  if (!resume.projects.length) add('projects-empty', 'projects', 'projects-empty', '尚未添加项目经验。');
  resume.projects.forEach((item, index) => {
    const missing = !plainText(item.name) ? 'project-name'
      : !plainText(item.role) ? 'project-role'
      : !plainText(item.description) ? 'project-description'
      : '';
    if (missing) add(`project-incomplete-${item.id}`, 'projects', `${missing}-${item.id}`, `项目经验 ${index + 1} 的名称、角色或项目描述为空。`);
    if (hasInvalidRange(item.startDate, item.endDate)) add(`project-date-${item.id}`, 'projects', `project-date-${item.id}`, `项目经验 ${index + 1} 的结束时间早于开始时间。`);
  });

  if (!resume.education.length) add('education-empty', 'education', 'education-empty', '尚未添加教育背景。');
  resume.education.forEach((item, index) => {
    const missing = !plainText(item.school) ? 'education-school'
      : !plainText(item.degree) ? 'education-degree'
      : !plainText(item.major) ? 'education-major'
      : '';
    if (missing) add(`education-incomplete-${item.id}`, 'education', `${missing}-${item.id}`, `教育背景 ${index + 1} 的学校、学历或专业为空。`);
    if (hasInvalidRange(item.startDate, item.endDate)) add(`education-date-${item.id}`, 'education', `education-date-${item.id}`, `教育背景 ${index + 1} 的结束时间早于开始时间。`);
  });

  if (!resume.skills.length) add('skills-empty', 'skills', 'skills-empty', '尚未添加技能分类。');
  resume.skills.forEach((item, index) => {
    const missing = !plainText(item.category) ? 'skill-category' : !item.items.length ? 'skill-items' : '';
    if (missing) add(`skill-incomplete-${item.id}`, 'skills', `${missing}-${item.id}`, `技能分类 ${index + 1} 的名称或具体技能为空。`);
  });

  return issues;
}
