import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useInterviewStore } from '@/stores/interview';
import { requestAiJson, AiCompatibilityError, type AiRequestOptions } from '@/services/ai/AiClient';
import { aiWorkspaceRepository } from '@/services/ai/AiWorkspaceRepository';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { confirmedInterviewFacts, interviewerData, parseInterviewReport, exportInterviewMarkdown } from '@/services/ai/interview';
import type { InterviewSettings, InterviewSession } from '@/types/interview';
vi.mock('@/services/ai/AiClient', async importOriginal => ({ ...await importOriginal<typeof import('@/services/ai/AiClient')>(), requestAiJson: vi.fn() }));
vi.mock('@/services/ai/AiWorkspaceRepository', () => ({ aiWorkspaceRepository: { save: vi.fn(), get: vi.fn(), list: vi.fn(), delete: vi.fn(), clear: vi.fn() } }));
const client = vi.mocked(requestAiJson);
const config = { baseUrl: 'https://api.test/v1', model: 'test-model', apiKey: 'secret-key' };
const settings: InterviewSettings = { targetRole: '工程师', jd: '', level: '初级', direction: '项目深挖', mode: 'real', mainQuestionLimit: 5 };
const question = { text: '请说明你的贡献', focus: '个人职责', kind: 'experience', itemIds: ['project-1'] };
const initialization = { coveragePlan: ['职责', '实现', '取舍', '验证', '失败'], question };
const report = () => ({ observations: [], followupReview: [], priorities: ['练习一', '练习二', '练习三'], facts: [], referenceFacts: [], knowledgeExplanation: '' });
function resume() {
  const result = parseResumeMarkdown('# 私密姓名').resume;
  result.basic.phone = 'private-phone'; result.basic.email = 'private-email';
  result.projects = [{ id: 'project-1', name: '项目', role: '开发', startDate: '', endDate: '', description: '实现缓存' }];
  return result;
}
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function start(mode: 'real' | 'training' = 'real', persistence = false) {
  const store = useInterviewStore(); client.mockResolvedValueOnce(initialization);
  await store.start(resume(), { ...settings, mode }, config, { consent: true, persistence }); return store;
}
beforeEach(() => { vi.resetAllMocks(); setActivePinia(createPinia()); vi.mocked(aiWorkspaceRepository.save).mockResolvedValue(); });
describe('interview orchestration with mocked JSON transport', () => {
  it('allows local keyless interview with JSON disabled and rejects remote keyless config', async () => {
    const local = { ...config, baseUrl: 'http://localhost:1234/v1', apiKey: '', authMode: 'none' as const, jsonMode: false, timeoutMs: 180000 };
    const store = useInterviewStore(); client.mockResolvedValueOnce(initialization);
    await store.start(resume(), settings, local, { consent: true });
    expect(store.session?.status).toBe('answering');
    expect(client.mock.calls[0]![0]).toMatchObject(local);
    expect(client.mock.calls[0]![3]?.jsonMode).toBe(false);
    expect(store.confirmProvider({ ...local, baseUrl: 'https://remote.test/v1' }, true)).toBe(false);
  });
  it('requires opt-in consent, freezes privacy-safe context, excludes key, and never saves by default', async () => {
    const store = useInterviewStore(); const source = resume();
    await store.start(source, settings, config, { consent: false }); expect(client).not.toHaveBeenCalled();
    client.mockResolvedValueOnce(initialization); await store.start(source, settings, config, { consent: true });
    source.projects[0]!.description = 'later edit';
    expect(store.session!.context.projects[0]!.description).toBe('实现缓存');
    expect(JSON.stringify(store.session)).not.toMatch(/secret-key|private-phone|private-email|私密姓名/);
    expect(aiWorkspaceRepository.save).not.toHaveBeenCalled();
  });
  it('real mode uses no coach until final report, manual continue, preserves raw unknown, marks early finish incomplete', async () => {
    const store = await start(); await store.submitAnswer('  不知道  ');
    expect(client).toHaveBeenCalledTimes(1); expect(store.currentTurn!.answer).toBe('  不知道  ');
    expect(store.currentTurn!.feedback).toBeUndefined();
    client.mockResolvedValueOnce({ action: 'main', question }); await store.continueInterview();
    expect(client.mock.calls[1]![1]).toContain('You are the interviewer');
    client.mockResolvedValueOnce(report()); await store.finish();
    expect(client.mock.calls[2]![1]).toContain('final interview coach');
    expect(store.session!.report!.incomplete).toBe(true); expect(store.session!.status).toBe('completed');
  });
  it('training gives feedback before manually continuing; interviewer never receives feedback or reference answers', async () => {
    const store = await start('training');
    client.mockResolvedValueOnce({ observations: [], organizationHint: 'COACH_PRIVATE_HINT', knowledgeExplanation: 'GENERAL_KNOWLEDGE', referenceFacts: [] });
    await store.submitAnswer('我实现缓存'); expect(store.currentTurn!.feedback!.organizationHint).toBe('COACH_PRIVATE_HINT');
    expect(store.session!.turns).toHaveLength(1); expect(client).toHaveBeenCalledTimes(2);
    client.mockResolvedValueOnce({ action: 'followup', question }); await store.continueInterview();
    expect(JSON.stringify(client.mock.calls[2]![2])).not.toMatch(/COACH_PRIVATE_HINT|GENERAL_KNOWLEDGE|feedback|referencePhrasing/);
    expect(store.currentTurn!.followup).toBe(true); expect(store.currentTurn!.mainNumber).toBe(1);
  });
  it('rejects blank answers but accepts explicit skip, forbids a followup on a skipped question', async () => {
    const store = await start(); await store.submitAnswer(' \n '); expect(store.currentTurn!.submittedAt).toBeUndefined();
    await store.submitAnswer('', true); expect(store.currentTurn!.skipped).toBe(true);
    client.mockResolvedValueOnce({ action: 'followup', question }); await store.continueInterview();
    expect(store.session!.status).toBe('failed'); expect(store.session!.turns).toHaveLength(1);
    expect(store.currentTurn!.answer).toBe('');
  });
  it.each([5, 8, 12] as const)('enforces %i main questions and one followup each without automatic report calls', async limit => {
    const store = useInterviewStore(); client.mockResolvedValueOnce({ ...initialization, coveragePlan: Array.from({ length: limit }, (_, i) => `topic ${i}`) });
    await store.start(resume(), { ...settings, mainQuestionLimit: limit }, config, { consent: true });
    for (let i = 1; i <= limit; i++) {
      await store.submitAnswer(`真实回答 ${i}`); client.mockResolvedValueOnce({ action: 'followup', question }); await store.continueInterview();
      expect(store.currentTurn!.followup).toBe(true); await store.submitAnswer('追问原回答');
      if (i < limit) client.mockResolvedValueOnce({ action: 'main', question });
      await store.continueInterview();
    }
    expect(store.session!.turns).toHaveLength(limit * 2); expect(store.session!.ending).toBe(true); expect(store.session!.report).toBeUndefined();
    expect(client).toHaveBeenCalledTimes(limit * 2); // initialize + followups + next mains; bounded terminal transition is local
    client.mockResolvedValueOnce(report()); await store.continueInterview(); expect(store.session!.report!.incomplete).toBe(false);
  });
  it('rejects a second followup and retries only the failed next step without duplicating submissions', async () => {
    const store = await start(); await store.submitAnswer('原回答'); client.mockResolvedValueOnce({ action: 'followup', question }); await store.continueInterview();
    await store.submitAnswer('追问回答'); client.mockResolvedValueOnce({ action: 'followup', question }); await store.continueInterview();
    expect(store.session!.turns).toHaveLength(2); expect(store.session!.status).toBe('failed');
    client.mockResolvedValueOnce({ action: 'main', question }); await store.retry();
    expect(store.session!.turns).toHaveLength(3); expect(store.session!.turns[1]!.answer).toBe('追问回答');
  });
  it('guards double submit, continue, and finish; a failed coach retains the submitted answer and retry does not append turns', async () => {
    const store = await start('training'); const first = deferred<unknown>(); client.mockReturnValueOnce(first.promise);
    const submitting = store.submitAnswer('我实现缓存'); await store.submitAnswer('duplicate'); await store.continueInterview();
    expect(client).toHaveBeenCalledTimes(2); first.reject(new Error('offline')); await submitting;
    expect(store.currentTurn!.answer).toBe('我实现缓存'); expect(store.session!.turns).toHaveLength(1);
    client.mockResolvedValueOnce({ observations: [], organizationHint: '', knowledgeExplanation: '', referenceFacts: [] }); await store.retry();
    expect(store.session!.turns).toHaveLength(1); expect(store.currentTurn!.answer).toBe('我实现缓存');
    const next = deferred<unknown>(); client.mockReturnValueOnce(next.promise); const continuing = store.continueInterview(); await store.continueInterview();
    expect(client).toHaveBeenCalledTimes(4); next.resolve({ action: 'main', question }); await continuing;
    const final = deferred<unknown>(); client.mockReturnValueOnce(final.promise); const finishing = store.finish(); await store.finish();
    expect(client).toHaveBeenCalledTimes(5); final.resolve(report()); await finishing;
  });
  it('abort/pause ignores stale responses and resume never automatically calls the model', async () => {
    const store = await start(); await store.submitAnswer('原回答'); const pending = deferred<unknown>(); client.mockReturnValueOnce(pending.promise);
    const request = store.continueInterview(); const signal = client.mock.calls[1]![3]!.signal!; store.pause();
    expect(signal.aborted).toBe(true); pending.resolve({ action: 'main', question }); await request;
    expect(store.session!.turns).toHaveLength(1); expect(store.session!.status).toBe('paused');
    store.resume(); expect(client).toHaveBeenCalledTimes(2); expect(store.session!.status).toBe('failed');
    client.mockResolvedValueOnce({ action: 'main', question }); await store.retry(); expect(store.session!.turns).toHaveLength(2);
  });
  it('only exposes compatible JSON mode after explicit error and accumulates usage', async () => {
    const store = useInterviewStore(); client.mockRejectedValueOnce(new AiCompatibilityError('JSON unsupported'));
    await store.start(resume(), settings, config, { consent: true }); expect(store.compatibilityError).toBe(true);
    store.enableCompatibilityMode();
    client.mockImplementationOnce(async (_config, _prompt, _data, opts?: AiRequestOptions) => { expect(opts!.jsonMode).toBe(false); opts!.onUsage!({ calls: 1, promptTokens: 10, completionTokens: 20 }); return initialization; });
    await store.retry(); expect(store.session!.usage).toEqual({ calls: 2, promptTokens: 10, completionTokens: 20 });
  });
  it('opt-in saves checkpoints, restores running as interrupted, needs reconsent, and never auto-requests on restore', async () => {
    const store = await start('real', true); await store.submitAnswer('已保存原回答');
    const snapshot = JSON.parse(JSON.stringify(store.session)) as InterviewSession; snapshot.status = 'running'; snapshot.pendingStage = 'next';
    expect(aiWorkspaceRepository.save).toHaveBeenCalled(); expect(JSON.stringify(vi.mocked(aiWorkspaceRepository.save).mock.calls)).not.toContain('secret-key');
    vi.mocked(aiWorkspaceRepository.get).mockResolvedValueOnce(snapshot); const before = client.mock.calls.length;
    await store.restore(snapshot.id); expect(store.session!.status).toBe('interrupted'); expect(store.currentTurn!.answer).toBe('已保存原回答');
    expect(store.consented).toBe(false); expect(client).toHaveBeenCalledTimes(before); store.resume(); await store.retry(); expect(client).toHaveBeenCalledTimes(before);
    store.confirmProvider({ ...config, model: 'changed-model' }, true); client.mockResolvedValueOnce({ action: 'main', question }); await store.retry();
    expect(client.mock.calls[before]![0].model).toBe('changed-model');
  });
  it('shows storage failure, keeps the answer, and supports memory-only continuation', async () => {
    vi.mocked(aiWorkspaceRepository.save).mockRejectedValue(new Error('quota')); const store = await start('real', true);
    await store.submitAnswer('不会丢失'); expect(store.storageError).toContain('quota'); expect(store.unsaved).toBe(true);
    await store.setPersistence(false); expect(store.currentTurn!.answer).toBe('不会丢失');
    client.mockResolvedValueOnce({ action: 'main', question }); await store.continueInterview(); expect(store.session!.turns).toHaveLength(2);
  });
  it('revokes a queued checkpoint before it starts writing', async () => {
    const store = await start('real', true);
    const save = vi.mocked(aiWorkspaceRepository.save);
    save.mockClear();
    const pending = store.checkpoint();
    await store.setPersistence(false);
    await pending;
    expect(save).not.toHaveBeenCalled();
    expect(store.unsaved).toBe(true);
  });

  it('does not revive revoked snapshots when persistence is re-enabled behind an active write', async () => {
    const store = await start('real', true);
    const active = deferred<void>();
    const save = vi.mocked(aiWorkspaceRepository.save);
    save.mockClear();
    save.mockReturnValueOnce(active.promise);
    const first = store.checkpoint();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    store.session!.settings.targetRole = '撤销的旧快照';
    const revoked = store.checkpoint();
    await store.setPersistence(false);
    store.session!.settings.targetRole = '重新授权的新快照';
    const enabled = store.setPersistence(true);
    active.resolve();
    await Promise.all([first, revoked, enabled]);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.lastCall![1]).toMatchObject({ settings: { targetRole: '重新授权的新快照' } });
    expect(store.unsaved).toBe(false);
  });

  it('ignores failures from an already started write after memory-only mode is chosen', async () => {
    const store = await start('real', true);
    const active = deferred<void>();
    vi.mocked(aiWorkspaceRepository.save).mockReturnValueOnce(active.promise);
    const pending = store.checkpoint();
    await Promise.resolve();
    await store.setPersistence(false);
    active.reject(new Error('old write failed'));
    await pending;
    expect(store.storageError).toBe('');
    expect(store.unsaved).toBe(true);
  });
});
describe('report validation and fact handoff provenance', () => {
  it('accepts only cited raw snippets, three priorities, and explicit confirmation of an existing target', async () => {
    const store = await start(); await store.submitAnswer('我实现缓存并验证命中率'); const answerId = store.currentTurn!.id;
    const raw = { ...report(), facts: [{ answerId, text: '我实现缓存' }], referenceFacts: [{ sourceId: answerId, snippet: '我实现缓存' }], observations: [{ category: 'expression', text: '说明验证方式', verification: 'context-supported', evidence: [{ sourceId: answerId, snippet: '验证命中率' }] }] };
    store.session!.report = parseInterviewReport(raw, store.session!); expect(store.session!.report!.observations[0]!.verification).toBe('needs-verification');
    const factId = store.session!.report.facts[0]!.id;
    expect(confirmedInterviewFacts(store.session!, [{ factId, targetId: 'project-1', confirmed: false }], ['project-1'])).toEqual([]);
    expect(confirmedInterviewFacts(store.session!, [{ factId, targetId: 'project-1', confirmed: true }], ['project-1'])).toEqual([{ id: factId, text: '我实现缓存', targetId: 'project-1' }]);
    expect(() => confirmedInterviewFacts(store.session!, [{ factId, targetId: 'deleted', confirmed: true }], ['project-1'])).toThrow();
    expect(exportInterviewMarkdown(store.session!)).toContain('不完整报告'); expect(exportInterviewMarkdown(store.session!)).toContain('验证命中率');
    expect(JSON.stringify(interviewerData(store.session!))).not.toContain('说明验证方式');
  });
  it('rejects invented, coach-sourced, blank, nonexistent, skipped or unsubmitted fact citations and scores', async () => {
    const store = await start(); await store.submitAnswer('真实内容'); const answerId = store.currentTurn!.id;
    for (const facts of [[{ answerId, text: '教练建议' }], [{ answerId: 'missing', text: '真实内容' }], [{ answerId, text: ' ' }]]) {
      expect(() => parseInterviewReport({ ...report(), facts }, store.session!)).toThrow();
    }
    expect(() => parseInterviewReport({ ...report(), score: 90 }, store.session!)).toThrow();
    expect(() => parseInterviewReport({ ...report(), priorities: ['only one'] }, store.session!)).toThrow();
    expect(() => parseInterviewReport({ ...report(), referenceFacts: [{ sourceId: 'projects.project-1.description', snippet: '实现缓存' }] }, store.session!)).toThrow();
    store.currentTurn!.skipped = true; expect(() => parseInterviewReport({ ...report(), facts: [{ answerId, text: '真实内容' }] }, store.session!)).toThrow();
    store.currentTurn!.skipped = false; delete store.currentTurn!.submittedAt; expect(() => parseInterviewReport({ ...report(), facts: [{ answerId, text: '真实内容' }] }, store.session!)).toThrow();
  });
  it('validates question item references, lengths, coverage plan, and no output score fields', async () => {
    const store = useInterviewStore();
    client.mockResolvedValueOnce({ ...initialization, question: { ...question, itemIds: ['missing'] } }); await store.start(resume(), settings, config, { consent: true }); expect(store.session!.turns).toHaveLength(0);
    client.mockResolvedValueOnce({ ...initialization, coveragePlan: ['only one'] }); await store.retry(); expect(store.session!.status).toBe('failed');
    client.mockResolvedValueOnce({ ...initialization, question: { ...question, text: 'x'.repeat(2001) } }); await store.retry(); expect(store.session!.turns).toHaveLength(0);
    client.mockResolvedValueOnce({ ...initialization, question: { ...question, score: 95 } }); await store.retry(); expect(store.session!.turns).toHaveLength(0);
  });
});
