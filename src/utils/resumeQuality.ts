import type { ResumeData } from '@/types/resume';

export type ResumeQualitySection = 'theme' | 'basic' | 'experience' | 'projects' | 'education' | 'skills';

export interface ResumeQualityIssue {
  id: string;
  section: ResumeQualitySection;
  /** The editor field this issue should scroll to. `null` scrolls to the section root instead. */
  target: string | null;
  message: string;
  severity: 'warning' | 'info';
  /** 可选分类，便于界面区分基础完整性、求职避坑与表达可读性。 */
  category?: 'completeness' | 'pitfall' | 'writing';
  /** 可选一键修复动作（当前支持按时间由近及远倒序排列）。 */
  action?: 'sort-desc';
}

function plainText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
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

const PRESENT_MONTH = Number.MAX_SAFE_INTEGER;

/** 提取条目的可比较时间权重（优先按结束时间，「至今」视为最新，其次按开始时间）。 */
function entrySortKey(start: unknown, end: unknown): { endKey: number; startKey: number } | null {
  const rawStart = typeof start === 'string' ? start.trim() : '';
  const rawEnd = typeof end === 'string' ? end.trim() : '';
  const startMonth = parseMonth(rawStart);
  const endMonth = rawEnd === 'present' ? PRESENT_MONTH : parseMonth(rawEnd);
  if (endMonth === null && startMonth === null) return null;
  return {
    endKey: endMonth ?? startMonth!,
    startKey: startMonth ?? endMonth!,
  };
}

/** 按起止时间「由近及远」稳定倒序排列；无有效日期的条目保持原顺序留在末尾。 */
export function sortEntriesByDateDesc<T extends { startDate?: string; endDate?: string }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index, key: entrySortKey(item.startDate, item.endDate) }))
    .sort((a, b) => {
      if (a.key && b.key) {
        if (b.key.endKey !== a.key.endKey) return b.key.endKey - a.key.endKey;
        if (b.key.startKey !== a.key.startKey) return b.key.startKey - a.key.startKey;
        return a.index - b.index;
      }
      if (a.key) return -1;
      if (b.key) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

/** 判断可见条目是否违背「由近及远」的时间倒序。 */
function isOutOfReverseChronologicalOrder(items: ReadonlyArray<{ startDate?: string; endDate?: string; visible?: boolean }>): boolean {
  const keys = items
    .filter((item) => item.visible !== false)
    .map((item) => entrySortKey(item.startDate, item.endDate))
    .filter((key): key is { endKey: number; startKey: number } => key !== null);
  if (keys.length < 2) return false;
  for (let i = 1; i < keys.length; i += 1) {
    const prev = keys[i - 1]!;
    const curr = keys[i]!;
    if (curr.endKey > prev.endKey) return true;
    if (curr.endKey === prev.endKey && curr.startKey > prev.startKey) return true;
  }
  return false;
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

/** 期望薪资红线词：简历中写薪资易引起面试官心理不平衡，留到 HR 谈薪环节更稳妥。 */
const SALARY_LEAK_RE = /(?:期望薪资|期望月薪|薪资期望|薪资要求|目标薪资|预期薪资|期望年薪)/u;

/** 个人简介空洞自我评价词：缺乏具体事例佐证时没有区分度。 */
const SUMMARY_CLICHE_RE = /(认真负责|抗压能力强|吃苦耐劳|善于沟通|学习能力强|团队合作精神|积极向上|性格开朗|工作踏实|责任心强)/gu;

/** 经历/项目描述高频 AI 腔与空泛套话。 */
const WRITING_CLICHE_RE = /(深度参与|负责相关工作|显著提升|丰富经验|赋能|抓手|闭环|通过[^，。；;\n]{1,24}实现了[^，。；;\n]{1,24}从而)/gu;

/** 常见高撞车率练手/教程项目名，初筛辨识度低。 */
const COMMON_DEMO_PROJECT_RE = /(苍穹外卖|瑞吉外卖|谷粒商城|黑马点评|尚医通|若依后台|若依管理系统)/u;

function matchUniquePhrases(text: string, pattern: RegExp): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const phrase = (match[1] ?? match[0]).trim();
    if (phrase) found.add(phrase.length > 16 ? `${phrase.slice(0, 16)}…` : phrase);
    if (found.size >= 3) break;
  }
  return [...found];
}

/** 判断富文本是否为大段无分点/无换行的长文字块，易造成视觉拥挤。 */
function isLongUnstructuredWall(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const text = plainText(raw);
  if (text.length < 180) return false;
  if (/<li\b/i.test(raw)) return false;
  const paragraphCount = (raw.match(/<p\b/gi) ?? []).length;
  const lineBreaks = (raw.match(/<br\s*\/?>|\n/gi) ?? []).length;
  return paragraphCount <= 1 && lineBreaks === 0;
}

/** 判断技能分类是否为关键词堆砌（至少 3 个短词且无任何展开说明）。 */
function isShallowSkillList(items: unknown): boolean {
  if (!Array.isArray(items)) return false;
  const filled = items.map((item) => plainText(item)).filter(Boolean);
  if (filled.length < 3) return false;
  return filled.every((item) => item.length <= 12 && !/[，。：；（）():;,]/u.test(item));
}

export function checkResumeQuality(resume: ResumeData): ResumeQualityIssue[] {
  const issues: ResumeQualityIssue[] = [];
  const add = (
    id: string,
    section: ResumeQualitySection,
    target: ResumeQualityIssue['target'],
    message: string,
    severity: ResumeQualityIssue['severity'] = 'warning',
    extra: Pick<ResumeQualityIssue, 'category' | 'action'> = {},
  ) => issues.push({ id, section, target, message, severity, ...extra });

  const hiddenSections = resume.hiddenSections ?? [];
  const isHiddenSection = (id: string) => hiddenSections.includes(id);

  const addFieldIssues = (section: ResumeQualitySection, itemId: string, label: string, fields: FieldSpec[]) => {
    fields.forEach(([kind, value, name]) => {
      if (plainText(value)) return;
      add(`${kind}-${itemId}`, section, `${kind}-${itemId}`, `${label}${name}为空。`, 'warning', { category: 'completeness' });
    });
  };

  const addDateIssue = (
    section: ResumeQualitySection,
    kind: string,
    itemId: string,
    label: string,
    start: unknown,
    end: unknown,
  ) => {
    const problem = dateRangeProblem(start, end);
    if (!problem) return;
    add(`${kind}-${itemId}`, section, `${kind}-${itemId}`, `${label}${DATE_RANGE_MESSAGES[problem]}`, 'warning', { category: 'completeness' });
  };

  if (!plainText(resume.basic.name)) add('basic-name', 'basic', 'basic-name', '请填写姓名。', 'warning', { category: 'completeness' });
  if (!plainText(resume.basic.title)) add('basic-title', 'basic', 'basic-title', '请填写求职意向。', 'warning', { category: 'completeness' });
  if (!plainText(resume.basic.email) && !plainText(resume.basic.phone)) {
    add('basic-contact', 'basic', 'basic-contact', '请至少填写邮箱或电话。', 'warning', { category: 'completeness' });
  }

  const summaryText = plainText(resume.basic.summary);
  if (!summaryText) {
    add('basic-summary', 'basic', 'basic-summary', '个人简介为空（若无具体成果或事例佐证，保持留空即可，不必写泛泛自我评价）。', 'info', { category: 'writing' });
  } else {
    const summaryCliches = matchUniquePhrases(summaryText, SUMMARY_CLICHE_RE);
    if (summaryCliches.length > 0 && !/\d/.test(summaryText)) {
      add(
        'basic-summary-cliche',
        'basic',
        'basic-summary',
        `个人简介含空洞自评词（${summaryCliches.join('、')}），建议用具体事例或成果佐证，或直接精简删除。`,
        'info',
        { category: 'writing' },
      );
    }
  }

  // 期望薪资红线检测：检查求职意向、个人简介与自定义联系方式。
  const salaryLeakTarget = SALARY_LEAK_RE.test(plainText(resume.basic.title))
    ? 'basic-title'
    : SALARY_LEAK_RE.test(summaryText)
      ? 'basic-summary'
      : (resume.basic.customContacts ?? []).some((contact) => SALARY_LEAK_RE.test(`${contact.label} ${contact.value}`))
        ? null
        : undefined;
  if (salaryLeakTarget !== undefined) {
    add(
      'basic-salary-leak',
      'basic',
      salaryLeakTarget,
      '检测到简历中填写了期望薪资。建议留待 HR 谈薪环节沟通，避免面试阶段因薪资预期影响评价。',
      'warning',
      { category: 'pitfall' },
    );
  }

  if (!resume.experiences.length) {
    if (!isHiddenSection('experience')) add('experience-empty', 'experience', null, '尚未添加工作经历。', 'warning', { category: 'completeness' });
  } else if (!isHiddenSection('experience')) {
    if (isOutOfReverseChronologicalOrder(resume.experiences)) {
      add(
        'experience-order',
        'experience',
        null,
        '工作经历未按时间「由近及远」排列，建议把最近一段经历放在最前面。',
        'info',
        { category: 'pitfall', action: 'sort-desc' },
      );
    }
    resume.experiences.forEach((item, index) => {
      if (!isVisible(item)) return;
      const label = `工作经历 ${index + 1} 的`;
      addFieldIssues('experience', item.id, label, [
        ['experience-company', item.company, '公司名称'],
        ['experience-position', item.position, '职位'],
        ['experience-description', item.description, '工作描述'],
      ]);
      addDateIssue('experience', 'experience-date', item.id, label, item.startDate, item.endDate);
      const descText = plainText(item.description);
      const cliches = matchUniquePhrases(descText, WRITING_CLICHE_RE);
      if (cliches.length > 0) {
        add(
          `experience-cliche-${item.id}`,
          'experience',
          `experience-description-${item.id}`,
          `${label}描述含套话或 AI 腔（${cliches.join('、')}），建议改写为具体动作与可核查结果。`,
          'info',
          { category: 'writing' },
        );
      }
      if (isLongUnstructuredWall(item.description)) {
        add(
          `experience-wall-${item.id}`,
          'experience',
          `experience-description-${item.id}`,
          `${label}描述为较长纯段落，建议按 STAR 拆成短列表并将关键指标加粗，避免文字挤成一团。`,
          'info',
          { category: 'writing' },
        );
      }
    });
  }

  if (!resume.projects.length) {
    if (!isHiddenSection('projects')) add('projects-empty', 'projects', null, '尚未添加项目经验。', 'warning', { category: 'completeness' });
  } else if (!isHiddenSection('projects')) {
    if (isOutOfReverseChronologicalOrder(resume.projects)) {
      add(
        'projects-order',
        'projects',
        null,
        '项目经验未按时间「由近及远」排列，建议将近期核心项目排在前面。',
        'info',
        { category: 'pitfall', action: 'sort-desc' },
      );
    }
    resume.projects.forEach((item, index) => {
      if (!isVisible(item)) return;
      const label = `项目经验 ${index + 1} 的`;
      addFieldIssues('projects', item.id, label, [
        ['project-name', item.name, '名称'],
        ['project-role', item.role, '角色'],
        ['project-description', item.description, '项目描述'],
      ]);
      addDateIssue('projects', 'project-date', item.id, label, item.startDate, item.endDate);
      const nameText = plainText(item.name);
      if (COMMON_DEMO_PROJECT_RE.test(nameText)) {
        add(
          `project-common-demo-${item.id}`,
          'projects',
          `project-name-${item.id}`,
          `${label}名称「${nameText}」较为常见，容易在初筛时同质化，建议突出个人二次改造或替换为原创/业务项目。`,
          'info',
          { category: 'pitfall' },
        );
      }
      const descText = plainText(item.description);
      const cliches = matchUniquePhrases(descText, WRITING_CLICHE_RE);
      if (cliches.length > 0) {
        add(
          `project-cliche-${item.id}`,
          'projects',
          `project-description-${item.id}`,
          `${label}描述含套话或 AI 腔（${cliches.join('、')}），建议改写为具体方案与量化结果。`,
          'info',
          { category: 'writing' },
        );
      }
      if (isLongUnstructuredWall(item.description)) {
        add(
          `project-wall-${item.id}`,
          'projects',
          `project-description-${item.id}`,
          `${label}描述为较长纯段落，建议按 STAR 拆成短列表并加粗重点，提升可读性。`,
          'info',
          { category: 'writing' },
        );
      }
    });
  }

  if (!resume.education.length) {
    if (!isHiddenSection('education')) add('education-empty', 'education', null, '尚未添加教育背景。', 'warning', { category: 'completeness' });
  } else if (!isHiddenSection('education')) {
    if (isOutOfReverseChronologicalOrder(resume.education)) {
      add(
        'education-order',
        'education',
        null,
        '教育背景未按时间「由近及远」排列，建议将最高/最近学历排在前面。',
        'info',
        { category: 'pitfall', action: 'sort-desc' },
      );
    }
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
    if (!isHiddenSection('skills')) add('skills-empty', 'skills', null, '尚未添加技能分类。', 'warning', { category: 'completeness' });
  } else if (!isHiddenSection('skills')) {
    resume.skills.forEach((item, index) => {
      if (!isVisible(item)) return;
      const label = `技能分类 ${index + 1} 的`;
      if (!plainText(item.category)) {
        add(`skill-category-${item.id}`, 'skills', `skill-category-${item.id}`, `${label}名称为空。`, 'warning', { category: 'completeness' });
      }
      // Imported data may hold a non-array here; treat anything without one filled entry as empty.
      const filled = Array.isArray(item.items) && item.items.some((value) => plainText(value) !== '');
      if (!filled) {
        add(`skill-items-${item.id}`, 'skills', `skill-items-${item.id}`, `${label}具体技能为空。`, 'warning', { category: 'completeness' });
      } else if (isShallowSkillList(item.items)) {
        add(
          `skill-shallow-${item.id}`,
          'skills',
          `skill-items-${item.id}`,
          `${label}内容偏向简短关键词堆砌，建议展开写清熟悉程度、底层原理或核心组件经验。`,
          'info',
          { category: 'writing' },
        );
      }
    });
  }

  // 排版可读性检查：行距过小或字号行距同时触底时提醒，避免文字糊成一坨。
  const fontSize = resume.theme?.fontSize;
  const lineHeight = resume.theme?.lineHeight;
  if (
    (typeof lineHeight === 'number' && Number.isFinite(lineHeight) && lineHeight <= 1.2)
    || (typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize <= 12 && typeof lineHeight === 'number' && lineHeight <= 1.3)
  ) {
    add(
      'theme-crowded',
      'theme',
      null,
      '当前字号或行间距偏紧，文字容易挤成一团；简历 1~2 页舒展排版通常比硬压一页更易读。',
      'info',
      { category: 'writing' },
    );
  }

  return issues;
}
