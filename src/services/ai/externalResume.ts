import type { ResumeData } from '@/types/resume';
import { normalizeResumeData } from '@/utils/resumeData';

/** 整份简历，含头像。超过 relay 的单条消息上限时拒绝，而不是截断后写回。 */
export const MAX_EXTERNAL_RESUME_BYTES = 1_500_000;
const REQUIRED_KEYS = ['basic', 'experiences', 'education', 'skills', 'projects', 'customBlocks', 'sectionOrder', 'theme', 'templateId'] as const;

/** 缺任一主要字段就拒绝，避免只传简介时把经历、主题等刷成空。传入已有简历时保留它的 id。 */
export function parseExternalResume(input: unknown, current?: ResumeData): ResumeData {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请提交完整简历对象。');
  const value = input as Record<string, unknown>;
  if (REQUIRED_KEYS.some(key => !Object.prototype.hasOwnProperty.call(value, key))) throw new Error('请先读取完整简历，修改后再整份写回。');
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_EXTERNAL_RESUME_BYTES) throw new Error('简历数据过大。');
  return normalizeResumeData({ ...value, ...(current ? { id: current.id, createdAt: current.createdAt } : {}) });
}
