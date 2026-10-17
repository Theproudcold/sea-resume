import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElButton } from 'element-plus';
import GreetingPanel from '../GreetingPanel.vue';
import { requestGreetings } from '@/services/ai/greeting';
import { clearAiModelSettings, saveAiModelSettings, setAiSessionApiKey } from '@/services/ai/AiSettings';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import type { ResumeData } from '@/types/resume';
vi.mock('@/services/ai/greeting', () => ({ requestGreetings: vi.fn() }));
let panel: VueWrapper;
let resume: ResumeData;
function setup() {
  resume = parseResumeMarkdown('# 测试\n\n## 个人简介\n前端开发').resume;
  panel = mount(GreetingPanel, { props: { resume }, global: { components: { ElButton } } });
  return panel;
}
async function start() {
  await panel.get('[data-testid=greeting-consent]').setValue(true);
  await panel.get('[data-testid=greeting-start]').trigger('click');
  await flushPromises();
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); clearAiModelSettings();
  saveAiModelSettings({ presetId: 'custom', baseUrl: 'https://example.test/v1', model: 'mock', profileName: '测试模型' });
  setAiSessionApiKey('session-key');
});
afterEach(() => { panel?.unmount(); vi.restoreAllMocks(); });
describe('GreetingPanel', () => {
  it.each(['', '熟悉 Vue'])('requires consent and supports optional JD: %s', async jd => {
    setup();
    expect(panel.get('[data-testid=greeting-start]').attributes('disabled')).toBeDefined();
    if (jd) await panel.get('[data-testid=greeting-jd]').setValue(jd);
    vi.mocked(requestGreetings).mockResolvedValue(['您好1', '您好2', '您好3']);
    const original = JSON.stringify(resume);
    await start();
    expect(requestGreetings).toHaveBeenCalledWith(expect.objectContaining({ model: 'mock', apiKey: 'session-key' }), resume, jd, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(panel.findAll('.greeting-result')).toHaveLength(3);
    expect(JSON.stringify(resume)).toBe(original);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await panel.get('#greeting-result-0').setValue('编辑后的文案');
    await panel.get('.greeting-result button').trigger('click'); await flushPromises();
    expect(writeText).toHaveBeenCalledWith('编辑后的文案'); expect(panel.text()).toContain('文案已复制');
  });
  it('resets consent when inputs change and blocks without model configuration', async () => {
    setup(); await panel.get('[data-testid=greeting-consent]').setValue(true);
    await panel.get('[data-testid=greeting-jd]').setValue('新要求');
    expect((panel.get('[data-testid=greeting-consent]').element as HTMLInputElement).checked).toBe(false);
    clearAiModelSettings(); window.dispatchEvent(new Event('focus')); await flushPromises();
    await panel.get('[data-testid=greeting-consent]').setValue(true);
    expect(panel.get('[data-testid=greeting-start]').attributes('disabled')).toBeDefined();
    expect(requestGreetings).not.toHaveBeenCalled();
  });
  it('shows failures and supports manual retry', async () => {
    setup(); vi.mocked(requestGreetings).mockRejectedValueOnce(new Error('AI 请求失败'));
    await start(); expect(panel.get('[role=alert]').text()).toBe('AI 请求失败');
    vi.mocked(requestGreetings).mockResolvedValue(['1', '2', '3']);
    await panel.get('[data-testid=greeting-start]').trigger('click'); await flushPromises();
    expect(panel.findAll('.greeting-result')).toHaveLength(3); expect(requestGreetings).toHaveBeenCalledTimes(2);
  });
  it('ignores late results after cancellation and aborts on unmount', async () => {
    setup(); let resolve!: (result: string[]) => void;
    vi.mocked(requestGreetings).mockImplementation(() => new Promise(r => { resolve = r; }));
    await start();
    const signal = vi.mocked(requestGreetings).mock.calls[0]![3]!.signal!;
    await panel.findAll('button').find(button => button.text() === '取消生成')!.trigger('click');
    expect(signal.aborted).toBe(true);
    resolve(['late', 'late', 'late']); await flushPromises(); expect(panel.findAll('.greeting-result')).toHaveLength(0);
    await panel.get('[data-testid=greeting-start]').trigger('click');
    const secondSignal = vi.mocked(requestGreetings).mock.calls[1]![3]!.signal!;
    panel.unmount(); expect(secondSignal.aborted).toBe(true);
  });
  it('offers manual copy when clipboard access fails', async () => {
    setup(); vi.mocked(requestGreetings).mockResolvedValue(['1', '2', '3']); await start();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    await panel.get('.greeting-result button').trigger('click'); await flushPromises();
    expect(panel.get('[role=status]').text()).toContain('手动复制');
  });
  it('supports local models without an API key', async () => {
    clearAiModelSettings();
    saveAiModelSettings({ presetId: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'local-model', authMode: 'none' });
    setup(); vi.mocked(requestGreetings).mockResolvedValue(['1', '2', '3']);
    await start();
    expect(requestGreetings).toHaveBeenCalledWith(expect.objectContaining({ apiKey: '', authMode: 'none', model: 'local-model' }), resume, '', expect.anything());
  });
});
