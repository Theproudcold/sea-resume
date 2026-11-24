import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { ElMessageBox } from 'element-plus';
import InterviewConsent from '../InterviewConsent.vue';
import InterviewConversation from '../InterviewConversation.vue';
import InterviewReport from '../InterviewReport.vue';
import InterviewHistory from '@/views/InterviewHistory.vue';
import { buildResumeContext } from '@/services/ai/resumeContext';
import { clearAiSessionApiKey, hasAiStoredApiKey, saveAiModelSettings, setAiSessionApiKey } from '@/services/ai/AiSettings';
import { useMcpState } from '@/services/ai/useMcpBridge';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { storageManager } from '@/services/storage/StorageManager';
import { aiWorkspaceRepository } from '@/services/ai/AiWorkspaceRepository';
import type { InterviewSession } from '@/types/interview';
import { useAiWorkspaceStore } from '@/stores/aiWorkspace';
import { createOptimizationRun } from '@/services/ai/resumeOptimization';
vi.mock('@/services/ai/AiWorkspaceRepository', () => ({ aiWorkspaceRepository: { save: vi.fn(), get: vi.fn(), list: vi.fn(), delete: vi.fn(), clear: vi.fn() } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/ai/ResumeOptimizationPanel.vue', () => ({ default: defineComponent({ name: 'ResumeOptimizationPanel', props: ['resume', 'initialFacts'], template: '<div data-testid="optimizer">Review optimizer</div>' }) }));
const Button = defineComponent({ props: ['disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' });
const options = { global: { stubs: { ElIcon: true, ElButton: Button, ElSelect: { props: ['modelValue'], template: '<div role="combobox"><slot /></div>' }, ElOption: { props: ['label'], template: '<span>{{ label }}</span>' }, AppHeader: { template: '<header><slot name="actions" /></header>' } } } };
function fixture() {
  const resume = parseResumeMarkdown('# Candidate').resume;
  resume.id = 'resume-1'; resume.projects = [{ id: 'p1', name: 'Latest project', role: '开发', startDate: '', endDate: '', description: '最新内容' }];
  const session: InterviewSession = { id: 'session-1', sourceResumeId: resume.id, createdAt: 'now', updatedAt: 'now', context: buildResumeContext(resume), settings: { targetRole: '工程师', jd: '', direction: '综合', level: '初级', mode: 'training', mainQuestionLimit: 5 }, provider: { baseUrl: 'https://test/v1', model: 'test' }, status: 'completed', pendingStage: null, coveragePlan: [], turns: [{ id: 'a1', mainNumber: 1, followup: false, question: { text: '请说明贡献', focus: '职责', kind: 'experience', itemIds: ['p1'] }, answer: '我实现缓存', submittedAt: 'now', feedback: { observations: [], referencePhrasing: '我实现缓存', organizationHint: 'COACH_HINT', knowledgeExplanation: 'GENERAL_KNOWLEDGE' } }], report: { incomplete: true, observations: [], followupReview: [], priorities: ['一', '二', '三'], facts: [{ id: 'fact1', answerId: 'a1', text: '我实现缓存' }], referencePhrasing: '我实现缓存', knowledgeExplanation: '知识并非经历' }, usage: { calls: 1, promptTokens: 0, completionTokens: 0 }, persistence: true, jsonMode: true, ending: true };
  return { resume, session };
}
beforeEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); localStorage.clear(); clearAiSessionApiKey(); setActivePinia(createPinia()); vi.spyOn(ElMessageBox, 'confirm').mockImplementation(vi.fn().mockResolvedValue('confirm')); });
/** Buttons are addressed by their label: the report gained a practice action and index order is not a contract. */
const byText = (wrapper: VueWrapper, text: string) => wrapper.findAll('button').find(button => button.text() === text)!;
describe('interview UI safety and handoff', () => {
  it('shows the saved service, requires consent and a key, previews data, and resets consent on key change', async () => {
    saveAiModelSettings({ presetId: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', profileName: 'DeepSeek' });
    const wrapper = mount(InterviewConsent, { ...options, props: { preview: { context: 'public summary' } } });
    expect(wrapper.text()).toContain('DeepSeek'); expect(wrapper.text()).toContain('deepseek-chat');
    expect(byText(wrapper, '确认服务与发送范围').attributes('disabled')).toBeDefined();
    await wrapper.find('input[type="password"]').setValue('session-secret');
    await wrapper.find('[data-testid="interview-consent"]').setValue(true);
    await byText(wrapper, '确认服务与发送范围').trigger('click');
    expect(wrapper.emitted('confirmed')?.[0]?.[0]).toMatchObject({ apiKey: 'session-secret', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' });
    expect(wrapper.find('pre').text()).toContain('public summary'); expect(wrapper.find('pre').text()).not.toContain('session-secret');
    await byText(wrapper, '更换密钥').trigger('click');
    await wrapper.find('input[type="password"]').setValue('changed-key');
    expect((wrapper.find('[data-testid="interview-consent"]').element as HTMLInputElement).checked).toBe(false);
    expect(byText(wrapper, '确认服务与发送范围').attributes('disabled')).toBeDefined(); expect(wrapper.emitted('changed')).toBeTruthy();
    expect(localStorage.getItem('sea-resume_ai-provider-keys')).toBeNull();
    wrapper.unmount();
  });
  it('revokes parent permission immediately when confirmed consent is unchecked', async () => {
    saveAiModelSettings({ presetId: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3', authMode: 'none' });
    const wrapper = mount(InterviewConsent, { ...options, props: { preview: {} } });
    const checkbox = wrapper.get('[data-testid="interview-consent"]');
    await checkbox.setValue(true);
    await byText(wrapper, '确认服务与发送范围').trigger('click');
    expect(wrapper.emitted('confirmed')).toHaveLength(1);
    expect(byText(wrapper, '已确认，可继续').attributes('disabled')).toBeDefined();
    const changes = wrapper.emitted('changed')?.length || 0;
    await checkbox.setValue(false);
    expect(wrapper.emitted('changed')).toHaveLength(changes + 1);
    expect(byText(wrapper, '确认服务与发送范围').attributes('disabled')).toBeDefined();
    await checkbox.setValue(true);
    expect(wrapper.emitted('confirmed')).toHaveLength(1); // Checking alone never reauthorizes the parent.
    expect(byText(wrapper, '确认服务与发送范围').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
  it('uses a remembered key without asking again, and stores one when opted in', async () => {
    saveAiModelSettings({ presetId: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' });
    setAiSessionApiKey('remembered-secret', undefined, { remember: true });
    const remembered = mount(InterviewConsent, { ...options, props: { preview: {} } });
    expect(remembered.find('input[type="password"]').exists()).toBe(false);
    expect(remembered.text()).toContain('已记住到本机');
    await remembered.find('[data-testid="interview-consent"]').setValue(true);
    await byText(remembered, '确认服务与发送范围').trigger('click');
    expect(remembered.emitted('confirmed')?.[0]?.[0]).toMatchObject({ apiKey: 'remembered-secret' });
    remembered.unmount();

    clearAiSessionApiKey();
    const fresh = mount(InterviewConsent, { ...options, props: { preview: {} } });
    await fresh.find('input[type="password"]').setValue('fresh-secret');
    await fresh.find('[data-testid="remember-key"]').setValue(true);
    await fresh.find('[data-testid="interview-consent"]').setValue(true);
    await byText(fresh, '确认服务与发送范围').trigger('click');
    expect(hasAiStoredApiKey()).toBe(true);
    expect(localStorage.getItem('sea-resume_ai-provider-keys')).toContain('fresh-secret');
    fresh.unmount();
  });
  it('confirms a local no-auth provider without a key and points to settings when none is configured', async () => {
    const empty = mount(InterviewConsent, { ...options, props: { preview: {} } });
    await byText(empty, '配置 AI 服务').trigger('click');
    expect(empty.emitted('configure')).toBeTruthy();
    empty.unmount();

    saveAiModelSettings({ presetId: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3', authMode: 'none' });
    const wrapper = mount(InterviewConsent, { ...options, props: { preview: {} } });
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
    await wrapper.find('[data-testid="interview-consent"]').setValue(true);
    await byText(wrapper, '确认服务与发送范围').trigger('click');
    expect(wrapper.emitted('confirmed')?.[0]?.[0]).toMatchObject({ baseUrl: 'http://localhost:11434/v1', authMode: 'none', apiKey: '' });
    wrapper.unmount();
  });
  it('shows raw question / answer bubbles; real mode never renders coach content, no HTML execution', () => {
    const { session } = fixture(); session.settings.mode = 'real'; session.turns[0]!.answer = '<img src=x onerror=alert(1)>';
    const wrapper = mount(InterviewConversation, { ...options, props: { session, busy: false, consented: true } });
    expect(wrapper.text()).toContain('请说明贡献'); expect(wrapper.text()).toContain('<img src=x');
    expect(wrapper.find('img').exists()).toBe(false); expect(wrapper.text()).not.toMatch(/COACH_HINT|GENERAL_KNOWLEDGE/);
    wrapper.unmount();
  });
  it('requires target and explicit truth confirmation, rereads latest source at handoff, passes only raw facts to optimizer', async () => {
    const { resume, session } = fixture(); const read = vi.spyOn(storageManager, 'read').mockResolvedValue(resume);
    const wrapper = mount(InterviewReport, { ...options, props: { session } });
    await byText(wrapper, '读取最新简历，确认回补事实').trigger('click'); await flushPromises();
    expect(read).toHaveBeenCalledWith('resume-1'); expect(wrapper.find('input[type="checkbox"]').attributes('disabled')).toBeDefined();
    await byText(wrapper, '仅将已确认事实交给优化与审查').trigger('click'); await flushPromises(); expect(wrapper.find('[data-testid="optimizer"]').exists()).toBe(false);
    await wrapper.find('select').setValue('p1'); await wrapper.find('input[type="checkbox"]').setValue(true);
    await byText(wrapper, '仅将已确认事实交给优化与审查').trigger('click'); await flushPromises();
    const optimizer = wrapper.findComponent({ name: 'ResumeOptimizationPanel' });
    expect(optimizer.exists()).toBe(true); expect(optimizer.props('resume').projects[0].description).toBe('最新内容');
    expect(optimizer.props('initialFacts')).toEqual([{ id: 'fact1', targetId: 'p1', text: '我实现缓存' }]);
    expect(read).toHaveBeenCalledTimes(3); // prepare + failed confirmation + confirmed handoff
    wrapper.unmount();
  });
  it('rejects a deleted target or a coach fact at the final handoff without mounting optimizer', async () => {
    const { resume, session } = fixture(); const read = vi.spyOn(storageManager, 'read').mockResolvedValue(resume);
    const wrapper = mount(InterviewReport, { ...options, props: { session } });
    await byText(wrapper, '读取最新简历，确认回补事实').trigger('click'); await flushPromises();
    await wrapper.find('select').setValue('p1'); await wrapper.find('input[type="checkbox"]').setValue(true);
    read.mockResolvedValueOnce({ ...resume, projects: [] }); await byText(wrapper, '仅将已确认事实交给优化与审查').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('事实来源或目标已变化'); expect(wrapper.find('[data-testid="optimizer"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('offers a targeted practice handoff carrying only the report practice points and tags', async () => {
    const { session } = fixture();
    session.report!.observations = [{ category: 'expression', tag: 'result', text: '补上验证方式', verification: 'needs-verification', evidence: [{ sourceId: 'a1', snippet: '我实现缓存' }] }];
    session.report!.followupReview = [{ category: 'knowledge', tag: 'knowledge', text: '缓存一致性', verification: 'needs-verification', evidence: [{ sourceId: 'a1', snippet: '我实现缓存' }] }];
    const wrapper = mount(InterviewReport, { ...options, props: { session } });
    expect(wrapper.text()).toContain('针对弱项再练一轮');
    await byText(wrapper, '针对弱项再练一轮').trigger('click');
    expect(wrapper.emitted('practice')?.[0]?.[0]).toEqual({
      sourceSessionId: 'session-1',
      points: ['一', '二', '三', '补上验证方式', '缓存一致性'],
      tags: ['result', 'knowledge'],
    });
    wrapper.unmount();
  });
  it('history provides resume selection and explicit deletion / all-AI clear warning', async () => {
    const { resume, session } = fixture();
    vi.spyOn(storageManager, 'init').mockResolvedValue();
    vi.spyOn(storageManager, 'list').mockResolvedValue([{ id: resume.id, title: 'Source', templateId: 'modern', createdAt: 1, updatedAt: 1 }]);
    vi.mocked(aiWorkspaceRepository.list).mockImplementation(async kind => kind === 'interview' ? [session] : [{ id: 'optimization-1' }]);
    vi.mocked(aiWorkspaceRepository.delete).mockResolvedValue(); vi.mocked(aiWorkspaceRepository.clear).mockResolvedValue();
    const confirmation = vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel');
    const wrapper = mount(InterviewHistory, options); await flushPromises();
    expect(wrapper.find('[role=combobox]').text()).toContain('Source'); expect(wrapper.text()).toContain('不完整报告');
    await wrapper.findAll('button').find(button => button.text() === '删除')!.trigger('click'); await flushPromises();
    expect(aiWorkspaceRepository.delete).not.toHaveBeenCalled();
    confirmation.mockImplementation(vi.fn().mockResolvedValue('confirm')); await wrapper.findAll('button').find(button => button.text() === '删除')!.trigger('click'); await flushPromises();
    expect(aiWorkspaceRepository.delete).toHaveBeenCalledWith('interview', session.id);
    await wrapper.findAll('button').find(button => button.text() === '清空全部 AI 记录')!.trigger('click'); await flushPromises();
    expect(confirmation.mock.calls.some(([message]) => String(message).includes('所有面试回答 / 报告及简历优化记录'))).toBe(true);
    expect(aiWorkspaceRepository.clear).toHaveBeenCalledTimes(1); wrapper.unmount();
  });
  it('starts a fresh backfill only after permission to replace an unsaved optimization', async () => {
    const { resume, session } = fixture();
    vi.spyOn(storageManager, 'read').mockResolvedValue(resume);
    const optimization = useAiWorkspaceStore();
    optimization.run = createOptimizationRun(resume, { target: '', company: '', jd: '', style: 'concise', personalSample: '', generalizeOrganizations: true }, { baseUrl: 'https://test/v1', model: 'test', apiKey: 'memory-key' });
    optimization.dirty = true;
    const oldId = optimization.run.id;
    const confirm = vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel');
    const wrapper = mount(InterviewReport, { ...options, props: { session } });
    await byText(wrapper, '读取最新简历，确认回补事实').trigger('click'); await flushPromises();
    await wrapper.find('select').setValue('p1'); await wrapper.find('input[type="checkbox"]').setValue(true);
    await byText(wrapper, '仅将已确认事实交给优化与审查').trigger('click'); await flushPromises();
    expect(optimization.run?.id).toBe(oldId); expect(wrapper.find('[data-testid="optimizer"]').exists()).toBe(false);
    confirm.mockImplementation(vi.fn().mockResolvedValue('confirm'));
    await byText(wrapper, '仅将已确认事实交给优化与审查').trigger('click'); await flushPromises();
    expect(optimization.run).toBeNull(); expect(wrapper.find('[data-testid="optimizer"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('explains keyless MCP interview flow via sea_interview_save when connected without web API models', () => {
    const mcp = useMcpState();
    mcp.linkState.value = 'connected';
    try {
      const wrapper = mount(InterviewConsent, { ...options, props: { preview: {} } });
      expect(wrapper.text()).toContain('已连接外部 MCP（免 API Key）');
      expect(wrapper.text()).toContain('sea_interview_save');
      wrapper.unmount();
    } finally {
      mcp.linkState.value = '';
    }
  });
});
