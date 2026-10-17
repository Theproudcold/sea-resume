import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { ElButton, ElIcon, ElMessageBox, ElOption, ElSelect } from 'element-plus';
import InterviewHistory from '@/views/InterviewHistory.vue';
import { useInterviewStore } from '@/stores/interview';
import { useAiWorkspaceStore } from '@/stores/aiWorkspace';
import { useWorkbenchStore } from '@/stores/workbench';
import { useStorageStore } from '@/stores/storage';
import { storageManager } from '@/services/storage/StorageManager';
import { aiWorkspaceRepository } from '@/services/ai/AiWorkspaceRepository';
import { downloadInterview } from '@/services/ai/interview';
import { buildResumeContext } from '@/services/ai/resumeContext';
import { createOptimizationRun } from '@/services/ai/resumeOptimization';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import type { InterviewSession } from '@/types/interview';

const { push, confirm } = vi.hoisted(() => ({ push: vi.fn(), confirm: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('element-plus', async importOriginal => ({ ...await importOriginal<typeof import('element-plus')>(), ElMessageBox: { confirm } }));
vi.mock('@/services/ai/AiWorkspaceRepository', () => ({ aiWorkspaceRepository: { list: vi.fn(), delete: vi.fn(), clear: vi.fn(), save: vi.fn() } }));
vi.mock('@/services/ai/interview', async importOriginal => ({ ...await importOriginal<typeof import('@/services/ai/interview')>(), downloadInterview: vi.fn() }));

function fixture() {
  const resume = parseResumeMarkdown('# 测试简历').resume;
  resume.id = 'resume-1';
  const session: InterviewSession = {
    id: 'interview-1', sourceResumeId: resume.id, createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-02T11:30:00Z',
    context: buildResumeContext(resume), settings: { targetRole: '前端工程师', jd: '', level: '中级', direction: '综合', mode: 'training', mainQuestionLimit: 5 },
    provider: { baseUrl: 'https://test.invalid/v1', model: 'test' }, status: 'paused', pendingStage: null, coveragePlan: [], turns: [],
    usage: { calls: 0, promptTokens: 0, completionTokens: 0 }, persistence: true, jsonMode: true, ending: false,
  };
  const optimization = createOptimizationRun(resume, { target: '', company: '', jd: '', style: 'concise', personalSample: '', generalizeOrganizations: true }, { baseUrl: 'https://test.invalid/v1', model: 'test', apiKey: 'not-saved' });
  optimization.id = 'optimization-1';
  return { session, resume, optimization };
}
let wrapper: VueWrapper;
let sessions: InterviewSession[];
let optimizations: Array<{ id: string; sourceResumeId?: string; updatedAt?: string; stage?: string }>;
async function render() {
  wrapper = mount(InterviewHistory, {
    attachTo: document.body,
    global: { components: { ElButton, ElIcon, ElSelect, ElOption }, stubs: { AppHeader: { props: ['title'], template: '<header><h1>{{ title }}</h1><slot name="actions" /></header>' } } },
  });
  await flushPromises();
  return wrapper;
}
function button(text: string) { return wrapper.findAll('button').find(item => item.text() === text)!; }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  vi.restoreAllMocks(); vi.resetAllMocks(); localStorage.clear(); setActivePinia(createPinia());
  sessions = []; optimizations = [];
  vi.spyOn(storageManager, 'init').mockResolvedValue();
  vi.spyOn(storageManager, 'list').mockResolvedValue([{ id: 'resume-1', title: '我的前端简历', templateId: 'modern', createdAt: 1, updatedAt: 1 }]);
  vi.mocked(aiWorkspaceRepository.list).mockImplementation(async kind => kind === 'interview' ? sessions : optimizations);
  vi.mocked(aiWorkspaceRepository.delete).mockImplementation(async (kind, id) => { if (kind === 'interview') sessions = sessions.filter(item => item.id !== id); else optimizations = optimizations.filter(item => item.id !== id); });
  vi.mocked(aiWorkspaceRepository.clear).mockImplementation(async () => { sessions = []; optimizations = []; });
  vi.mocked(aiWorkspaceRepository.save).mockResolvedValue();
  confirm.mockResolvedValue('confirm');
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('InterviewHistory', () => {
  it('initializes storage/workbench and presents a useful empty state with safe disabled clear', async () => {
    const init = vi.spyOn(useStorageStore(), 'init'); const workbenchInit = vi.spyOn(useWorkbenchStore(), 'init');
    await render();
    expect(init).toHaveBeenCalledOnce(); expect(workbenchInit).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('还没有已保存的面试');
    expect(wrapper.get('[role="combobox"]').attributes('aria-label')).toBe('选择一份简历');
    expect(button('清空全部 AI 记录').attributes('disabled')).toBeDefined();
    expect(wrapper.find('header').text()).not.toContain('清空');
    await button('设置并开始文字面试').trigger('click');
    expect(push).toHaveBeenCalledWith('/interview/new?resumeId=resume-1');
    await wrapper.get('.category-bar button:nth-child(2)').trigger('click');
    expect(wrapper.text()).toContain('还没有已保存的简历优化');
    expect(wrapper.get('.category-bar button:nth-child(2)').attributes('aria-pressed')).toBe('true');
    expect(ElMessageBox.confirm).not.toHaveBeenCalled();
  });

  it('offers a real create-resume route when there are no resumes', async () => {
    vi.mocked(storageManager.list).mockResolvedValue([]);
    await render();
    expect(wrapper.text()).toContain('先准备一份简历'); expect(wrapper.find('[role="combobox"]').exists()).toBe(false);
    await button('创建第一份简历').trigger('click'); expect(push).toHaveBeenCalledWith('/templates');
  });

  it('renders human-readable modes/status/time, report/continue hierarchy and both exports', async () => {
    const { session } = fixture();
    sessions = [session, { ...session, id: 'report-1', settings: { ...session.settings, mode: 'real' }, report: { incomplete: true, observations: [], followupReview: [], priorities: [], facts: [], referencePhrasing: '', knowledgeExplanation: '' } }];
    optimizations = [{ id: 'optimization-1', sourceResumeId: 'resume-1', stage: 'ready', updatedAt: session.updatedAt }];
    await render();
    expect(wrapper.text()).toContain('已暂停'); expect(wrapper.text()).toContain('训练模式'); expect(wrapper.text()).toContain('真实模拟');
    expect(wrapper.text()).toContain('不完整报告'); expect(wrapper.text()).not.toContain('2026-03-02T');
    expect(wrapper.text()).toContain('2026/03/02'); expect(wrapper.text()).toContain('我的前端简历');
    await button('继续面试').trigger('click'); expect(push).toHaveBeenLastCalledWith('/interview/interview-1');
    await button('查看报告').trigger('click'); expect(push).toHaveBeenLastCalledWith('/interview/report-1');
    await button('JSON').trigger('click'); await flushPromises();
    expect(downloadInterview).toHaveBeenLastCalledWith(session, 'json');
    await button('Markdown').trigger('click'); await flushPromises();
    expect(downloadInterview).toHaveBeenLastCalledWith(session, 'markdown');
    await wrapper.get('.category-bar button:nth-child(2)').trigger('click'); expect(wrapper.text()).toContain('待确认建议');
  });

  it('shows an unsaved in-memory interview with recovery/export and permits clearing it', async () => {
    const store = useInterviewStore(); store.session = { ...fixture().session, persistence: false };
    await render();
    expect(wrapper.text()).toContain('当前内存会话（尚未保存）'); expect(wrapper.text()).toContain('仅本次会话');
    expect(button('清空全部 AI 记录').attributes('disabled')).toBeUndefined();
    await button('回到会话 / 导出').trigger('click'); expect(push).toHaveBeenCalledWith('/interview/interview-1');
  });

  it.each(['cancel', 'close'])('treats delete %s as normal cancellation without storage writes or errors', async reason => {
    sessions = [fixture().session]; confirm.mockRejectedValue(reason);
    await render(); await button('删除').trigger('click'); await flushPromises();
    expect(aiWorkspaceRepository.delete).not.toHaveBeenCalled(); expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findAll('.record-card')).toHaveLength(1);
  });

  it('deletes only the confirmed interview after draining its active checkpoint, then resets', async () => {
    const { session } = fixture(); sessions = [session]; const store = useInterviewStore(); store.session = session;
    const pending = deferred(); vi.mocked(aiWorkspaceRepository.save).mockReturnValue(pending.promise);
    await render(); await button('删除').trigger('click'); await flushPromises();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('全部回答和报告'), '删除这条面试记录？', expect.objectContaining({ confirmButtonText: '删除面试记录', confirmButtonClass: 'el-button--danger' }));
    expect(store.session).not.toBeNull(); expect(aiWorkspaceRepository.delete).not.toHaveBeenCalled();
    pending.resolve(); await flushPromises();
    expect(store.session).toBeNull(); expect(aiWorkspaceRepository.delete).toHaveBeenCalledWith('interview', session.id);
    expect(wrapper.text()).toContain('记录已删除'); expect(aiWorkspaceRepository.clear).not.toHaveBeenCalled();
  });

  it('deletes an active optimization only after persisting and disables its persistence', async () => {
    const { optimization } = fixture(); optimizations = [optimization]; const store = useAiWorkspaceStore(); store.run = optimization; store.saveLocally = true;
    const pending = deferred(); vi.mocked(aiWorkspaceRepository.save).mockReturnValue(pending.promise);
    await render(); await wrapper.get('.category-bar button:nth-child(2)').trigger('click'); await button('删除优化记录').trigger('click'); await flushPromises();
    expect(aiWorkspaceRepository.delete).not.toHaveBeenCalled(); expect(store.run).not.toBeNull();
    pending.resolve(); await flushPromises();
    expect(aiWorkspaceRepository.delete).toHaveBeenCalledWith('optimization', optimization.id); expect(store.run).toBeNull(); expect(store.saveLocally).toBe(false);
  });

  it('warns with the exact all-AI scope, allows cancellation, and does not clear on cancel', async () => {
    sessions = [fixture().session]; confirm.mockRejectedValue('cancel');
    await render(); await button('清空全部 AI 记录').trigger('click'); await flushPromises();
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/所有面试回答 \/ 报告及简历优化记录.*内存 AI 会话.*不删除简历或 API 服务配置/), '清空全部 AI 记录？', expect.objectContaining({ confirmButtonText: '清空全部 AI 记录', cancelButtonText: '取消' }));
    expect(aiWorkspaceRepository.clear).not.toHaveBeenCalled(); expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('drains both outstanding write queues before clearing and resets both memory stores', async () => {
    const { session, optimization } = fixture();
    const interview = useInterviewStore(); const ai = useAiWorkspaceStore();
    interview.session = session; ai.run = optimization; ai.saveLocally = true;
    const pending = deferred(); vi.mocked(aiWorkspaceRepository.save).mockReturnValue(pending.promise);
    // Queue existing writes before clicking clear, not only the clear operation's snapshots.
    const interviewWrite = interview.checkpoint(); const optimizationWrite = ai.persist();
    await render();
    expect(wrapper.text()).toContain('当前还有一条未保存到列表的简历优化会话');
    await button('清空全部 AI 记录').trigger('click'); await flushPromises();
    expect(aiWorkspaceRepository.clear).not.toHaveBeenCalled(); expect(interview.session).not.toBeNull(); expect(ai.run).not.toBeNull();
    expect(button('清空全部 AI 记录').attributes('disabled')).toBeDefined();
    pending.resolve(); await Promise.all([interviewWrite, optimizationWrite]); await flushPromises();
    expect(aiWorkspaceRepository.clear).toHaveBeenCalledOnce();
    expect(interview.session).toBeNull(); expect(ai.run).toBeNull(); expect(ai.saveLocally).toBe(false);
    expect(button('清空全部 AI 记录').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('全部 AI 记录已清空');
    const writesAtClear = vi.mocked(aiWorkspaceRepository.save).mock.invocationCallOrder;
    expect(Math.max(...writesAtClear)).toBeLessThan(vi.mocked(aiWorkspaceRepository.clear).mock.invocationCallOrder[0]!);
  });

  it('shows loading/errors and permits retry without falsely presenting an empty result', async () => {
    const pending = deferred(); vi.mocked(aiWorkspaceRepository.list).mockImplementationOnce(async () => { await pending.promise; throw new Error('本机读取失败'); });
    const rendering = render(); await flushPromises();
    expect(wrapper.text()).toContain('正在读取'); expect(wrapper.text()).not.toContain('还没有已保存的面试');
    pending.resolve(); await rendering; await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('本机读取失败');
    await button('重新读取').trigger('click'); await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false); expect(wrapper.text()).toContain('还没有已保存的面试');
  });
});
