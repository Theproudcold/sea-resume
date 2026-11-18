import type { ResumeData } from '@/types/resume';

export interface ResumeQualityIssue {
  id: string;
  section: 'basic' | 'experience' | 'projects' | 'education' | 'skills';
  /** The editor field this issue should scroll to. `null` scrolls to the section root instead. */
  target: string | null;
  message: string;
  severity: 'warning' | 'info';
}

function plainText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim()
    : '';
}

/** Month index of a `YYYY-MM` token, or null when the value is not a real month. */
function parseMonth(value: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year > 0 && month >= 1 && month <= 12 ? year * 12 + month : null;
}

type DateRangeProblem = 'format' | 'incomplete' | 'reversed';

const DATE_RANGE_MESSAGES: Record<DateRangeProblem, string> = {
  format: '的起止时间格式不正确。',
  incomplete: '的起止时间不完整。',
  reversed: '的结束时间早于开始时间。',
};

/** Only reports what the user can act on: unreadable, half-filled or reversed months. Future dates stay valid. */
function dateRangeProblem(start: unknown, end: unknown): DateRangeProblem | null {
  const rawStart = typeof start === 'string' ? start.trim() : '';
  const rawEnd = typeof end === 'string' ? end.trim() : '';
  const ongoing = rawEnd === 'present';
  const startMonth = parseMonth(rawStart);
  const endMonth = ongoing ? null : parseMonth(rawEnd);

  if (rawStart && startMonth === null) return 'format';
  if (!ongoing && rawEnd && endMonth === null) return 'format';
  if (!rawStart || (!ongoing && !rawEnd)) return rawStart || rawEnd ? 'incomplete' : null;
  if (!ongoing && endMonth !== null && startMonth !== null && endMonth < startMonth) return 'reversed';
  return null;
}

/** A field the checker reads for completeness: anchor kind, current value and the name used in the message. */
type FieldSpec = [kind: string, value: unknown, label: string];

function isVisible(item: { visible?: boolean }): boolean {
  return item.visible !== false;
}

export function checkResumeQuality(resume: ResumeData): ResumeQualityIssue[] {
  const issues: ResumeQualityIssue[] = [];
  const add = (
    id: string,
    section: ResumeQualityIssue['section'],
    target: ResumeQualityIssue['target'],
    message: string,
    severity: ResumeQualityIssue['severity'] = 'warning',
  ) => issues.push({ id, section, target, message, severity });

  const hiddenSections = resume.hiddenSections ?? [];
  const isHiddenSection = (id: string) => hiddenSections.includes(id);

  const addFieldIssues = (section: ResumeQualityIssue['section'], itemId: string, label: string, fields: FieldSpec[]) => {
    fields.forEach(([kind, value, name]) => {
      if (plainText(value)) return;
      add(`${kind}-${itemId}`, section, `${kind}-${itemId}`, `${label}${name}为空。`);
    });
  };

  const addDateIssue = (
    section: ResumeQualityIssue['section'],
    kind: string,
    itemId: string,
    label: string,
    start: unknown,
    end: unknown,
  ) => {
    const problem = dateRangeProblem(start, end);
    if (!problem) return;
    add(`${kind}-${itemId}`, section, `${kind}-${itemId}`, `${label}${DATE_RANGE_MESSAGES[problem]}`);
  };

  if (!plainText(resume.basic.name)) add('basic-name', 'basic', 'basic-name', '请填写姓名。');
  if (!plainText(resume.basic.title)) add('basic-title', 'basic', 'basic-title', '请填写求职意向。');
  if (!plainText(resume.basic.email) && !plainText(resume.basic.phone)) add('basic-contact', 'basic', 'basic-contact', '请至少填写邮箱或电话。');
  if (!plainText(resume.basic.summary)) add('basic-summary', 'basic', 'basic-summary', '建议补充个人简介。', 'info');

  if (!resume.experiences.length) {
    if (!isHiddenSection('experience')) add('experience-empty', 'experience', null, '尚未添加工作经历。');
  } else if (!isHiddenSection('experience')) {
    resume.experiences.forEach((item, index) => {
      if (!isVisible(item)) return;
      const label = `工作经历 ${index + 1} 的`;
      addFieldIssues('experience', item.id, label, [
        ['experience-company', item.company, '公司名称'],
        ['experience-position', item.position, '职位'],
        ['experience-description', item.description, '工作描述'],
      ]);
      addDateIssue('experience', 'experience-date', item.id, label, item.startDate, item.endDate);
    });
  }

  if (!resume.projects.length) {
    if (!isHiddenSection('projects')) add('projects-empty', 'projects', null, '尚未添加项目经验。');
  } else if (!isHiddenSection('projects')) {
    resume.projects.forEach((item, index) => {
      if (!isVisible(item)) return;
      const label = `项目经验 ${index + 1} 的`;
      addFieldIssues('projects', item.id, label, [
        ['project-name', item.name, '名称'],
        ['project-role', item.role, '角色'],
        ['project-description', item.description, '项目描述'],
      ]);
      addDateIssue('projects', 'project-date', item.id, label, item.startDate, item.endDate);
    });
  }

  if (!resume.education.length) {
    if (!isHiddenSection('education')) add('education-empty', 'education', null, '尚未添加教育背景。');
  } else if (!isHiddenSection('education')) {
    resume.education.forEach((item, index) => {
      if (!isVisible(item)) return;
      const label = `教育背景 ${index + 1} 的`;
      addFieldIssues('education', item.id, label, [
        ['education-school', item.school, '学校名称'],
        ['education-degree', item.degree, '学历'],
        ['education-major', item.major, '专业'],
      ]);
      addDateIssue('education', 'education-date', item.id, label, item.startDate, item.endDate);
    });
  }

  if (!resume.skills.length) {
    if (!isHiddenSection('skills')) add('skills-empty', 'skills', null, '尚未添加技能分类。');
  } else if (!isHiddenSection('skills')) {
    resume.skills.forEach((item, index) => {
      if (!isVisible(item)) return;
      const label = `技能分类 ${index + 1} 的`;
      if (!plainText(item.category)) add(`skill-category-${item.id}`, 'skills', `skill-category-${item.id}`, `${label}名称为空。`);
      // Imported data may hold a non-array here; treat anything without one filled entry as empty.
      const filled = Array.isArray(item.items) && item.items.some((value) => plainText(value) !== '');
      if (!filled) add(`skill-items-${item.id}`, 'skills', `skill-items-${item.id}`, `${label}具体技能为空。`);
    });
  }

  return issues;
}
