import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElRadioGroup } from 'element-plus';
import AiAssistantPanel from '../AiAssistantPanel.vue';
import { clearAiModelSettings, clearAiSessionApiKey, saveAiModelSettings } from '@/services/ai/AiSettings';
import { requestResumeAiDraft } from '@/services/ai/quickEdit';
import { useMcpState } from '@/services/ai/useMcpBridge';
import { clearExternalTasks, completeExternalTask, listExternalTasks } from '@/services/ai/externalTaskQueue';
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

  it('opens the exam audit mode, marks readiness status and emits navigate to edit risky items', async () => {
    const sample = parseResumeMarkdown(`# 测试简历

## 工作经历
### 星海科技 | 后端 | 2022-01 — 至今
主导高并发接口重构，延迟降低 40%，使用 MySQL InnoDB 与 Redis 缓存。`).resume;
    panel = mount(AiAssistantPanel, {
      props: { visible: true, resume: sample, undoAvailable: false },
      global: {
        plugins: [ElementPlus],
        stubs: { ElDrawer: { template: '<section><slot /></section>' }, ResumeOptimizationPanel: { template: '<div />', methods: { beforeClose: async () => true } }, StarPolishPanel: true, GreetingPanel: true },
      },
    });
    panel.getComponent(ElRadioGroup).vm.$emit('update:modelValue', 'examAudit');
    await flushPromises();
    expect(panel.findAll('[data-testid=exam-audit-card]').length).toBeGreaterThanOrEqual(2);
    await panel.get('[data-testid=exam-audit-jump]').trigger('click');
    expect(panel.emitted('navigate')?.[0]).toBeTruthy();
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

  it('当外部 MCP 已连接且未配 API Key 时，快捷修改可直接免 Key 派发任务给外部 Agent', async () => {
    clearAiModelSettings();
    clearAiSessionApiKey();
    clearExternalTasks();
    const mcp = useMcpState();
    mcp.linkState.value = 'connected';
    try {
      await render();
      expect(panel.text()).toContain('外部 MCP 已连接');
      expect(panel.text()).toContain('外部 Agent（MCP · 免 API Key）');
      await panel.get('#quick-edit-instruction').setValue('突出跨端性能优化成果');
      await panel.get('.consent-check input').setValue(true);
      expect(panel.get('.request-button').attributes('disabled')).toBeUndefined();
      expect(panel.get('.request-button').text()).toContain('派发给外部 Agent 修改（免 Key）');
      await panel.get('.request-button').trigger('click');
      await flushPromises();
      const pending = listExternalTasks('pending');
      expect(pending).toHaveLength(1);
      expect(pending[0]?.kind).toBe('quick_edit');
      expect(panel.text()).toContain(pending[0]!.id);
      completeExternalTask(pending[0]!.id, { summary: '已按要求优化简介并实时刷新预览' });
      await flushPromises();
      expect(panel.text()).toContain('已按要求优化简介并实时刷新预览');
      expect(requestResumeAiDraft).not.toHaveBeenCalled();
    } finally {
      mcp.linkState.value = '';
      clearExternalTasks();
    }
  });
});
