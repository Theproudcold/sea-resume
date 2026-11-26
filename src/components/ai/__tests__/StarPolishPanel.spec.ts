import { webcrypto } from 'node:crypto';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElButton } from 'element-plus';
import StarPolishPanel from '../StarPolishPanel.vue';
import { requestStarPolish } from '@/services/ai/starPolish';
import { clearAiModelSettings, clearAiSessionApiKey, saveAiModelSettings, setAiSessionApiKey } from '@/services/ai/AiSettings';
import { useMcpState } from '@/services/ai/useMcpBridge';
import { clearExternalTasks, completeExternalTask, listExternalTasks } from '@/services/ai/externalTaskQueue';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import type { ResumeData } from '@/types/resume';
vi.mock('@/services/ai/starPolish', async () => {
  const actual = await vi.importActual<typeof import('@/services/ai/starPolish')>('@/services/ai/starPolish');
  return { ...actual, requestStarPolish: vi.fn() };
});
let panel: VueWrapper;
let resume: ResumeData;
function setup() {
  resume = parseResumeMarkdown('# 测试\n\n## 工作经历\n### 公司 | 工程师 | 2022.01 — 至今\n负责结算页面改版').resume;
  panel = mount(StarPolishPanel, { props: { resume }, global: { components: { ElButton } } });
  return panel;
}
async function start() {
  await panel.get('input[type=checkbox]').setValue(true);
  await panel.get('[data-testid=star-consent]').setValue(true);
  await panel.get('[data-testid=star-start]').trigger('click');
  await flushPromises();
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.resetAllMocks(); localStorage.clear(); clearAiModelSettings();
  saveAiModelSettings({ presetId: 'custom', baseUrl: 'https://example.test/v1', model: 'mock', profileName: '测试模型' });
  setAiSessionApiKey('session-key');
});
afterEach(() => { panel?.unmount(); vi.restoreAllMocks(); });
describe('StarPolishPanel', () => {
  it('requires a selection and consent, then emits only the accepted operation', async () => {
    setup();
    expect(panel.get('[data-testid=star-start]').attributes('disabled')).toBeDefined();
    const key = panel.get('input[type=checkbox]').attributes('value');
    vi.mocked(requestStarPolish).mockResolvedValue({
      explanation: '已重组',
      suggestions: [{ key: key!, label: '公司 · 工程师', before: '负责结算页面改版', rawBefore: resume.experiences[0]!.description, after: '- 负责结算页面并完成改版', note: '原文没有结果', novelNumbers: [], operation: { type: 'update_experience', id: resume.experiences[0]!.id, field: 'description', value: '- 负责结算页面并完成改版' } }],
    });
    await start();
    expect(requestStarPolish).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'session-key' }), resume, [key], '', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(panel.text()).toContain('原文没有结果');
    const done = vi.fn();
    panel.vm.$.emit = panel.vm.$.emit;
    await panel.get('[data-testid=star-apply]').trigger('click');
    await flushPromises();
    const proposal = panel.emitted('apply')?.[0]?.[0] as { operations: unknown[]; explanation: string };
    expect(proposal.operations).toEqual([{ type: 'update_experience', id: resume.experiences[0]!.id, field: 'description', value: '- 负责结算页面并完成改版' }]);
    expect(proposal.explanation).toBe('已重组');
    (panel.emitted('apply')?.[0]?.[1] as (saved: boolean) => void)(true);
    await flushPromises();
    expect(panel.find('[data-testid=star-apply]').exists()).toBe(false);
    expect(done).not.toHaveBeenCalled();
  });
  it('leaves novel numbers unselected and blocks application until chosen', async () => {
    setup();
    const key = panel.get('input[type=checkbox]').attributes('value');
    vi.mocked(requestStarPolish).mockResolvedValue({
      explanation: '',
      suggestions: [{ key: key!, label: '公司 · 工程师', before: '负责结算页面改版', rawBefore: resume.experiences[0]!.description, after: '- 加载缩短 30%', note: '', novelNumbers: ['30%'], operation: { type: 'update_experience', id: resume.experiences[0]!.id, field: 'description', value: '- 加载缩短 30%' } }],
    });
    await start();
    expect(panel.text()).toContain('30%');
    expect(panel.get('[data-testid=star-apply]').attributes('disabled')).toBeDefined();
  });
  it('hard-blocks suggestions flagged by aiFactGuard so they cannot be checked or applied', async () => {
    setup();
    const key = panel.get('input[type=checkbox]').attributes('value');
    vi.mocked(requestStarPolish).mockResolvedValue({
      explanation: '',
      suggestions: [{
        key: key!,
        label: '公司 · 工程师',
        before: '负责结算页面改版',
        rawBefore: resume.experiences[0]!.description,
        after: '- 改版后耗时缩短 30%',
        note: '',
        novelNumbers: ['30%'],
        guard: [{ code: 'metric', details: ['30'], message: '改写引入了原句没有的数字或指标（30），请先核实再采纳。' }],
        operation: { type: 'update_experience', id: resume.experiences[0]!.id, field: 'description', value: '- 改版后耗时缩短 30%' },
      }],
    });
    await start();
    expect(panel.text()).toContain('确定性校验已拦截');
    expect(panel.get('.suggestion input[type=checkbox]').attributes('disabled')).toBeDefined();
    expect(panel.get('[data-testid=star-apply]').attributes('disabled')).toBeDefined();
  });
  it('aborts on cancellation and ignores the late result', async () => {
    setup();
    let resolve!: (value: Awaited<ReturnType<typeof requestStarPolish>>) => void;
    vi.mocked(requestStarPolish).mockImplementation(() => new Promise((done) => { resolve = done; }));
    await start();
    const signal = vi.mocked(requestStarPolish).mock.calls[0]![4]!.signal!;
    await panel.findAll('button').find((button) => button.text() === '取消润色')!.trigger('click');
    expect(signal.aborted).toBe(true);
    resolve({ explanation: '', suggestions: [] });
    await flushPromises();
    expect(panel.text()).not.toContain('没有需要改动');
  });
  it('dispatches STAR polish via external MCP without an API key when connected', async () => {
    clearAiModelSettings();
    clearAiSessionApiKey();
    clearExternalTasks();
    const mcp = useMcpState();
    mcp.linkState.value = 'connected';
    try {
      setup();
      expect(panel.text()).toContain('外部 Agent（MCP · 免 API Key）');
      expect(panel.get('[data-testid=star-start]').text()).toContain('派发给外部 Agent 润色（免 Key）');
      await start();
      const pending = listExternalTasks('pending');
      expect(pending).toHaveLength(1);
      expect(pending[0]?.kind).toBe('polish');
      expect(requestStarPolish).not.toHaveBeenCalled();
      completeExternalTask(pending[0]!.id, { summary: '已完成 STAR 润色并写回简历' });
      await flushPromises();
      expect(panel.text()).toContain('已完成 STAR 润色并写回简历');
    } finally {
      mcp.linkState.value = '';
      clearExternalTasks();
    }
  });
});
