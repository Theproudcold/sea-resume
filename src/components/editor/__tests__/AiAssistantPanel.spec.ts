import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElRadioGroup } from 'element-plus';
import AiAssistantPanel from '../AiAssistantPanel.vue';
import { clearAiModelSettings, saveAiModelSettings } from '@/services/ai/AiSettings';
import { requestResumeAiDraft } from '@/services/ai/quickEdit';
import { useMcpBridge } from '@/services/ai/useMcpBridge';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';

vi.mock('vue-router', () => ({ useRouter: () => ({ currentRoute: { value: { path: '/editor/1' } }, push: vi.fn() }) }));

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

  it('opens the JD risk panel from the mode switch and renders a real scan', async () => {
    // 不用 stub：在真实父组件里切换模式，确认面板真的挂上并能工作。
    panel = mount(AiAssistantPanel, {
      props: { visible: true, resume: parseResumeMarkdown('# 测试简历').resume, undoAvailable: false },
      global: {
        plugins: [ElementPlus],
        stubs: { ElDrawer: { template: '<section><slot /></section>' }, ResumeOptimizationPanel: { template: '<div />', methods: { beforeClose: async () => true } }, StarPolishPanel: true, GreetingPanel: true },
      },
    });
    expect(panel.find('[data-testid=jd-risk-input]').exists()).toBe(false);
    panel.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'jdRisk');
    await flushPromises();
    const input = panel.get('[data-testid=jd-risk-input]');
    await input.setValue('任职要求：抗压能力强。本岗位为劳务派遣。');
    const labels = panel.findAll('[data-testid=jd-risk-hit]').map((hit) => hit.text()).join('\n');
    expect(labels).toContain('加班 / 强度');
    expect(labels).toContain('用工性质');
  });

  it('让模式切换条贴住内容宽度，不再被面板拉成通栏', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/editor/AiAssistantPanel.vue'), 'utf8');
    const modeBar = /\.assistant-panel > :deep\(\.el-radio-group\)\s*\{[^}]*\}/.exec(source)?.[0] ?? '';

    expect(modeBar).toContain('align-self: flex-start;');
    expect(modeBar).toContain('margin-bottom: var(--ui-space-1);');
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

  it('当外部 MCP 已连接时提示无需在此配置 API Key，消除内置助手与外部 Agent 混淆', async () => {
    const mcp = useMcpBridge();
    mcp.linkState.value = 'connected';
    try {
      await render();
      expect(panel.text()).toContain('外部 MCP 已连接');
      expect(panel.text()).toContain('无需在此配置 API Key');
    } finally {
      mcp.linkState.value = '';
    }
  });
});
