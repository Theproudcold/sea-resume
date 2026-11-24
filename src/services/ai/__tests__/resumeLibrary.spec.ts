import { describe, expect, it, vi } from 'vitest';
import { createDefaultResumeData } from '@/utils/resumeData';
import { assertNoActiveInterview, createResumeLibrary, type ResumeCatalog } from '../resumeLibrary';

function catalog() {
  const first = createDefaultResumeData();
  first.id = 'resume-1';
  first.title = '第一份';
  first.basic.email = 'a@example.com';
  const store = new Map([[first.id, first]]);
  const discardOpen = vi.fn(async () => undefined);
  const backend: ResumeCatalog = {
    list: async () => [...store.values()].map(item => ({ id: item.id, title: item.title, templateId: item.templateId, createdAt: 1, updatedAt: 2 })),
    read: async (id) => store.get(id) ?? null,
    save: async (resume) => { store.set(resume.id, resume); },
    remove: async (id) => { store.delete(id); },
    discardOpen,
  };
  return { library: createResumeLibrary(backend), backend, store, discardOpen, first };
}

describe('resume library MCP', () => {
  it('lists, updates, creates and deletes separate resumes', async () => {
    const { library, backend, store, discardOpen, first } = catalog();
    expect(await library.list()).toEqual([{ id: 'resume-1', title: '第一份', templateId: 'modern', updatedAt: 2 }]);
    const changed = await library.set({ ...first, title: '改过的第一份', basic: { ...first.basic, email: 'b@example.com' } });
    expect(changed.id).toBe('resume-1');
    expect(store.get('resume-1')?.title).toBe('改过的第一份');
    await expect(library.set({ id: first.id, basic: {} })).rejects.toThrow('完整');
    const created = await library.create({ ...first, title: '第二份' });
    expect(created.id).not.toBe('resume-1');
    expect(store.size).toBe(2);
    await library.remove('resume-1');
    expect(discardOpen).toHaveBeenCalledWith('resume-1');
    expect(store.has('resume-1')).toBe(false);
    expect(store.has(created.id)).toBe(true);
    await expect(library.remove('resume-1')).rejects.toThrow('没有这份简历');
    const exported = vi.fn(async () => undefined);
    const withExports = createResumeLibrary({ ...backend, exportPdf: exported, interviews: {
      list: async () => [{ id: 'interview-1', sourceResumeId: first.id, status: 'completed', settings: { targetRole: '前端', jd: '', level: '', direction: '综合', mode: 'training', mainQuestionLimit: 8 }, createdAt: '', updatedAt: '', context: {} as never, provider: { baseUrl: '', model: '' }, pendingStage: null, coveragePlan: [], turns: [], usage: { calls: 0, promptTokens: 0, completionTokens: 0 }, persistence: true, jsonMode: true, ending: true }],
      get: async (id) => id === 'interview-1' ? { id, settings: { targetRole: '前端', jd: '', level: '', direction: '综合', mode: 'training', mainQuestionLimit: 8 }, turns: [] } as never : null,
      remove: async () => undefined,
      start: async () => ({ id: 'started' }) as never,
    } });
    await withExports.exportPdf(created.id);
    expect(exported).toHaveBeenCalledOnce();
    expect((await withExports.listInterviews())[0]?.id).toBe('interview-1');
    expect((await withExports.getInterview('interview-1')).markdown).toContain('文字模拟面试');
    await expect(withExports.startInterview(created.id, { targetRole: '前端' })).resolves.toMatchObject({ id: 'started' });
    expect(() => assertNoActiveInterview(true)).toThrow('已有面试');
    expect(() => assertNoActiveInterview(false)).not.toThrow();
  });

  it('creates a resume from partial fields for empty-library and knowledge-base workflows, and opens it for preview', async () => {
    const opened = vi.fn(async () => undefined);
    const store = new Map<string, ReturnType<typeof createDefaultResumeData>>();
    const library = createResumeLibrary({
      list: async () => [],
      read: async (id) => store.get(id) ?? null,
      save: async (resume) => { store.set(resume.id, resume); },
      remove: async (id) => { store.delete(id); },
      open: opened,
    });
    const created = await library.create({
      title: '精准岗位简历',
      templateId: 'ai-agent',
      basic: { name: '张三', title: '前端工程师', website: 'javascript:alert(1)' },
      experiences: [
        { company: 'Acme', position: '高级前端', startDate: '2023.01', endDate: '至今', description: '<p>核心贡献</p><script>alert(1)</script>' },
      ],
    });
    expect(created.title).toBe('精准岗位简历');
    expect(created.templateId).toBe('ai-agent');
    expect(created.theme.color).toMatch(/^#/);
    expect(created.basic.website).toBeUndefined();
    expect(created.experiences[0]?.id).toBeTruthy();
    expect(created.experiences[0]?.description).not.toContain('<script>');
    expect(await library.open(created.id)).toEqual({ id: created.id, opened: true });
    expect(opened).toHaveBeenCalledWith(created.id);
    await expect(library.open('missing-id')).rejects.toThrow('没有这份简历');
  });
});
