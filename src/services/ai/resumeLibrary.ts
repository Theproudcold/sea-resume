import type { InterviewSession, InterviewSettings } from '@/types/interview';
import type { ResumeData, ResumeMeta } from '@/types/resume';
import { generateId } from '@/utils/helpers';
import { exportInterviewMarkdown } from './interview';
import { parseExternalResume } from './externalResume';

export interface ResumeSummary {
  id: string;
  title: string;
  templateId: string;
  updatedAt: number;
}

export interface ResumeCatalog {
  list: () => Promise<ResumeMeta[]>;
  read: (id: string) => Promise<ResumeData | null>;
  save: (resume: ResumeData) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** The resume open in the editor must not be saved again after deletion. */
  discardOpen?: (id: string) => Promise<void>;
  /** Navigate the browser into the visual editor for live preview of this resume. */
  open?: (id: string) => Promise<void>;
  exportPdf?: (resume: ResumeData) => Promise<void>;
  interviews?: {
    list: () => Promise<InterviewSession[]>;
    get: (id: string) => Promise<InterviewSession | null>;
    remove: (id: string) => Promise<void>;
    start: (resume: ResumeData, settings: InterviewSettings) => Promise<InterviewSession | null>;
  };
}

const DIRECTIONS = ['综合', '项目深挖', '岗位专业', '行为面试'] as const;
const LIMITS = [5, 8, 12] as const;

/** A page that is already showing an interview must not be replaced by an external start. */
export function assertNoActiveInterview(active: boolean): void {
  if (active) throw new Error('页面上已有面试，请先结束后再从外部 AI 开始新的一轮。');
}

function interviewSettings(input: unknown): InterviewSettings {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const direction = DIRECTIONS.includes(value.direction as typeof DIRECTIONS[number]) ? value.direction as InterviewSettings['direction'] : '综合';
  const mode = value.mode === 'real' ? 'real' : 'training';
  const limit = LIMITS.includes(value.mainQuestionLimit as typeof LIMITS[number]) ? value.mainQuestionLimit as InterviewSettings['mainQuestionLimit'] : 8;
  return {
    targetRole: typeof value.targetRole === 'string' ? value.targetRole.slice(0, 200) : '',
    jd: typeof value.jd === 'string' ? value.jd.slice(0, 15000) : '',
    level: typeof value.level === 'string' ? value.level.slice(0, 200) : '',
    direction,
    mode,
    mainQuestionLimit: limit,
  };
}

function objectId(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请提交完整简历对象。');
  const id = (input as { id?: unknown }).id;
  if (typeof id !== 'string' || !id.trim()) throw new Error('请带上要修改的简历 id。');
  return id;
}

export function createResumeLibrary(catalog: ResumeCatalog) {
  return {
    async list(): Promise<ResumeSummary[]> {
      const items = await catalog.list();
      return items.map(({ id, title, templateId, updatedAt }) => ({ id, title, templateId, updatedAt }));
    },
    async get(id: string): Promise<ResumeData> {
      const resume = await catalog.read(id);
      if (!resume) throw new Error('没有这份简历。');
      return resume;
    },
    async set(input: unknown): Promise<ResumeData> {
      const current = await catalog.read(objectId(input));
      if (!current) throw new Error('没有这份简历。请先列出简历，或用新建。');
      const next = parseExternalResume(input, current);
      await catalog.save(next);
      return next;
    },
    async create(input: unknown): Promise<ResumeData> {
      const next = parseExternalResume(input);
      const now = new Date().toISOString();
      next.id = generateId();
      next.createdAt = now;
      next.updatedAt = now;
      await catalog.save(next);
      return next;
    },
    async remove(id: string): Promise<{ id: string; deleted: true }> {
      if (!await catalog.read(id)) throw new Error('没有这份简历。');
      await catalog.discardOpen?.(id);
      await catalog.remove(id);
      return { id, deleted: true };
    },
    async open(id: string): Promise<{ id: string; opened: true }> {
      if (!await catalog.read(id)) throw new Error('没有这份简历。');
      if (!catalog.open) throw new Error('当前页面不能打开编辑器预览。');
      await catalog.open(id);
      return { id, opened: true };
    },
    async exportPdf(id: string): Promise<{ id: string; downloaded: true }> {
      const resume = await catalog.read(id);
      if (!resume) throw new Error('没有这份简历。');
      if (!catalog.exportPdf) throw new Error('当前页面不能导出 PDF。');
      await catalog.exportPdf(resume);
      return { id, downloaded: true };
    },
    async listInterviews() {
      if (!catalog.interviews) return [];
      return (await catalog.interviews.list()).map(item => ({
        id: item.id,
        sourceResumeId: item.sourceResumeId,
        status: item.status,
        targetRole: item.settings.targetRole,
        updatedAt: item.updatedAt,
      }));
    },
    async getInterview(id: string) {
      const session = await catalog.interviews?.get(id);
      if (!session) throw new Error('没有这份面试记录。');
      return { session, markdown: exportInterviewMarkdown(session) };
    },
    async deleteInterview(id: string) {
      const interviews = catalog.interviews;
      if (!interviews || !await interviews.get(id)) throw new Error('没有这份面试记录。');
      await interviews.remove(id);
      return { id, deleted: true as const };
    },
    async startInterview(resumeId: string, settings: unknown) {
      const resume = await catalog.read(resumeId);
      if (!resume || !catalog.interviews) throw new Error('没有这份简历，或当前页面不能开始面试。');
      const session = await catalog.interviews.start(resume, interviewSettings(settings));
      if (!session) throw new Error('请先在设置里配置可用的 AI 模型。');
      return session;
    },
  };
}

export type ResumeLibrary = ReturnType<typeof createResumeLibrary>;
