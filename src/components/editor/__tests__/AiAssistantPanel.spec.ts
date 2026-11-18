import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElRadioGroup } from 'element-plus';
import AiAssistantPanel from '../AiAssistantPanel.vue';
import { clearAiModelSettings, saveAiModelSettings } from '@/services/ai/AiSettings';
import { requestResumeAiDraft } from '@/services/ai/quickEdit';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';

vi.mock('@/services/ai/quickEdit', () => ({ requestResumeAiDraft: vi.fn() }));
let panel: VueWrapper;
async function render() {
  panel = mount(AiAssistantPanel, {
    props: { visible: true, resume: parseResumeMarkdown('# 测试简历').resume, undoAvailable: false },
    global: {
      plugins: [ElementPlus],
      stubs: { ElDrawer: { template: '<section><slot /></section>' }, ResumeOptimizationPanel: { template: '<div />', methods: { beforeClose: async () => true } }, StarPolishPanel: true, GreetingPanel: true },
    },
  });
  panel.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'quick');
  await flushPromises();
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); clearAiModelSettings();
  saveAiModelSettings({ presetId: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'local', authMode: 'none' });
});
afterEach(() => { panel?.unmount(); });

describe('AI assistant quick editing UX', () => {
  it('labels the instruction input and requires explicit sending consent', async () => {
    await render();
    expect(panel.get('label[for="quick-edit-instruction"]').text()).toBe('希望 AI 如何修改？');
    expect(panel.text()).toContain('经历润色');
    expect(panel.text()).toContain('若选择记住，会以明文保存在本机浏览器');
    await panel.get('#quick-edit-instruction').setValue('精简个人简介');
    expect(panel.get('.request-button').attributes('disabled')).toBeDefined();
    expect(requestResumeAiDraft).not.toHaveBeenCalled();
  });

  it('lets users cancel generation and discards late results', async () => {
    await render();
    let resolve!: (value: Awaited<ReturnType<typeof requestResumeAiDraft>>) => void;
    vi.mocked(requestResumeAiDraft).mockImplementation(() => new Promise(done => { resolve = done; }));
    await panel.get('#quick-edit-instruction').setValue('精简个人简介');
    await panel.get('.consent-check input').setValue(true);
    await panel.get('.request-button').trigger('click');
    const signal = vi.mocked(requestResumeAiDraft).mock.calls[0]![3]!.signal!;
    expect(panel.get('#quick-edit-instruction').attributes('disabled')).toBeDefined();
    expect(panel.get('.request-button').text()).toContain('正在生成');
    await panel.findAll('button').find(button => button.text() === '取消生成')!.trigger('click');
    expect(signal.aborted).toBe(true);
    resolve({ explanation: '过期结果', operations: [] });
    await flushPromises();
    expect(panel.text()).not.toContain('过期结果');
    expect(panel.get('.request-button').text()).toBe('生成修改建议');
  });
});
