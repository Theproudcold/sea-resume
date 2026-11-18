import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { ElAlert, ElButton } from 'element-plus';
import Interview from '@/views/Interview.vue';
import { storageManager } from '@/services/storage/StorageManager';
import { clearAiModelSettings, saveAiModelSettings } from '@/services/ai/AiSettings';
import { requestAiJson } from '@/services/ai/transport';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { buildResumeContext } from '@/services/ai/resumeContext';
import { useInterviewStore } from '@/stores/interview';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { sessionId: 'new' }, query: {} }),
  useRouter: () => ({ push, replace: vi.fn() }),
  onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn(),
}));
vi.mock('@/services/ai/transport', async original => ({ ...await original<typeof import('@/services/ai/transport')>(), requestAiJson: vi.fn() }));

let wrapper: VueWrapper;
const resume = parseResumeMarkdown('# 测试简历\n\n## 个人简介\n前端工程师').resume;
async function render() {
  wrapper = mount(Interview, { global: {
    components: { ElAlert, ElButton },
    stubs: { AppHeader: true, ElDialog: true, AiProviderSettingsPanel: true, InterviewConversation: true, InterviewReport: true },
  } });
  await flushPromises();
}
function button(text: string) { return wrapper.findAll('button').find(item => item.text() === text)!; }
beforeEach(() => {
  vi.restoreAllMocks(); vi.resetAllMocks(); localStorage.clear(); clearAiModelSettings(); setActivePinia(createPinia());
  vi.spyOn(storageManager, 'init').mockResolvedValue();
  vi.spyOn(storageManager, 'list').mockResolvedValue([{ id: resume.id, title: '测试简历', templateId: 'modern', createdAt: 1, updatedAt: 1 }]);
  vi.spyOn(storageManager, 'read').mockResolvedValue(resume);
});
afterEach(() => { wrapper?.unmount(); });

describe('Interview setup UX', () => {
  it('offers a create action rather than an unusable setup when no resume exists', async () => {
    vi.mocked(storageManager.list).mockResolvedValue([]);
    await render();
    expect(wrapper.text()).toContain('先准备一份简历');
    expect(wrapper.find('[data-testid=interview-consent]').exists()).toBe(false);
    await button('创建简历').trigger('click');
    expect(push).toHaveBeenCalledWith('/templates');
    expect(requestAiJson).not.toHaveBeenCalled();
  });

  it('explains missing service configuration without sending any request', async () => {
    await render();
    expect(wrapper.text()).toContain('还没有可用的 AI 服务');
    expect(button('开始面试').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid=interview-consent]').attributes('disabled')).toBeDefined();
    expect(requestAiJson).not.toHaveBeenCalled();
  });

  it('places settings before consent and disables start again as soon as consent is unchecked', async () => {
    saveAiModelSettings({ presetId: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'local', authMode: 'none' });
    await render();
    const details = wrapper.findAll('details').find(item => item.text().includes('题数、岗位要求与保存方式'))!;
    const consent = wrapper.get('[data-testid=interview-consent]');
    expect(details.element.compareDocumentPosition(consent.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wrapper.findAll('label').some(label => label.text().includes('岗位要求（选填）') && label.find('textarea').exists())).toBe(true);
    await consent.setValue(true);
    await button('确认服务与发送范围').trigger('click');
    expect(button('开始面试').attributes('disabled')).toBeUndefined();
    await consent.setValue(false);
    expect(button('开始面试').attributes('disabled')).toBeDefined();
    expect(requestAiJson).not.toHaveBeenCalled();
  });

  it('keeps consent revocable after starting replaces the setup form', async () => {
    saveAiModelSettings({ presetId: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'local', authMode: 'none' });
    vi.mocked(requestAiJson).mockResolvedValueOnce({
      coveragePlan: ['职责', '实现', '取舍', '验证', '失败', '协作', '结果', '复盘'],
      question: { text: '请介绍你的经历', focus: '个人职责', kind: 'experience', itemIds: [] },
    });
    await render();
    await wrapper.get('select[aria-label="来源简历"]').setValue(resume.id);
    await flushPromises();
    const setupConsent = wrapper.get('[data-testid=interview-consent]').element;
    await wrapper.get('[data-testid=interview-consent]').setValue(true);
    await button('确认服务与发送范围').trigger('click');
    await button('开始面试').trigger('click');
    await flushPromises();
    const store = useInterviewStore();
    expect(store.consented).toBe(true);
    expect(store.session?.status).toBe('answering');
    expect(requestAiJson).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[data-testid=interview-consent]').element).not.toBe(setupConsent);
    expect((wrapper.get('[data-testid=interview-consent]').element as HTMLInputElement).checked).toBe(true);
    await button('撤回同意').trigger('click');
    expect(store.consented).toBe(false);
    expect(button('结束并生成报告').attributes('disabled')).toBeDefined();
    await store.submitAnswer('', true);
    await store.continueInterview();
    await store.finish();
    store.session!.status = 'failed';
    await store.retry();
    expect(requestAiJson).toHaveBeenCalledTimes(1);
  });

  it('does not ask for another answer when an answer is already submitted', async () => {
    await render();
    useInterviewStore().session = {
      id: 'session-1', sourceResumeId: resume.id, createdAt: 'now', updatedAt: 'now', context: buildResumeContext(resume),
      settings: { targetRole: '', jd: '', level: '', direction: '综合', mode: 'training', mainQuestionLimit: 5 },
      provider: { baseUrl: 'http://localhost:11434/v1', model: 'local' }, status: 'reviewing', pendingStage: null,
      coveragePlan: [], turns: [], usage: { calls: 0, promptTokens: 0, completionTokens: 0 }, persistence: false, jsonMode: true, ending: false,
    };
    await flushPromises();
    expect(wrapper.get('.status-pill').text()).toBe('回答已提交');
    expect(wrapper.get('.save-state').text()).toContain('尚未保存，刷新可能丢失');
    expect(requestAiJson).not.toHaveBeenCalled();
  });
});
