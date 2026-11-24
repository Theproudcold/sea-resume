import type { ResumeData } from '@/types/resume';
import { generateId } from '@/utils/helpers';
import { normalizeResumeData } from '@/utils/resumeData';
import { sanitizeResumeDataContent } from '@/utils/sanitizeResumeData';

/** 整份简历，含头像。超过 relay 的单条消息上限时拒绝，而不是截断后写回。 */
export const MAX_EXTERNAL_RESUME_BYTES = 1_500_000;
const REQUIRED_KEYS = ['basic', 'experiences', 'education', 'skills', 'projects', 'customBlocks', 'sectionOrder', 'theme', 'templateId'] as const;

function ensureEntryIds<T extends { id?: unknown }>(items: T[]): T[] {
  return items.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const id = typeof item.id === 'string' && item.id.trim() ? item.id : generateId();
    return id === item.id ? item : { ...item, id };
  });
}

/**
 * 更新已有简历（传入 current）时缺任一主要字段就拒绝，避免只传简介把经历、主题刷空；
 * 新建简历（不传 current）允许外部 Agent 只传核心字段，缺省章节与主题由归一化补齐。
 */
export function parseExternalResume(input: unknown, current?: ResumeData): ResumeData {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请提交完整简历对象。');
  const value = input as Record<string, unknown>;
  if (current && REQUIRED_KEYS.some(key => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error('请先读取完整简历，修改后再整份写回。');
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_EXTERNAL_RESUME_BYTES) throw new Error('简历数据过大。');
  const normalized = normalizeResumeData({ ...value, ...(current ? { id: current.id, createdAt: current.createdAt } : {}) });
  normalized.experiences = ensureEntryIds(normalized.experiences);
  normalized.education = ensureEntryIds(normalized.education);
  normalized.skills = ensureEntryIds(normalized.skills);
  normalized.projects = ensureEntryIds(normalized.projects);
  normalized.customBlocks = ensureEntryIds(normalized.customBlocks);
  return sanitizeResumeDataContent(normalized);
}
