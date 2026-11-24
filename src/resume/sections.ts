import type { ResumeData } from '@/types/resume';

/** 标准模块。自定义模块的 id 不在这里，它们来自 customBlocks。 */
export const DEFAULT_SECTION_ORDER = ['experience', 'projects', 'education', 'skills'] as const;
export const STANDARD_SECTION_IDS = DEFAULT_SECTION_ORDER;

export const DEFAULT_SECTION_TITLES: ResumeData['sectionTitles'] = {
  experience: '工作经历',
  projects: '项目经验',
  education: '教育背景',
  skills: '技能证书',
};

/**
 * 可搜索 PDF 在标题字段缺失时用过的旧文案。
 * 界面和 Markdown 用 DEFAULT_SECTION_TITLES。两边都走 sectionDisplayTitle，只是兜底文案不同。
 */
export const PDF_SECTION_TITLE_FALLBACKS: Record<string, string> = {
  experience: '工作经验',
  education: '教育经历',
  projects: '项目经历',
  skills: '专业技能',
};

/**
 * 模块的阅读顺序。
 * sectionOrder 优先；没出现在里面的标准模块和自定义模块按原顺序补在后面。
 * 自定义模块之间的补位顺序用 customBlocks.order，读盘时它会被 align 成 sectionOrder 里的下标。
 */
export function orderedSectionIds(data: Pick<ResumeData, 'sectionOrder' | 'customBlocks'>): string[] {
  const customOrder = [...data.customBlocks].sort((a, b) => a.order - b.order).map((block) => block.id);
  const fallback = [...DEFAULT_SECTION_ORDER, ...customOrder];
  const sectionOrder = data.sectionOrder.length ? data.sectionOrder : fallback;
  return [...new Set([...sectionOrder, ...fallback])];
}

/**
 * 模块显示名。
 * 标准模块看 sectionTitles，再看调用方给的兜底文案。
 * 自定义模块以 customBlocks.title 为准（编辑器写在这里），sectionTitles 只是旧副本。
 */
export function sectionDisplayTitle(
  data: Pick<ResumeData, 'sectionTitles' | 'customBlocks'>,
  id: string,
  fallbacks: Record<string, string> = DEFAULT_SECTION_TITLES,
): string {
  const stored = data.sectionTitles?.[id];
  const block = data.customBlocks.find((item) => item.id === id);
  if (block) return block.title || stored || fallbacks[id] || '未命名模块';
  return stored || fallbacks[id] || id;
}

/** 让 customBlocks.order 跟上 sectionOrder，不改调用方手里的原对象。 */
export function withAlignedCustomBlockOrder<T extends Pick<ResumeData, 'sectionOrder' | 'customBlocks'>>(resume: T): T {
  const index = new Map(resume.sectionOrder.map((id, position) => [id, position]));
  let changed = false;
  const customBlocks = resume.customBlocks.map((block) => {
    const position = index.get(block.id);
    if (position === undefined || block.order === position) return block;
    changed = true;
    return { ...block, order: position };
  });
  return changed ? { ...resume, customBlocks } : resume;
}

/** 自定义模块改名时，标题和 sectionTitles 里的旧副本一起改。 */
export function syncCustomBlockTitle(resume: ResumeData, id: string, title: string): void {
  const block = resume.customBlocks.find((item) => item.id === id);
  if (block) block.title = title;
  resume.sectionTitles[id] = title;
}
