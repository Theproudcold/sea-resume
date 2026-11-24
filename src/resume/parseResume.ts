import type { ResumeData } from '@/types/resume';
import { validateResumeData } from '@/utils/export-json';
import { normalizeResumeData } from '@/utils/resumeData';

/**
 * 简历结构只有这一条解析入口。
 *
 * - read：读盘、迁移、切换简历。缺字段补默认，脏字段尽量留下。
 * - import：用户选来的 JSON。字段不对就拒绝。会进 HTML 的正文在这一步清洗。
 *
 * 进页面或备份展示之前如果还要洗 URL / 富文本，用 sanitizeResumeDataContent。
 * 那一步假定结构已经完整，不再补默认值。
 */
export function parseResume(source: unknown, mode: 'read' | 'import'): ResumeData {
  return mode === 'import' ? validateResumeData(source) : normalizeResumeData(source);
}
