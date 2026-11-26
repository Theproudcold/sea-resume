/**
 * 经历/项目的「面试口述备忘」独立本机存储。
 *
 * 设计契约：
 * - 严格独立于 ResumeData 正文之外，绝不进入预览画布、PDF/图片/Markdown 导出或版本历史哈希。
 * - 用于存放「预留给面试官口述的细节、个人贡献占比与追问底稿」，避免把所有细节塞满纸面简历。
 */

export interface InterviewEntryNote {
  /** 个人实际贡献边界与占比（如主导模块、协作分工）。 */
  contribution: string;
  /** 纸面简历刻意省略、留待面试现场展开的口述细节与取舍理由。 */
  talkingPoints: string;
  /** 高频追问准备底稿（线上故障、备选方案、指标口径）。 */
  qaPrep: string;
  updatedAt: string;
}

type ResumeNotesMap = Record<string, InterviewEntryNote>;

const KEY_PREFIX = 'sea-resume:interview-notes:v1:';
const MAX_FIELD_LEN = 3000;

export function createEmptyInterviewNote(): InterviewEntryNote {
  return {
    contribution: '',
    talkingPoints: '',
    qaPrep: '',
    updatedAt: '',
  };
}

export function hasInterviewNoteContent(note: Pick<InterviewEntryNote, 'contribution' | 'talkingPoints' | 'qaPrep'>): boolean {
  return Boolean(note.contribution.trim() || note.talkingPoints.trim() || note.qaPrep.trim());
}

function storageKey(resumeId: string): string {
  return `${KEY_PREFIX}${resumeId}`;
}

function sanitizeText(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_FIELD_LEN) : '';
}

function readMap(resumeId: string): ResumeNotesMap {
  if (!resumeId) return {};
  try {
    const raw = localStorage.getItem(storageKey(resumeId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: ResumeNotesMap = {};
    for (const [entryKey, item] of Object.entries(parsed as Record<string, unknown>)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const rec = item as Record<string, unknown>;
      result[entryKey] = {
        contribution: sanitizeText(rec.contribution),
        talkingPoints: sanitizeText(rec.talkingPoints),
        qaPrep: sanitizeText(rec.qaPrep),
        updatedAt: typeof rec.updatedAt === 'string' ? rec.updatedAt : '',
      };
    }
    return result;
  } catch {
    return {};
  }
}

function writeMap(resumeId: string, map: ResumeNotesMap): void {
  if (!resumeId) return;
  try {
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(storageKey(resumeId));
      return;
    }
    localStorage.setItem(storageKey(resumeId), JSON.stringify(map));
  } catch {
    // 浏览器隐私模式或配额不足时静默降级，不影响简历正文保存。
  }
}

export function loadInterviewNote(resumeId: string, entryKey: string): InterviewEntryNote {
  const map = readMap(resumeId);
  return map[entryKey] ? { ...map[entryKey]! } : createEmptyInterviewNote();
}

export function saveInterviewNote(
  resumeId: string,
  entryKey: string,
  note: Pick<InterviewEntryNote, 'contribution' | 'talkingPoints' | 'qaPrep'>,
): InterviewEntryNote {
  const map = readMap(resumeId);
  const cleaned: InterviewEntryNote = {
    contribution: sanitizeText(note.contribution),
    talkingPoints: sanitizeText(note.talkingPoints),
    qaPrep: sanitizeText(note.qaPrep),
    updatedAt: new Date().toISOString(),
  };
  if (!hasInterviewNoteContent(cleaned)) {
    delete map[entryKey];
    writeMap(resumeId, map);
    return createEmptyInterviewNote();
  }
  map[entryKey] = cleaned;
  writeMap(resumeId, map);
  return cleaned;
}

export function clearResumeInterviewNotes(resumeId: string): void {
  if (!resumeId) return;
  try {
    localStorage.removeItem(storageKey(resumeId));
  } catch {
    // ignore
  }
}
