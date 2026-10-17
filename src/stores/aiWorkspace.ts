import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { ResumeData } from '@/types/resume';
import type { AiProviderConfig, OptimizationFact, OptimizationOptions, OptimizationStep, ResumeOptimizationRun } from '@/types/ai';
import { AiCompatibilityError, addAiUsage } from '@/services/ai/AiClient';
import { aiWorkspaceRepository } from '@/services/ai/AiWorkspaceRepository';
import { analyzeResume, createOptimizationRun, rewriteResume, reviewResume, restoreOptimizationRun, validateOptimizationFacts } from '@/services/ai/resumeOptimization';
import { isAiProviderReady } from '@/services/ai/AiSettings';

/** A bounded role pipeline, not autonomous agents. Credentials never enter store state. */
export const useAiWorkspaceStore = defineStore('aiWorkspace', () => {
  const run = ref<ResumeOptimizationRun | null>(null);
  const busy = ref(false);
  const error = ref('');
  const compatibilityError = ref(false);
  const saveLocally = ref(false);
  const storageError = ref('');
  const dirty = ref(false);
  const history = ref<ResumeOptimizationRun[]>([]);
  let controller: AbortController | undefined;
  let epoch = 0;
  let revision = 0;
  let writes: Promise<void> = Promise.resolve();
  const unsaved = computed(() => !!run.value && dirty.value);
  function changed() { revision++; dirty.value = true; if (run.value) run.value.updatedAt = new Date().toISOString(); }
  async function persist(): Promise<void> {
    if (!saveLocally.value || !run.value) return;
    const snapshot = JSON.parse(JSON.stringify(run.value)) as ResumeOptimizationRun;
    const stamp = revision;
    writes = writes.catch(() => undefined).then(async () => {
      if (!saveLocally.value) return;
      try {
        await aiWorkspaceRepository.save('optimization', snapshot);
        if (run.value?.id === snapshot.id && revision === stamp) { dirty.value = false; storageError.value = ''; }
      } catch (cause) { storageError.value = `保存失败，当前仅内存保留：${cause instanceof Error ? cause.message : '本机存储不可用'}`; }
    });
    await writes;
  }
  async function setPersistence(enabled: boolean) { saveLocally.value = enabled; if (enabled) await persist(); }
  function cancel() {
    epoch++; controller?.abort(); controller = undefined;
    if (run.value && busy.value && ['analysis', 'rewrite', 'review'].includes(run.value.stage)) { run.value.failedStep = run.value.stage as OptimizationStep; run.value.stage = 'cancelled'; changed(); void persist(); }
    busy.value = false;
  }
  function reset() { cancel(); run.value = null; error.value = ''; storageError.value = ''; compatibilityError.value = false; dirty.value = false; revision++; }
  function authorized(config: AiProviderConfig, consent: boolean): boolean {
    if (!consent) { error.value = '请先确认发送范围。'; return false; }
    if (!isAiProviderReady(config, config.apiKey)) { error.value = '请配置有效模型服务及所需会话 API Key。'; return false; }
    if (run.value && (run.value.provider.baseUrl !== config.baseUrl || run.value.provider.model !== config.model)) { error.value = '服务或模型已改变，请重新生成并确认发送范围。'; return false; }
    return true;
  }
  async function execute(step: OptimizationStep, config: AiProviderConfig, consent: boolean, jsonMode?: boolean): Promise<boolean> {
    if (!run.value || busy.value || !authorized(config, consent)) return false;
    const current = run.value;
    const ticket = ++epoch;
    controller = new AbortController();
    busy.value = true; error.value = ''; current.stage = step; current.failedStep = step;
    // Count attempts, including failed/invalid responses; usage only adds returned tokens.
    current.usage.calls++; changed(); void persist();
    const options = { signal: controller.signal, jsonMode, onUsage: (usage: { calls: number; promptTokens: number; completionTokens: number }) => {
      if (ticket === epoch && run.value?.id === current.id) addAiUsage(current.usage, { ...usage, calls: 0 });
    } };
    try {
      if (step === 'analysis') {
        const analysis = await analyzeResume(config, current, options);
        if (ticket !== epoch) return false;
        current.analysis = analysis; current.stage = 'supplement';
      } else if (step === 'rewrite') {
        const suggestions = await rewriteResume(config, current, options);
        if (ticket !== epoch) return false;
        current.suggestions = suggestions; current.stage = 'review';
      } else {
        const suggestions = await reviewResume(config, current, options);
        if (ticket !== epoch) return false;
        current.suggestions = suggestions; current.stage = 'ready';
      }
      current.failedStep = undefined; changed(); await persist(); return ticket === epoch;
    } catch (cause) {
      if (ticket !== epoch) return false;
      current.stage = 'failed'; current.failedStep = step;
      compatibilityError.value = cause instanceof AiCompatibilityError;
      error.value = cause instanceof Error ? cause.message : '请求失败，请手动重试当前步骤。';
      changed(); await persist(); return false;
    } finally { if (ticket === epoch) { busy.value = false; controller = undefined; } }
  }
  async function start(source: ResumeData, options: OptimizationOptions, config: AiProviderConfig, consent: boolean, facts: OptimizationFact[] = []) {
    if (busy.value || !consent) return;
    reset();
    try { run.value = createOptimizationRun(source, options, config, facts); changed(); await execute('analysis', config, consent); }
    catch (cause) { error.value = cause instanceof Error ? cause.message : '配置无效。'; }
  }
  async function supplement(facts: OptimizationFact[], config: AiProviderConfig, consent: boolean, jsonMode?: boolean) {
    if (busy.value || run.value?.stage !== 'supplement' || !authorized(config, consent)) return;
    try { run.value.facts = validateOptimizationFacts(facts, run.value.context); changed(); }
    catch (cause) { error.value = cause instanceof Error ? cause.message : '补充事实无效。'; return; }
    if (await execute('rewrite', config, consent, jsonMode)) await execute('review', config, consent, jsonMode);
  }
  async function retry(config: AiProviderConfig, consent: boolean, jsonMode?: boolean) {
    if (busy.value || !run.value?.failedStep || !['failed', 'cancelled'].includes(run.value.stage)) return;
    const step = run.value.failedStep;
    if (await execute(step, config, consent, jsonMode) && step === 'rewrite') await execute('review', config, consent, jsonMode);
  }
  async function updateSupplementAnswer(id: string, text: string, confirmed: boolean) {
    if (run.value?.stage !== 'supplement' || busy.value || !run.value.analysis?.questions.some(q => q.id === id) || text.length > 3000) return;
    run.value.supplementAnswers ||= {};
    run.value.supplementAnswers[id] = { text, confirmed };
    changed(); await persist();
  }
  async function choose(id: string, choice: { selected?: boolean; confirmed?: boolean; rejected?: boolean }) {
    if (run.value?.stage !== 'ready' || busy.value) return;
    const suggestion = run.value.suggestions.find(s => s.id === id);
    if (!suggestion || suggestion.review === 'reject') return;
    Object.assign(suggestion, choice);
    if (suggestion.rejected) { suggestion.selected = false; suggestion.confirmed = false; }
    changed(); await persist();
  }
  async function complete(resumeId: string) {
    if (run.value?.stage !== 'ready') return;
    run.value.appliedResumeId = resumeId; run.value.stage = 'completed'; changed(); await persist();
  }
  async function refreshHistory() {
    try { history.value = await aiWorkspaceRepository.list<ResumeOptimizationRun>('optimization'); }
    catch (cause) { storageError.value = cause instanceof Error ? cause.message : '无法读取本机记录。'; }
  }
  async function restore(id: string) {
    if (busy.value) return;
    const ticket = ++epoch;
    try {
      const saved = await aiWorkspaceRepository.get<ResumeOptimizationRun>('optimization', id);
      if (ticket !== epoch) return;
      if (!saved) throw new Error('本机记录不存在。');
      const restored = restoreOptimizationRun(saved);
      cancel(); run.value = restored; saveLocally.value = true; compatibilityError.value = false; error.value = ''; changed();
      // No request, consent and API Key must be supplied again by the component.
    } catch (cause) { if (ticket === epoch) storageError.value = cause instanceof Error ? cause.message : '记录格式无效。'; }
  }
  async function deleteRun(id: string) {
    if (run.value?.id === id) cancel();
    try {
      await writes;
      await aiWorkspaceRepository.delete('optimization', id);
      if (run.value?.id === id) { saveLocally.value = false; dirty.value = true; }
      await refreshHistory();
    } catch (cause) { storageError.value = cause instanceof Error ? cause.message : '删除失败。'; }
  }
  return { run, busy, error, compatibilityError, saveLocally, storageError, dirty, unsaved, history, start, supplement, retry, cancel, reset, choose, complete, persist, setPersistence, refreshHistory, restore, deleteRun, updateSupplementAnswer };
});
