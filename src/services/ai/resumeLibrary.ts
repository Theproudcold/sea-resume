import type { ResumeData, ResumeMeta } from '@/types/resume';
import { generateId } from '@/utils/helpers';
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
  };
}

export type ResumeLibrary = ReturnType<typeof createResumeLibrary>;
