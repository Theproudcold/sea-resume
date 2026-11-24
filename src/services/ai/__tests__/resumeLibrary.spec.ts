import { describe, expect, it, vi } from 'vitest';
import { createDefaultResumeData } from '@/utils/resumeData';
import { clearExternalTasks, enqueueExternalTask } from '../externalTaskQueue';
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
    expect(created.trackId).toBe(created.id);
    expect(created.versionNumber).toBe(1);
    expect(created.jobTarget).toBeUndefined();
    expect(created.templateId).toBe('ai-agent');
    expect(created.theme.color).toMatch(/^#/);
    expect(created.basic.website).toBeUndefined();
    expect(created.experiences[0]?.id).toBeTruthy();
    expect(created.experiences[0]?.description).not.toContain('<script>');
    expect(await library.open(created.id)).toEqual({ id: created.id, opened: true });
    expect(opened).toHaveBeenCalledWith(created.id);
    await expect(library.open('missing-id')).rejects.toThrow('没有这份简历');
  });

  it('supports keyless MCP workflows: derive job version, quality check, JD risk scan, task queue and saving external interviews', async () => {
    clearExternalTasks();
    const { backend, store, first } = catalog();
    const savedInterviews: unknown[] = [];
    const library = createResumeLibrary({
      ...backend,
      interviews: {
        list: async () => [],
        get: async () => null,
        save: async (session) => { savedInterviews.push(session); },
        remove: async () => undefined,
        start: async () => null,
      },
    });
    const derived = await library.deriveVersion({ sourceResumeId: first.id, company: '字节', position: '前端架构师' });
    expect(derived.id).not.toBe(first.id);
    expect(derived.trackId).toBe(first.id);
    expect(derived.jobTarget?.company).toBe('字节');
    expect(derived.jobTarget?.position).toBe('前端架构师');
    expect(store.has(derived.id)).toBe(true);

    const quality = await library.checkQuality(first.id);
    expect(quality.issueCount).toBeGreaterThan(0);

    const scan = library.scanJdRisks('本岗位为劳务派遣，要求抗压能力强。');
    expect(scan.count).toBeGreaterThan(0);

    const { task } = enqueueExternalTask({ kind: 'greeting', resumeId: first.id, summary: '打招呼语', payload: { jd: '前端' } });
    expect(library.listTasks('pending').map(item => item.id)).toContain(task.id);
    const done = library.completeTask(task.id, { summary: '完成', greetings: ['您好，看到贵司岗位...'] });
    expect(done.status).toBe('completed');
    expect(done.result?.greetings).toEqual(['您好，看到贵司岗位...']);

    const saved = await library.saveInterview({
      resumeId: first.id,
      targetRole: '前端架构师',
      summary: '整体表现稳定，项目指标清晰。',
      priorities: ['补充缓存失效策略细节'],
      facts: ['主导将首屏加载从 3.2s 降到 1.1s'],
      turns: [{ question: '讲一下性能优化', answer: '通过分包和预加载降到 1.1s' }],
    });
    expect(saved.provider.baseUrl).toBe('mcp://external-agent');
    expect(saved.status).toBe('completed');
    expect(saved.report?.facts[0]?.text).toContain('3.2s');
    expect(savedInterviews).toHaveLength(1);
    await expect(library.startInterview(first.id, {})).rejects.toThrow('sea_interview_save');
    clearExternalTasks();
  });
});
