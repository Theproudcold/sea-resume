import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElMessageBox } from 'element-plus';
import ResumeOptimizationPanel from '../ResumeOptimizationPanel.vue';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { saveAiModelSettings, setAiSessionApiKey, clearAiModelSettings } from '@/services/ai/AiSettings';
import { requestAiJson, AiCompatibilityError } from '@/services/ai/AiClient';
import { useResumeStore } from '@/stores/resume';
import { useWorkbenchStore } from '@/stores/workbench';
import { useAiWorkspaceStore } from '@/stores/aiWorkspace';
import { aiWorkspaceRepository } from '@/services/ai/AiWorkspaceRepository';
vi.mock('@/services/ai/AiClient', async importOriginal => ({ ...await importOriginal<typeof import('@/services/ai/AiClient')>(), requestAiJson: vi.fn() }));
vi.mock('@/services/ai/AiWorkspaceRepository', () => ({ aiWorkspaceRepository: { save: vi.fn(), get: vi.fn(), list: vi.fn(), delete: vi.fn() } }));
vi.mock('@/services/storage/StorageManager', () => ({ storageManager: { read: vi.fn(), save: vi.fn(), list: vi.fn() } }));
const analysis = { summary: '<img src=x onerror=alert(1)>简要结论', matches: [], issues: [], questions: [{ id: 'q1', text: '你的具体行动？', targetId: 'basic' }] };
const suggestions = [
  { id: 's1', operation: { type: 'set_basic', field: 'summary', value: '真实个人行动' }, reason: '更清楚', requirement: '', sourceRefs: ['basic.summary'] },
  { id: 's2', operation: { type: 'set_basic', field: 'title', value: '新意向' }, reason: '更准确', requirement: '', sourceRefs: ['basic.title'] },
];
let wrapper: VueWrapper | undefined;
function setup(initialFacts?: Array<{ id: string; text: string; targetId: string }>) {
  const resume = parseResumeMarkdown('# Private Name\n\n## 个人简介\n原始内容').resume;
  resume.basic.email = 'private@example.test'; resume.basic.phone = 'private-phone'; resume.basic.birthDate = '1980-01-01';
  const store = useResumeStore(); store.data = resume;
  wrapper = mount(ResumeOptimizationPanel, { props: { resume, initialFacts } });
  return { wrapper, resume, store, workspace: useAiWorkspaceStore() };
}
async function startAndSkip(panel: VueWrapper) {
  await panel.get('[data-testid=consent]').setValue(true);
  await panel.get('[data-testid=start]').trigger('click'); await flushPromises();
  await panel.get('[data-testid=skip]').trigger('click'); await flushPromises();
}
beforeEach(() => {
  setActivePinia(createPinia()); vi.resetAllMocks(); localStorage.clear(); clearAiModelSettings();
  saveAiModelSettings({ presetId: 'custom', baseUrl: 'https://example.test/v1', model: 'mock', profileName: '测试服务' }); setAiSessionApiKey('session-only-key');
  vi.mocked(aiWorkspaceRepository.list).mockResolvedValue([]); vi.spyOn(ElMessageBox, 'confirm').mockImplementation(vi.fn().mockResolvedValue('confirm'));
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); });
describe('ResumeOptimizationPanel', () => {
  it('blocks requests without consent, resets it on option changes and previews no private fields', async () => {
    const { wrapper: panel } = setup();
    expect(panel.get('[data-testid=start]').attributes('disabled')).toBeDefined();
    await panel.get('[data-testid=start]').trigger('click'); expect(requestAiJson).not.toHaveBeenCalled();
    const preview = panel.get('[data-testid=sending-preview]').text();
    for (const secret of ['Private Name', 'private@example.test', 'private-phone', '1980-01-01', 'session-only-key']) expect(preview).not.toContain(secret);
    await panel.get('[data-testid=consent]').setValue(true);
    await panel.get('fieldset input:not([type=checkbox])').setValue('开发工程师');
    expect((panel.get('[data-testid=consent]').element as HTMLInputElement).checked).toBe(false);
  });
  it('requires explicit fact confirmation and never promotes a newly passed fact set automatically', async () => {
    const { wrapper: panel, workspace } = setup([{ id: 'interview-answer', text: '我做了真实测试', targetId: 'basic' }]);
    vi.mocked(requestAiJson).mockResolvedValueOnce(analysis);
    await panel.get('[data-testid=consent]').setValue(true); await panel.get('[data-testid=start]').trigger('click'); await flushPromises();
    expect(workspace.run?.facts).toEqual([]);
    await panel.setProps({ initialFacts: [{ id: 'coach-text', text: '教练参考不属于事实', targetId: 'basic' }] });
    expect(workspace.run?.facts).toEqual([]);
    expect((panel.get('[data-testid=consent]').element as HTMLInputElement).checked).toBe(false);
    expect(panel.text()).toContain('教练提示、参考答案和知识讲解不是经历证据');
  });
  it('runs a three-call mock pipeline, skips unconfirmed answers, and renders model text without HTML', async () => {
    const { wrapper: panel, workspace } = setup();
    vi.mocked(requestAiJson).mockResolvedValueOnce(analysis).mockResolvedValueOnce({ suggestions: [] }).mockResolvedValueOnce({ reviews: [] });
    await panel.get('[data-testid=consent]').setValue(true); await panel.get('[data-testid=start]').trigger('click'); await flushPromises();
    expect(panel.find('img').exists()).toBe(false); expect(panel.text()).toContain('<img src=x onerror=alert(1)>简要结论');
    await panel.get('.question textarea').setValue('还没有确认的回答');
    expect(panel.get('[data-testid=continue]').attributes('disabled')).toBeDefined();
    await panel.get('[data-testid=skip]').trigger('click'); await flushPromises();
    expect(workspace.run?.facts).toEqual([]); expect(requestAiJson).toHaveBeenCalledTimes(3); expect(panel.text()).toContain('本次没有修改建议');
  });
  it('requires pending confirmation and creates a copy by default without importing the source', async () => {
    const { wrapper: panel, store, resume } = setup();
    const create = vi.spyOn(useWorkbenchStore(), 'createResumeFromData').mockResolvedValue('new-job-version');
    const importData = vi.spyOn(store, 'importData').mockResolvedValue();
    vi.mocked(requestAiJson).mockResolvedValueOnce(analysis).mockResolvedValueOnce({ suggestions }).mockResolvedValueOnce({ reviews: [{ id: 's1', status: 'confirm', reason: '需核对' }, { id: 's2', status: 'reject', reason: '无依据' }] });
    await startAndSkip(panel);
    expect(panel.get('[data-review=reject] input').attributes('disabled')).toBeDefined();
    await panel.get('[data-review=confirm] input').setValue(true);
    expect(panel.get('[data-testid=apply]').attributes('disabled')).toBeDefined();
    await panel.findAll('[data-review=confirm] input')[1]!.setValue(true);
    await panel.get('[data-testid=apply]').trigger('click'); await flushPromises();
    expect(create).toHaveBeenCalledTimes(1); expect(importData).not.toHaveBeenCalled();
    const version = create.mock.calls[0]![0];
    expect(version.id).not.toBe(resume.id); expect(version.jobTarget?.sourceResumeId).toBe(resume.id);
    expect(version.basic.summary).toContain('真实个人行动'); expect(version.basic.title).toBe(resume.basic.title); expect(store.data.basic.summary).toBe(resume.basic.summary);
    expect(panel.emitted('applied')).toEqual([['new-job-version']]);
  });
  it('detects live edits before copying and never overwrites conflicts', async () => {
    const { wrapper: panel, store } = setup();
    const create = vi.spyOn(useWorkbenchStore(), 'createResumeFromData').mockResolvedValue('copy');
    vi.mocked(requestAiJson).mockResolvedValueOnce(analysis).mockResolvedValueOnce({ suggestions: [suggestions[0]] }).mockResolvedValueOnce({ reviews: [{ id: 's1', status: 'pass', reason: '有来源' }] });
    await startAndSkip(panel); await panel.get('.suggestion input').setValue(true);
    store.data.basic.summary = '手动更新';
    await panel.get('[data-testid=apply]').trigger('click'); await flushPromises();
    expect(create).not.toHaveBeenCalled(); expect(panel.get('[role=alert]').text()).toContain('不会覆盖'); expect(store.data.basic.summary).toBe('手动更新');
  });
  it('uses explicit current-mode confirmation and the history-aware import action', async () => {
    const { wrapper: panel, store } = setup();
    const importData = vi.spyOn(store, 'importData').mockResolvedValue();
    vi.mocked(requestAiJson).mockResolvedValueOnce(analysis).mockResolvedValueOnce({ suggestions: [suggestions[0]] }).mockResolvedValueOnce({ reviews: [{ id: 's1', status: 'pass', reason: '有来源' }] });
    await startAndSkip(panel); await panel.get('.suggestion input').setValue(true);
    await panel.findAll('select')[1]!.setValue('current');
    expect(panel.get('[data-testid=apply]').attributes('disabled')).toBeDefined();
    const explicit = panel.findAll('label.check').find(label => label.text().includes('明确同意更新来源简历'))!;
    await explicit.get('input').setValue(true); await panel.get('[data-testid=apply]').trigger('click'); await flushPromises();
    expect(importData).toHaveBeenCalledTimes(1); expect(importData.mock.calls[0]![0].basic.summary).toContain('真实个人行动');
  });
  it('offers compatibility only after error, keeps manual retry, and warns on close', async () => {
    const { wrapper: panel } = setup();
    expect(panel.text()).not.toContain('兼容模式：');
    vi.mocked(requestAiJson).mockRejectedValueOnce(new AiCompatibilityError('兼容错误'));
    await panel.get('[data-testid=consent]').setValue(true); await panel.get('[data-testid=start]').trigger('click'); await flushPromises();
    expect(panel.text()).toContain('兼容模式：'); expect(panel.find('[data-testid=retry]').exists()).toBe(true); expect(requestAiJson).toHaveBeenCalledTimes(1);
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel');
    await expect((panel.vm as unknown as { beforeClose(): Promise<boolean> }).beforeClose()).resolves.toBe(false);
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
  });
  it('requires fresh consent after a service/model change', async () => {
    const { wrapper: panel } = setup();
    await panel.get('[data-testid=consent]').setValue(true);
    saveAiModelSettings({ presetId: 'custom', baseUrl: 'https://other.test/v1', model: 'other-model' }); window.dispatchEvent(new Event('focus')); await flushPromises();
    expect((panel.get('[data-testid=consent]').element as HTMLInputElement).checked).toBe(false); expect(panel.get('[data-testid=start]').attributes('disabled')).toBeDefined();
  });
  it('only sends incoming facts after individually checking them', async () => {
    const { wrapper: panel, workspace } = setup([{ id: 'answer-1', text: '本人执行了集成测试', targetId: 'basic' }]);
    await panel.findAll('fieldset input[type=checkbox]')[1]!.setValue(true);
    vi.mocked(requestAiJson).mockResolvedValueOnce(analysis);
    await panel.get('[data-testid=consent]').setValue(true); await panel.get('[data-testid=start]').trigger('click'); await flushPromises();
    expect(workspace.run?.facts).toEqual([{ id: 'answer-1', text: '本人执行了集成测试', targetId: 'basic' }]);
    expect(vi.mocked(requestAiJson).mock.calls[0]![2]).toMatchObject({ confirmedFacts: workspace.run?.facts });
  });
  it('loads a different source before current-mode import and blocks repeated application', async () => {
    const { wrapper: panel, store, resume } = setup();
    const original = JSON.parse(JSON.stringify(resume));
    const load = vi.spyOn(store, 'loadResume').mockImplementation(async () => { store.data = original; });
    const importData = vi.spyOn(store, 'importData').mockResolvedValue();
    vi.mocked(requestAiJson).mockResolvedValueOnce(analysis).mockResolvedValueOnce({ suggestions: [suggestions[0]] }).mockResolvedValueOnce({ reviews: [{ id: 's1', status: 'pass', reason: '有来源' }] });
    await startAndSkip(panel); await panel.get('.suggestion input').setValue(true);
    store.data = { ...original, id: 'other-resume' };
    await panel.findAll('select')[1]!.setValue('current');
    await panel.findAll('label.check').find(label => label.text().includes('明确同意更新来源简历'))!.get('input').setValue(true);
    await Promise.all([panel.get('[data-testid=apply]').trigger('click'), panel.get('[data-testid=apply]').trigger('click')]); await flushPromises();
    expect(load).toHaveBeenCalledWith(original.id); expect(importData).toHaveBeenCalledTimes(1);
  });
  it('saves and restores supplementation drafts without promoting them to facts or making requests', async () => {
    const { wrapper: panel, workspace } = setup();
    vi.mocked(requestAiJson).mockResolvedValueOnce(analysis);
    await panel.get('[data-testid=consent]').setValue(true); await panel.get('[data-testid=start]').trigger('click'); await flushPromises();
    await panel.get('.question textarea').setValue('尚未确认的草稿');
    expect(aiWorkspaceRepository.save).not.toHaveBeenCalled();
    await panel.findAll('label.check').find(label => label.text().includes('保存到本机'))!.get('input').setValue(true); await flushPromises();
    expect(aiWorkspaceRepository.save).toHaveBeenCalled();
    const saved = JSON.parse(JSON.stringify(workspace.run));
    workspace.reset(); workspace.history = [saved];
    vi.mocked(aiWorkspaceRepository.get).mockResolvedValueOnce(saved); await flushPromises();
    await panel.get('.history-row button').trigger('click'); await flushPromises();
    expect((panel.get('.question textarea').element as HTMLTextAreaElement).value).toBe('尚未确认的草稿');
    expect((panel.get('[data-testid=consent]').element as HTMLInputElement).checked).toBe(false);
    expect(workspace.run?.facts).toEqual([]); expect(requestAiJson).toHaveBeenCalledTimes(1);
    await panel.findAll('.history-row button')[1]!.trigger('click'); await flushPromises();
    expect(aiWorkspaceRepository.delete).toHaveBeenCalledWith('optimization', saved.id);
  });
  it('allows users to reject a selected pass suggestion without applying it', async () => {
    const { wrapper: panel, workspace } = setup();
    vi.mocked(requestAiJson).mockResolvedValueOnce(analysis).mockResolvedValueOnce({ suggestions: [suggestions[0]] }).mockResolvedValueOnce({ reviews: [{ id: 's1', status: 'pass', reason: '有来源' }] });
    await startAndSkip(panel); await panel.get('.suggestion input').setValue(true);
    await panel.get('.suggestion button').trigger('click'); await flushPromises();
    expect(workspace.run?.suggestions[0]?.rejected).toBe(true); expect(workspace.run?.suggestions[0]?.selected).toBe(false);
    expect(panel.get('[data-testid=apply]').attributes('disabled')).toBeDefined();
  });
});
