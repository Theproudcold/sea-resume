import type { InterviewObservation, InterviewSession, InterviewSettings, InterviewTurn } from '@/types/interview';
import type { ResumeData, ResumeMeta } from '@/types/resume';
import { generateId } from '@/utils/helpers';
import { scanJdRisks, type JdRiskScan } from '@/utils/jdRiskLexicon';
import { checkResumeQuality, type ResumeQualityIssue } from '@/utils/resumeQuality';
import { createJobResumeVersion } from '@/utils/resumeVersions';
import { exportInterviewMarkdown } from './interview';
import { buildResumeContext } from './resumeContext';
import { parseExternalResume } from './externalResume';
import { completeExternalTask, listExternalTasks, type ExternalTask, type ExternalTaskStatus } from './externalTaskQueue';

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
    save?: (session: InterviewSession) => Promise<void>;
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
      // 新建简历自成一条干净主干轨道，避免沿用归一化阶段生成的临时 id 或被外部伪造分支指向。
      next.trackId = next.id;
      next.versionNumber = 1;
      delete next.jobTarget;
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
    async deriveVersion(input: unknown): Promise<ResumeData> {
      const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
      const sourceId = typeof value.sourceResumeId === 'string' ? value.sourceResumeId.trim() : '';
      if (!sourceId) throw new Error('请提供来源简历 sourceResumeId。');
      const source = await catalog.read(sourceId);
      if (!source) throw new Error('没有这份来源简历。');
      const derived = createJobResumeVersion(source, {
        versionName: typeof value.versionName === 'string' ? value.versionName.slice(0, 100) : '',
        company: typeof value.company === 'string' ? value.company.slice(0, 120) : '',
        position: typeof value.position === 'string' ? value.position.slice(0, 120) : '',
      });
      await catalog.save(derived);
      return derived;
    },
    async checkQuality(id: string): Promise<{ id: string; issueCount: number; issues: ResumeQualityIssue[] }> {
      const resume = await catalog.read(id);
      if (!resume) throw new Error('没有这份简历。');
      const issues = checkResumeQuality(resume);
      return { id, issueCount: issues.length, issues };
    },
    scanJdRisks(jd: string): JdRiskScan {
      return scanJdRisks(jd);
    },
    listTasks(status?: string): ExternalTask[] {
      const normalized: ExternalTaskStatus | 'all' = status === 'completed' || status === 'cancelled' || status === 'all' ? status : 'pending';
      return listExternalTasks(normalized);
    },
    completeTask(id: string, result: unknown): ExternalTask {
      return completeExternalTask(id, result);
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
    async saveInterview(input: unknown): Promise<InterviewSession> {
      if (!catalog.interviews?.save) throw new Error('当前页面不能保存面试记录。');
      const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
      const resumeId = typeof value.resumeId === 'string' ? value.resumeId.trim() : '';
      const resume = resumeId ? await catalog.read(resumeId) : null;
      if (!resume) throw new Error('没有这份简历。');
      const now = new Date().toISOString();
      const settings = interviewSettings(value);
      const cleanStrings = (items: unknown, limit: number, maxLen: number) => Array.isArray(items)
        ? items.filter((item): item is string => typeof item === 'string' && !!item.trim()).map(item => item.trim().slice(0, maxLen)).slice(0, limit)
        : [];
      const observations: InterviewObservation[] = Array.isArray(value.observations)
        ? value.observations.slice(0, 30).flatMap((entry): InterviewObservation[] => {
          if (!entry || typeof entry !== 'object') return [];
          const row = entry as Record<string, unknown>;
          const text = typeof row.text === 'string' ? row.text.trim().slice(0, 600) : '';
          if (!text) return [];
          const category = row.category === 'strength' || row.category === 'knowledge' ? row.category : 'expression';
          return [{ category, text, verification: 'needs-verification', evidence: [] }];
        })
        : [];
      const turns: InterviewTurn[] = Array.isArray(value.turns)
        ? value.turns.slice(0, 30).flatMap((entry, index): InterviewTurn[] => {
          if (!entry || typeof entry !== 'object') return [];
          const row = entry as Record<string, unknown>;
          const questionText = typeof row.question === 'string' ? row.question.trim().slice(0, 1000) : '';
          if (!questionText) return [];
          const answer = typeof row.answer === 'string' ? row.answer.trim().slice(0, 4000) : '';
          return [{
            id: `turn-${index + 1}`,
            mainNumber: index + 1,
            followup: false,
            question: { text: questionText, focus: settings.targetRole || settings.direction, kind: 'experience', itemIds: [] },
            ...(answer ? { answer, submittedAt: now } : { skipped: true }),
          }];
        })
        : [];
      const facts = cleanStrings(value.facts, 20, 500).map((text, index) => ({ id: `fact-${index + 1}`, answerId: turns[0]?.id ?? 'external', text }));
      const session: InterviewSession = {
        id: `interview-mcp-${generateId()}`,
        sourceResumeId: resume.id,
        createdAt: now,
        updatedAt: now,
        context: buildResumeContext(resume, { generalizeOrganizations: false }),
        settings,
        provider: { baseUrl: 'mcp://external-agent', model: 'external-agent' },
        status: 'completed',
        pendingStage: null,
        coveragePlan: cleanStrings(value.coveragePlan, 12, 200),
        turns,
        report: {
          incomplete: false,
          observations,
          followupReview: [],
          priorities: cleanStrings(value.priorities, 10, 400),
          facts,
          referencePhrasing: typeof value.summary === 'string' ? value.summary.trim().slice(0, 3000) : '',
          knowledgeExplanation: '',
        },
        usage: { calls: 0, promptTokens: 0, completionTokens: 0 },
        persistence: true,
        jsonMode: false,
        ending: true,
      };
      await catalog.interviews.save(session);
      return session;
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
      if (!session) throw new Error('网页未配置直连 AI 模型。若希望通过外部 Agent 免 API Key 模拟面试，请直接由 Agent 主持面试并调用 sea_interview_save 保存复盘记录。');
      return session;
    },
  };
}

export type ResumeLibrary = ReturnType<typeof createResumeLibrary>;
