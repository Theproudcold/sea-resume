import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { AiProviderConfig } from '@/types/ai';
import type { ResumeData } from '@/types/resume';
import type { InterviewSession, InterviewSettings, InterviewStage, InterviewQuestion } from '@/types/interview';
import { buildResumeContext } from '@/services/ai/resumeContext';
import { initializeInterview, nextInterviewQuestion, coachInterviewAnswer, reportInterview } from '@/services/ai/interview';
import { AiCompatibilityError, emptyAiUsage, addAiUsage } from '@/services/ai/AiClient';
import { aiWorkspaceRepository } from '@/services/ai/AiWorkspaceRepository';
import { generateId } from '@/utils/helpers';
import { isAiProviderReady } from '@/services/ai/AiSettings';

export const useInterviewStore = defineStore('interview', () => {
  const session = ref<InterviewSession | null>(null);
  const busy = ref(false);
  const error = ref('');
  const storageError = ref('');
  const compatibilityError = ref(false);
  const consented = ref(false);
  const dirty = ref(false);
  let provider: AiProviderConfig | null = null; // credentials live only in this closure, never in records
  let controller: AbortController | null = null;
  let epoch = 0;
  let revision = 0;
  let saveQueue: Promise<void> = Promise.resolve();
  let persistenceGeneration = 0;
  const currentTurn = computed(() => session.value?.turns[session.value.turns.length - 1]);
  const unsaved = computed(() => !!session.value && (!session.value.persistence || dirty.value || !!storageError.value));

  function markChanged() {
    revision++;
    dirty.value = true;
    if (session.value) session.value.updatedAt = new Date().toISOString();
  }
  async function checkpoint() {
    const current = session.value;
    if (!current?.persistence) return;
    const snapshot = JSON.parse(JSON.stringify(current)) as InterviewSession;
    const savedRevision = revision;
    const savedPersistenceGeneration = persistenceGeneration;
    saveQueue = saveQueue.then(async () => {
      // Opting out revokes queued snapshots, even if saving is enabled again
      // before a slow preceding write finishes. Active writes cannot be undone.
      if (savedPersistenceGeneration !== persistenceGeneration || !current.persistence) return;
      try {
        await aiWorkspaceRepository.save('interview', snapshot);
        if (savedPersistenceGeneration === persistenceGeneration && session.value?.id === snapshot.id && revision === savedRevision) { dirty.value = false; storageError.value = ''; }
      } catch (cause) {
        if (savedPersistenceGeneration === persistenceGeneration && session.value?.id === snapshot.id) storageError.value = `本机保存失败，当前仅在内存：${cause instanceof Error ? cause.message : '存储不可用'}`;
      }
    });
    await saveQueue;
  }
  async function setPersistence(enabled: boolean) {
    if (!session.value) return;
    persistenceGeneration++;
    session.value.persistence = enabled;
    storageError.value = '';
    markChanged();
    if (enabled) await checkpoint();
  }
  function confirmProvider(config: AiProviderConfig, consent: boolean) {
    if (busy.value) pause();
    consented.value = false;
    provider = null;
    if (!consent || !isAiProviderReady(config, config.apiKey)) {
      error.value = '请预览发送内容、配置本次 API Key，并明确同意。';
      return false;
    }
    provider = { ...config };
    consented.value = true;
    error.value = '';
    if (session.value) {
      session.value.provider = { baseUrl: config.baseUrl, model: config.model };
      markChanged(); void checkpoint();
    }
    return true;
  }
  function revokeConsent() { consented.value = false; provider = null; if (busy.value) pause(); }
  function canRequest() {
    if (!session.value || busy.value) return false;
    if (!consented.value || !provider || provider.baseUrl !== session.value.provider.baseUrl || provider.model !== session.value.provider.model) {
      error.value = '需要重新确认服务商、模型及发送范围（恢复后请重新输入 API Key）。';
      return false;
    }
    return true;
  }
  function addQuestion(question: InterviewQuestion, mainNumber: number, followup: boolean) {
    const s = session.value!;
    if (mainNumber > s.settings.mainQuestionLimit || s.turns.length >= s.settings.mainQuestionLimit * 2 || (followup && s.turns.some(t => t.mainNumber === mainNumber && t.followup))) throw new Error('已达到面试轮次上限。');
    s.turns.push({ id: generateId(), question, mainNumber, followup });
    s.status = 'answering';
  }
  async function run(stage: InterviewStage) {
    if (!canRequest()) return;
    const s = session.value!;
    const requestProvider = { ...provider! };
    const requestEpoch = ++epoch;
    controller = new AbortController();
    const signal = controller.signal;
    busy.value = true; error.value = ''; compatibilityError.value = false;
    s.pendingStage = stage; s.status = 'running';
    const last = currentTurn.value;
    // Count paid attempts (including failures), but not a bounded local terminal transition.
    if (stage !== 'next' || (last && (last.mainNumber < s.settings.mainQuestionLimit || (!last.followup && !last.skipped)))) s.usage.calls++;
    markChanged(); void checkpoint();
    const options = { signal, jsonMode: s.jsonMode === false ? false : requestProvider.jsonMode, onUsage: (usage: ReturnType<typeof emptyAiUsage>) => {
      if (requestEpoch === epoch && session.value?.id === s.id) { addAiUsage(s.usage, { ...usage, calls: 0 }); markChanged(); }
    } };
    const active = () => requestEpoch === epoch && session.value?.id === s.id && !signal.aborted;
    try {
      if (stage === 'initialize') {
        const result = await initializeInterview(requestProvider, s, options);
        if (!active()) return;
        s.coveragePlan = result.coveragePlan; addQuestion(result.question, 1, false);
      } else if (stage === 'coach') {
        const turn = s.turns[s.turns.length - 1]!;
        const result = await coachInterviewAnswer(requestProvider, s, options);
        if (!active()) return;
        turn.feedback = result; s.status = 'reviewing';
      } else if (stage === 'next') {
        const result = await nextInterviewQuestion(requestProvider, s, options);
        if (!active()) return;
        if (result) {
          const last = s.turns[s.turns.length - 1]!;
          addQuestion(result.question, result.action === 'followup' ? last.mainNumber : last.mainNumber + 1, result.action === 'followup');
        } else { s.ending = true; s.status = 'reviewing'; }
      } else {
        const result = await reportInterview(requestProvider, s, options);
        if (!active()) return;
        s.report = result; s.status = 'completed';
      }
      s.pendingStage = null; markChanged();
    } catch (cause) {
      if (!active()) return;
      s.status = 'failed'; error.value = cause instanceof Error ? cause.message : '请求失败，请手动重试本步骤。';
      compatibilityError.value = cause instanceof AiCompatibilityError;
      markChanged();
    } finally {
      if (requestEpoch === epoch) { busy.value = false; controller = null; await checkpoint(); }
    }
  }
  async function start(resume: ResumeData, settings: InterviewSettings, config: AiProviderConfig, options: { consent: boolean; persistence?: boolean; generalizeOrganizations?: boolean }) {
    if (busy.value) return;
    if (![5, 8, 12].includes(settings.mainQuestionLimit) || !['training', 'real'].includes(settings.mode) || !['综合', '项目深挖', '岗位专业', '行为面试'].includes(settings.direction) || settings.jd.length > 15000 || settings.targetRole.length > 200 || settings.level.length > 200) { error.value = '面试设置无效或文本过长。'; return; }
    if (!confirmProvider(config, options.consent)) return;
    epoch++; revision = 0; dirty.value = true; storageError.value = '';
    const now = new Date().toISOString();
    session.value = { id: generateId(), sourceResumeId: resume.id, context: buildResumeContext(resume, options), settings: { ...settings }, provider: { baseUrl: config.baseUrl, model: config.model }, createdAt: now, updatedAt: now, status: 'ready', pendingStage: null, coveragePlan: [], turns: [], usage: emptyAiUsage(), persistence: options.persistence === true, jsonMode: true, ending: false };
    await run('initialize');
  }
  async function submitAnswer(answer: string, skipped = false) {
    const s = session.value; const turn = currentTurn.value;
    if (!s || busy.value || s.status !== 'answering' || !turn || turn.submittedAt || s.ending) return;
    if (!skipped && (!answer.trim() || answer.length > 10000)) { error.value = '请输入非空回答（最多 10000 字），或明确跳过。'; return; }
    // Preserve exactly the user's submitted text; no synthesized unknown/skip answers.
    turn.answer = skipped ? '' : answer; turn.skipped = skipped; turn.submittedAt = new Date().toISOString();
    s.status = 'reviewing'; error.value = ''; markChanged();
    // Set review state before yielding so double-clicks cannot submit twice.
    if (s.settings.mode === 'training' && !skipped) await run('coach');
    else await checkpoint();
  }
  async function continueInterview() {
    const s = session.value;
    if (!s || busy.value || s.status === 'completed' || s.status === 'failed' || s.status === 'paused' || s.status === 'interrupted') return;
    if (s.ending) { await run('report'); return; }
    if (!currentTurn.value?.submittedAt) return;
    await run('next');
  }
  function pause() {
    if (!session.value || session.value.status === 'completed') return;
    ++epoch; controller?.abort(); controller = null; busy.value = false;
    session.value.status = 'paused'; markChanged(); void checkpoint();
  }
  function resume() {
    const s = session.value;
    if (!s || busy.value || !['paused', 'interrupted'].includes(s.status)) return;
    s.status = s.pendingStage ? 'failed' : currentTurn.value?.submittedAt || s.ending ? 'reviewing' : s.turns.length ? 'answering' : 'ready';
    markChanged(); void checkpoint(); // never automatically requests, including on recovery
  }
  async function finish() {
    const s = session.value;
    if (!s || s.status === 'completed' || (busy.value && s.pendingStage === 'report')) return;
    if (busy.value) pause();
    s.ending = true; s.pendingStage = 'report'; s.status = 'reviewing'; markChanged(); void checkpoint();
    await run('report');
  }
  async function retry() {
    if (session.value?.pendingStage && !busy.value && session.value.status === 'failed') await run(session.value.pendingStage);
  }
  function enableCompatibilityMode() {
    if (!compatibilityError.value || !session.value || busy.value) return;
    session.value.jsonMode = false; compatibilityError.value = false; markChanged(); void checkpoint();
  }
  async function restore(id: string) {
    reset();
    const restoreEpoch = epoch;
    try {
      const record = await aiWorkspaceRepository.get<InterviewSession>('interview', id);
      if (restoreEpoch !== epoch) return;
      if (!record) throw new Error('面试记录不存在或已删除。');
      if (!record.context || !Array.isArray(record.turns) || ![5, 8, 12].includes(record.settings?.mainQuestionLimit) || record.turns.length > record.settings.mainQuestionLimit * 2) throw new Error('面试记录结构无效。');
      // Explicitly reconstruct nonsecret provider identity even for legacy records.
      record.provider = { baseUrl: record.provider.baseUrl, model: record.provider.model };
      session.value = record;
      record.persistence = true;
      if (record.status !== 'completed') record.status = 'interrupted';
      dirty.value = false; storageError.value = '';
    } catch (cause) { if (restoreEpoch === epoch) error.value = cause instanceof Error ? cause.message : '读取面试失败。'; }
  }
  function reset() {
    ++epoch; controller?.abort(); controller = null; provider = null;
    busy.value = false; consented.value = false; session.value = null;
    error.value = ''; compatibilityError.value = false; storageError.value = ''; dirty.value = false;
  }
  return { session, busy, error, storageError, compatibilityError, consented, dirty, currentTurn, unsaved, start, submitAnswer, continueInterview, pause, resume, finish, retry, restore, reset, checkpoint, setPersistence, confirmProvider, revokeConsent, enableCompatibilityMode };
});
