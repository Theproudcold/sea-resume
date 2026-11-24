import type { ResumeData } from '@/types/resume';
import type { CommitStats } from '@/types/history';
import { compareResumeVersions, type ResumeDifference, type ResumeDifferenceType } from '@/utils/resumeVersions';

export interface DiffLine {
  kind: 'context' | 'add' | 'del';
  text: string;
}

export interface DiffHunk {
  id: string;
  section: string;
  label: string;
  type: ResumeDifferenceType;
  lines: DiffLine[];
  note?: string;
}

export interface CommitDiff {
  fromHash: string | null;
  toHash: string | null;
  hunks: DiffHunk[];
  stats: CommitStats;
  truncated: boolean;
  /** 初始版本没有父提交，用摘要代替逐行差异。 */
  initial: boolean;
}

export interface DiffSide {
  data: ResumeData;
  avatarHash?: string;
}

const MAX_DIFF_LINES = 400;
const MAX_DIFF_CELLS = 250_000;

type LineOp = DiffLine;

function splitLines(value: string): string[] {
  if (!value) return [];
  return value.replace(/\r\n?/g, '\n').split('\n');
}

interface LineDiffResult {
  lines: LineOp[];
  additions: number;
  deletions: number;
  truncated: boolean;
}

/**
 * 行级差异。字段级差异已经由 compareResumeVersions 给出，这里只负责把前后文本
 * 展开成 git 风格的 `- / +` 行；超过上限时退化为整段替换，避免大 HTML 卡住界面。
 */
export function diffTextLines(before: string, after: string): LineDiffResult {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  const replacement = (): LineDiffResult => {
    const lines = [
      ...beforeLines.map((text): LineOp => ({ kind: 'del', text })),
      ...afterLines.map((text): LineOp => ({ kind: 'add', text })),
    ];
    return {
      lines: lines.slice(0, MAX_DIFF_LINES),
      additions: afterLines.length,
      deletions: beforeLines.length,
      truncated: lines.length > MAX_DIFF_LINES,
    };
  };
  if (!beforeLines.length || !afterLines.length || beforeLines.length * afterLines.length > MAX_DIFF_CELLS) {
    return replacement();
  }

  const rows = beforeLines.length + 1;
  const columns = afterLines.length + 1;
  const lcs = Array.from({ length: rows }, () => new Uint32Array(columns));
  for (let row = beforeLines.length - 1; row >= 0; row--) {
    for (let column = afterLines.length - 1; column >= 0; column--) {
      lcs[row]![column] = beforeLines[row] === afterLines[column]
        ? lcs[row + 1]![column + 1]! + 1
        : Math.max(lcs[row + 1]![column]!, lcs[row]![column + 1]!);
    }
  }

  const ops: LineOp[] = [];
  let additions = 0;
  let deletions = 0;
  let row = 0;
  let column = 0;
  while (row < beforeLines.length && column < afterLines.length) {
    if (beforeLines[row] === afterLines[column]) {
      ops.push({ kind: 'context', text: beforeLines[row]! });
      row++;
      column++;
    } else if (lcs[row + 1]![column]! >= lcs[row]![column + 1]!) {
      ops.push({ kind: 'del', text: beforeLines[row]! });
      deletions++;
      row++;
    } else {
      ops.push({ kind: 'add', text: afterLines[column]! });
      additions++;
      column++;
    }
  }
  while (row < beforeLines.length) {
    ops.push({ kind: 'del', text: beforeLines[row++]! });
    deletions++;
  }
  while (column < afterLines.length) {
    ops.push({ kind: 'add', text: afterLines[column++]! });
    additions++;
  }

  if (ops.length <= MAX_DIFF_LINES) {
    return { lines: ops, additions, deletions, truncated: false };
  }

  // 只保留变更行及其前后一行上下文，避免把整篇长文都塞进面板。
  const keep = new Set<number>();
  ops.forEach((operation, index) => {
    if (operation.kind === 'context') return;
    keep.add(index - 1);
    keep.add(index);
    keep.add(index + 1);
  });
  const visible = [...keep]
    .filter((index) => index >= 0 && index < ops.length)
    .sort((left, right) => left - right)
    .slice(0, MAX_DIFF_LINES)
    .map((index) => ops[index]!);
  return { lines: visible, additions, deletions, truncated: true };
}

function differenceLabel(difference: ResumeDifference): string {
  return [difference.item, difference.field].filter(Boolean).join(' · ') || difference.section;
}

function differenceHunk(difference: ResumeDifference): { hunk: DiffHunk; additions: number; deletions: number; truncated: boolean } {
  if (difference.type === 'formatted') {
    return {
      hunk: {
        id: difference.id,
        section: difference.section,
        label: differenceLabel(difference),
        type: difference.type,
        lines: [],
        note: '格式变化（加粗、链接、列表等），可见文字未变。',
      },
      additions: 0,
      deletions: 0,
      truncated: false,
    };
  }
  const result = diffTextLines(difference.before, difference.after);
  return {
    hunk: {
      id: difference.id,
      section: difference.section,
      label: differenceLabel(difference),
      type: difference.type,
      lines: result.lines,
    },
    additions: result.additions,
    deletions: result.deletions,
    truncated: result.truncated,
  };
}

const PRESENTATION_SECTION = '版式与结构';

function presentationValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '未设置';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function layoutOf(data: ResumeData): unknown {
  return (data as ResumeData & { layout?: unknown }).layout;
}

function presentationHunks(before: ResumeData, after: ResumeData, fromAvatarHash?: string, toAvatarHash?: string): DiffHunk[] {
  const rows: Array<{ label: string; before: unknown; after: unknown }> = [
    { label: '模板', before: before.templateId, after: after.templateId },
    { label: '自定义版式', before: layoutOf(before), after: layoutOf(after) },
    { label: '主题色', before: before.theme.color, after: after.theme.color },
    { label: '字体', before: before.theme.fontFamily, after: after.theme.fontFamily },
    { label: '字号', before: before.theme.fontSize, after: after.theme.fontSize },
    { label: '行距', before: before.theme.lineHeight, after: after.theme.lineHeight },
    { label: '页边距', before: before.theme.pageMargins, after: after.theme.pageMargins },
    { label: '模块边距', before: before.theme.moduleMargins, after: after.theme.moduleMargins },
    { label: '日期格式', before: before.theme.dateFormat, after: after.theme.dateFormat },
    { label: '显示图标', before: before.theme.displayIcons, after: after.theme.displayIcons },
    { label: '模块顺序', before: before.sectionOrder, after: after.sectionOrder },
    { label: '隐藏模块', before: before.hiddenSections, after: after.hiddenSections },
  ];
  if (fromAvatarHash !== toAvatarHash && (fromAvatarHash || toAvatarHash)) {
    rows.push({ label: '头像', before: fromAvatarHash ? '有头像' : '无头像', after: toAvatarHash ? '有头像' : '无头像' });
  }

  return rows.flatMap((row, index) => {
    const beforeText = presentationValue(row.before);
    const afterText = presentationValue(row.after);
    if (beforeText === afterText) return [];
    return [{
      id: `presentation-${index}-${row.label}`,
      section: PRESENTATION_SECTION,
      label: row.label,
      type: 'modified' as const,
      lines: [
        { kind: 'del' as const, text: beforeText },
        { kind: 'add' as const, text: afterText },
      ],
    }];
  });
}

function contentLineCount(data: ResumeData): number {
  const parts: string[] = [data.basic.summary ?? ''];
  data.experiences.forEach((entry) => parts.push(entry.description, ...(entry.highlights ?? [])));
  data.projects.forEach((entry) => parts.push(entry.description, ...(entry.techStack ?? [])));
  data.education.forEach((entry) => parts.push(entry.school, entry.major));
  data.skills.forEach((entry) => parts.push(entry.category, ...entry.items));
  data.customBlocks.forEach((block) => {
    parts.push(block.title);
    if (Array.isArray(block.content)) block.content.forEach((item) => parts.push(item.title, item.description));
    else parts.push(block.content);
  });
  return parts.reduce((count, text) => count + splitLines(text).filter((line) => line.trim()).length, 0);
}

function populatedSections(data: ResumeData): string[] {
  const sections: string[] = [];
  if (data.basic.name || data.basic.title || data.basic.email || data.basic.phone) sections.push('个人信息');
  if (data.experiences.length) sections.push('工作经历');
  if (data.projects.length) sections.push('项目经验');
  if (data.education.length) sections.push('教育背景');
  if (data.skills.length) sections.push('技能');
  if (data.customBlocks.length) sections.push('自定义模块');
  return sections;
}

/**
 * 生成一个提交/工作区相对父版本的差异视图。
 * `before` 为 null 时表示初始版本，不构造逐行差异，避免把默认值也画成新增。
 */
export function buildCommitDiff(
  before: DiffSide | null,
  after: DiffSide,
  identity: { fromHash?: string | null; toHash?: string | null } = {},
): CommitDiff {
  if (!before) {
    return {
      fromHash: identity.fromHash ?? null,
      toHash: identity.toHash ?? null,
      hunks: [],
      stats: {
        additions: contentLineCount(after.data),
        deletions: 0,
        sections: populatedSections(after.data),
      },
      truncated: false,
      initial: true,
    };
  }

  const differences = compareResumeVersions(before.data, after.data);
  const hunks = differences.map((difference) => differenceHunk(difference));
  const presentation = presentationHunks(before.data, after.data, before.avatarHash, after.avatarHash);
  const contentHunks = hunks.map((entry) => entry.hunk);
  const allHunks = [...contentHunks, ...presentation];
  const additions = hunks.reduce((sum, entry) => sum + entry.additions, 0);
  const deletions = hunks.reduce((sum, entry) => sum + entry.deletions, 0);
  const sections = [...new Set(allHunks.map((hunk) => hunk.section))];
  return {
    fromHash: identity.fromHash ?? null,
    toHash: identity.toHash ?? null,
    hunks: allHunks,
    stats: {
      additions,
      deletions,
      sections,
    },
    truncated: hunks.some((entry) => entry.truncated),
    initial: false,
  };
}

export function diffStats(before: ResumeData | null, after: ResumeData): CommitStats {
  return buildCommitDiff(before ? { data: before } : null, { data: after }).stats;
}

/** 自动提交消息：优先描述变化最集中的章节。 */
export function suggestCommitMessage(diff: CommitDiff): string {
  if (diff.initial) return '初始版本';
  const sections = diff.stats.sections.filter((section) => section !== PRESENTATION_SECTION);
  if (!sections.length) {
    return diff.stats.sections.includes(PRESENTATION_SECTION) ? '调整版式与结构' : '更新简历';
  }
  if (sections.length === 1) return `更新${sections[0]}`;
  return `更新 ${sections.length} 个模块：${sections.slice(0, 3).join('、')}`;
}
