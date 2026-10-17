<template>
  <section class="optimization-panel" aria-label="简历优化">
    <header><span class="panel-eyebrow">AI 简历工作室</span><h2>让真实经历，更清楚地被看见</h2><p>分析、补充、改写与单轮审查。通常 3 次模型调用，每项修改由你决定。</p></header>
    <AiWorkflowSteps :steps="['分析', '补充', '改写', '审查', '采纳']" :current="workflowIndex" :complete="workspace.run?.stage === 'completed'" label="简历优化步骤" />
    <div class="provider">
      <div><strong>{{ providerLabel }}</strong><p>{{ settings?.model || '未配置模型' }} · {{ keyAvailable ? '服务已就绪' : '需要完成服务配置' }}</p></div>
      <button type="button" @click="emit('configure')">配置模型 / 密钥</button>
      <button type="button" @click="refreshProvider">刷新配置</button>
    </div>
    <p class="notice">不发送照片、生日、姓名或联系方式；只发送可见白名单内容。正文、JD 和补充仍可能含敏感信息，请检查预览。自然表达不是 AI 率检测，不承诺规避检测。</p>
    <fieldset :disabled="workspace.busy || !!workspace.run || applying">
      <legend>目标与风格</legend>
      <div class="form-grid">
        <label>目标岗位（可选）<input v-model="options.target" maxlength="200" /></label>
        <label>目标公司（可选）<input v-model="options.company" maxlength="200" /></label>
      </div>
      <label>JD（可选；不提供时做通用诊断）<textarea v-model="options.jd" rows="4" maxlength="20000" /></label>
      <label>表达风格<select v-model="options.style"><option value="concise">简洁直接</option><option value="professional">专业克制</option></select></label>
      <label>个人表达样例（仅作风格参考，不视为事实）<textarea v-model="options.personalSample" rows="2" maxlength="3000" /></label>
      <label class="check"><input v-model="options.generalizeOrganizations" type="checkbox" />泛化公司 / 学校名称（始终禁止修改组织与日期）</label>
      <div v-if="incomingFacts.length" class="notice">
        <strong>面试回补事实：请再次逐项确认真实性和关联目标</strong>
        <label v-for="fact in incomingFacts" :key="fact.id" class="check"><input v-model="acceptedFacts[fact.id]" type="checkbox" />{{ fact.text }} · 关联：{{ fact.targetId }}</label>
        <p>仅用户原回答里的真实事实；教练提示、参考答案和知识讲解不是经历证据。</p>
      </div>
    </fieldset>
    <details><summary>发送预览（不含 API Key / 私有字段）</summary><pre data-testid="sending-preview">{{ sendingPreview }}</pre></details>
    <label class="check"><input v-model="consent" type="checkbox" :disabled="workspace.busy || applying" data-testid="consent" />我确认以上发送范围及当前服务 / 模型，允许本次固定流程发送。</label>
    <label class="check"><input :checked="workspace.saveLocally" type="checkbox" @change="workspace.setPersistence(checked($event))" />保存到本机（可选，未勾选仅内存保留）</label>
    <p class="muted">AI 记录仅在当前浏览器，不随简历目录迁移，不纳入全量简历备份。恢复需重新配置会话 API Key 和确认发送范围。</p>
    <p v-if="workspace.unsaved || answerDirty" class="notice">存在未保存的优化内容 / 补充输入，关闭或刷新可能丢失；可选择保存到本机。</p>
    <div class="actions">
      <button v-if="!workspace.run" type="button" data-testid="start" :disabled="!canSend" @click="start">开始分析</button>
      <button v-if="workspace.busy" type="button" @click="workspace.cancel">取消请求</button>
      <button v-if="workspace.run && !workspace.busy" type="button" :disabled="applying" @click="restart">重新配置 / 生成</button>
    </div>
    <div v-if="workspace.run" class="run-content">
      <p class="run-status" role="status"><strong>当前步骤：{{ stageLabel }}</strong><span>请求 {{ workspace.run.usage.calls }} 次 · 输入 {{ workspace.run.usage.promptTokens }} / 输出 {{ workspace.run.usage.completionTokens }} tokens（服务未返回时为 0）</span></p>
      <details v-if="workspace.run.analysis" open>
        <summary>简要分析结论与执行步骤（不是思维链）</summary>
        <p>{{ workspace.run.analysis.summary }}</p>
        <ul><li v-for="(issue, i) in workspace.run.analysis.issues" :key="i">{{ issue }}</li></ul>
        <div v-for="(match, i) in workspace.run.analysis.matches" :key="i" class="match"><strong>{{ match.requirement }}</strong><p>{{ match.assessment }}</p><small>来源：{{ match.sourceRefs.join('、') || '未找到现有证据' }}</small></div>
      </details>
      <div v-if="workspace.run.facts.length" class="notice"><strong>本次已确认事实</strong><p v-for="fact in workspace.run.facts" :key="fact.id">{{ fact.text }} · {{ fact.targetId }}</p></div>
      <form v-if="workspace.run.stage === 'supplement'" @submit.prevent="continueRun(false)">
        <h3>事实补充（最多 3 题，可跳过）</h3>
        <div v-for="question in workspace.run.analysis?.questions" :key="question.id" class="question">
          <label>{{ question.text }} · 关联：{{ question.targetId }}<textarea v-model="answers[question.id]" rows="3" maxlength="3000" /></label>
          <label class="check"><input v-model="answerConfirmed[question.id]" type="checkbox" />我确认这段补充是真实个人经历，可用于该目标条目</label>
        </div>
        <p v-if="!workspace.run.analysis?.questions.length">没有待补充问题，也可以继续。</p>
        <div class="actions"><button type="submit" data-testid="continue" :disabled="!canSend || invalidAnswers">确认补充并继续</button><button type="button" data-testid="skip" :disabled="!canSend" @click="continueRun(true)">跳过补充并继续</button></div>
      </form>
      <div v-if="['ready', 'completed'].includes(workspace.run.stage)">
        <h3>逐项审阅</h3>
        <p class="notice">同模型审查不是独立事实核验，请亲自核对。被拒绝项不可应用；待确认项必须明确勾选真实性。</p>
        <p v-if="!workspace.run.suggestions.length">本次没有修改建议，这是有效结果；原简历保持不变。</p>
        <article v-for="suggestion in workspace.run.suggestions" :key="suggestion.id" class="suggestion" :data-review="suggestion.review">
          <strong>{{ operationKey(suggestion.operation) }} · {{ suggestion.rejected ? '用户已拒绝' : reviewLabels[suggestion.review] }}</strong>
          <div class="diff"><div><small>原文</small><p>{{ display(suggestion.before) || '（空）' }}</p></div><div><small>建议</small><p>{{ display(suggestion.operation.value) || '（空）' }}</p></div></div>
          <p>理由：{{ suggestion.reason }}</p><p v-if="suggestion.requirement">对应要求：{{ suggestion.requirement }}</p>
          <p>审查：{{ suggestion.reviewReason }}</p>
          <details><summary>证据来源</summary><p v-for="reference in suggestion.sourceRefs" :key="reference">{{ reference }}：{{ sources[reference] }}</p></details>
          <label class="check"><input type="checkbox" :checked="suggestion.selected" :disabled="suggestion.review === 'reject' || suggestion.rejected || workspace.run.stage !== 'ready' || applying" @change="workspace.choose(suggestion.id, { selected: checked($event) })" />选择此建议</label>
          <label v-if="suggestion.review === 'confirm'" class="check"><input type="checkbox" :checked="suggestion.confirmed" :disabled="suggestion.rejected || workspace.run.stage !== 'ready' || applying" @change="workspace.choose(suggestion.id, { confirmed: checked($event) })" />我已核实此建议事实无误，明确确认采纳</label>
          <button type="button" :disabled="suggestion.review === 'reject' || suggestion.rejected || workspace.run.stage !== 'ready' || applying" @click="workspace.choose(suggestion.id, { rejected: true })">拒绝此建议</button>
        </article>
        <div v-if="workspace.run.stage === 'ready' && workspace.run.suggestions.length">
          <label>应用方式<select v-model="applyMode" :disabled="applying"><option value="copy">另存为岗位版本（默认，不覆盖原简历）</option><option value="current">应用到来源简历（可撤销）</option></select></label>
          <label v-if="applyMode === 'current'" class="check"><input v-model="overwriteConfirmed" type="checkbox" :disabled="applying" />我明确同意更新来源简历，保留现有撤销历史</label>
          <button type="button" data-testid="apply" :disabled="!selectedCount || applying || (applyMode === 'current' && !overwriteConfirmed)" @click="applySelected">{{ applying ? '应用中…' : `应用 ${selectedCount} 条已选建议` }}</button>
        </div>
        <p v-if="workspace.run.stage === 'completed'">已应用，简历 ID：{{ workspace.run.appliedResumeId }}。可用该版本开始模拟面试。</p>
      </div>
      <label v-if="workspace.compatibilityError" class="check"><input v-model="compatible" type="checkbox" />兼容模式：省略 response_format 后手动重试（仍校验 JSON）</label>
      <button v-if="['failed', 'cancelled'].includes(workspace.run.stage)" type="button" data-testid="retry" :disabled="!canSend" @click="retry">仅重试 {{ workspace.run.failedStep }} 步骤（可能产生费用）</button>
    </div>
    <p v-if="workspace.error || localError" role="alert" class="error">{{ localError || workspace.error }}</p>
    <p v-if="workspace.storageError" role="alert" class="error">{{ workspace.storageError }} <button type="button" @click="workspace.persist">重试保存</button><button type="button" @click="workspace.setPersistence(false)">仅内存继续</button></p>
    <p class="muted">如需新增经历、项目或结构化自定义条目，请返回编辑器的“工作经历 / 项目经验 / 自定义模块”手动添加，再重新生成；AI 不会代为新增。</p>
    <details @toggle="historyOpened"><summary>本机优化历史</summary>
      <button type="button" @click="workspace.refreshHistory">刷新记录</button>
      <p v-if="!workspace.history.length">没有本机优化记录。</p>
      <div v-for="record in workspace.history" :key="record.id" class="history-row"><span>{{ record.options.target || '通用优化' }} · {{ record.updatedAt }} · {{ record.stage }}</span><button type="button" :disabled="workspace.busy || applying" @click="restore(record.id)">恢复</button><button type="button" :disabled="workspace.busy || applying" @click="deleteRecord(record.id)">删除</button></div>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { ResumeData } from '@/types/resume';
import type { OptimizationFact, OptimizationOptions } from '@/types/ai';
import { AI_PROVIDER_PRESETS, getAiSessionApiKey, loadAiModelSettings, isAiProviderReady, toAiProviderConfig } from '@/services/ai/AiSettings';
import { buildResumeContext, aiPlainText } from '@/services/ai/resumeContext';
import { applyOptimizationSuggestions, operationKey, optimizationSources, suggestionApplicable } from '@/services/ai/resumeOptimization';
import { useAiWorkspaceStore } from '@/stores/aiWorkspace';
import { useResumeStore } from '@/stores/resume';
import { useWorkbenchStore } from '@/stores/workbench';
import { storageManager } from '@/services/storage/StorageManager';
import { createJobResumeVersion } from '@/utils/resumeVersions';
import { generateId } from '@/utils/helpers';
import AiWorkflowSteps from './AiWorkflowSteps.vue';
import { confirmAiAction } from '@/utils/aiDialogs';

const props = defineProps<{ resume: ResumeData; initialFacts?: OptimizationFact[] }>();
const emit = defineEmits<{ configure: []; applied: [resumeId: string] }>();
const workspace = useAiWorkspaceStore();
const resumeStore = useResumeStore();
const workbench = useWorkbenchStore();
const settings = ref(loadAiModelSettings());
const keyAvailable = ref(false);
const consent = ref(false);
const compatible = ref(false);
const localError = ref('');
const applying = ref(false);
const options = reactive<OptimizationOptions>({ target: '', company: '', jd: '', style: 'concise', personalSample: '', generalizeOrganizations: true });
const incomingFacts = ref<OptimizationFact[]>([]);
const acceptedFacts = reactive<Record<string, boolean>>(Object.create(null));
const answers = reactive<Record<string, string>>(Object.create(null));
const answerConfirmed = reactive<Record<string, boolean>>(Object.create(null));
const applyMode = ref<'copy' | 'current'>('copy');
const overwriteConfirmed = ref(false);
let providerSignature = '';
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let restoring = false;
const checked = (event: Event) => (event.target as HTMLInputElement).checked;
const providerLabel = computed(() => settings.value?.profileName || AI_PROVIDER_PRESETS.find(p => p.id === settings.value?.presetId)?.label || '未配置服务');
const config = () => toAiProviderConfig(settings.value);
const canSend = computed(() => consent.value && keyAvailable.value && !!settings.value?.model && !!settings.value?.baseUrl && !workspace.busy && !applying.value);
const confirmedIncoming = computed(() => incomingFacts.value.filter(f => acceptedFacts[f.id] === true));
const sendingPreview = computed(() => JSON.stringify({ resume: workspace.run?.context || buildResumeContext(props.resume, options), options: workspace.run?.options || options, confirmedFacts: workspace.run?.facts || confirmedIncoming.value, confirmedSupplementForNextCall: workspace.run?.stage === 'supplement' ? (workspace.run.analysis?.questions || []).filter(q => answers[q.id]?.trim() && answerConfirmed[q.id]).map(q => ({ text: answers[q.id], targetId: q.targetId })) : [] }, null, 2));
const sources = computed(() => workspace.run ? optimizationSources(workspace.run) : {});
const answerDirty = computed(() => !workspace.saveLocally && Object.values(answers).some(value => !!value?.trim()));
const invalidAnswers = computed(() => workspace.run?.analysis?.questions.some(q => !!answers[q.id]?.trim() && !answerConfirmed[q.id]) || false);
const selectedCount = computed(() => workspace.run?.suggestions.filter(suggestionApplicable).length || 0);
const stageNames: Record<string, string> = { configuration: '配置', analysis: '岗位与简历分析', supplement: '等待用户补充', rewrite: '内容改写', review: '单轮内容审查', ready: '待采纳', completed: '完成', failed: '失败', cancelled: '已取消 / 中断' };
const workflowStages: Record<string, number> = { configuration: 0, analysis: 0, supplement: 1, rewrite: 2, review: 3, ready: 4, completed: 4 };
const workflowIndex = computed(() => workflowStages[workspace.run?.failedStep && ['failed', 'cancelled'].includes(workspace.run.stage) ? workspace.run.failedStep : workspace.run?.stage || 'configuration'] || 0);
const stageLabel = computed(() => stageNames[workspace.run?.stage || 'configuration']);
const reviewLabels = { unreviewed: '未审查', pass: '可采纳', confirm: '待确认', reject: '审查拒绝' };
const display = (value: string | string[]) => Array.isArray(value) ? value.map(v => aiPlainText(v)).join('、') : aiPlainText(value);
function clearAnswers() { for (const key of Object.keys(answers)) delete answers[key]; for (const key of Object.keys(answerConfirmed)) delete answerConfirmed[key]; }
function refreshProvider() {
  const next = loadAiModelSettings();
  const key = getAiSessionApiKey(next?.profileId);
  // Signature remains in component memory only; never exposed or persisted.
  const signature = JSON.stringify([next, key]);
  if (providerSignature && signature !== providerSignature) { consent.value = false; compatible.value = false; workspace.cancel(); }
  providerSignature = signature; settings.value = next; keyAvailable.value = isAiProviderReady(next, key);
}
watch(options, () => { if (!restoring) consent.value = false; }, { deep: true, flush: 'sync' });
watch(acceptedFacts, () => { consent.value = false; }, { deep: true, flush: 'sync' });
watch(() => JSON.stringify(buildResumeContext(props.resume, options)), () => { if (!workspace.run) consent.value = false; });
watch([answers, answerConfirmed], () => {
  if (restoring || workspace.run?.stage !== 'supplement') return;
  for (const question of workspace.run.analysis?.questions || []) {
    const text = answers[question.id] || '';
    const confirmed = answerConfirmed[question.id] === true;
    const saved = workspace.run.supplementAnswers?.[question.id];
    if (saved?.text !== text || saved?.confirmed !== confirmed) void workspace.updateSupplementAnswer(question.id, text, confirmed);
  }
}, { deep: true, flush: 'sync' });
watch(() => props.initialFacts, (facts) => {
  incomingFacts.value = (facts || []).map(f => ({ ...f }));
  for (const key of Object.keys(acceptedFacts)) delete acceptedFacts[key];
  consent.value = false;
}, { deep: true, immediate: true });
watch(() => props.resume.id, () => { consent.value = false; workspace.cancel(); });
watch(applyMode, () => { overwriteConfirmed.value = false; });
async function start() {
  refreshProvider(); if (!canSend.value) return;
  localError.value = ''; clearAnswers();
  await workspace.start(props.resume, options, config(), consent.value, confirmedIncoming.value);
}
async function continueRun(skip: boolean) {
  refreshProvider(); if (!canSend.value || !workspace.run || (!skip && invalidAnswers.value)) return;
  const extra: OptimizationFact[] = skip ? [] : (workspace.run.analysis?.questions || []).filter(q => answers[q.id]?.trim() && answerConfirmed[q.id]).map(q => ({ id: generateId(), text: answers[q.id]!.trim(), targetId: q.targetId }));
  await workspace.supplement([...workspace.run.facts, ...extra], config(), consent.value, compatible.value ? false : undefined);
  if (workspace.run?.stage !== 'supplement') clearAnswers();
}
async function retry() { refreshProvider(); if (canSend.value) await workspace.retry(config(), consent.value, compatible.value ? false : undefined); }
async function beforeClose(): Promise<boolean> {
  if (applying.value) return false;
  return !(workspace.unsaved || answerDirty.value) || await confirmAiAction('离开简历优化？', '优化记录或补充输入尚未保存到本机。关闭可能丢失，请先保存重要内容。', '仍然离开');
}
async function restart() { if (!await beforeClose()) return; workspace.reset(); clearAnswers(); consent.value = false; compatible.value = false; localError.value = ''; }
async function restore(id: string) {
  if (!await beforeClose()) return;
  await workspace.restore(id);
  if (workspace.run?.id !== id) return;
  syncRunForm();
}
function syncRunForm() {
  if (!workspace.run) return;
  restoring = true; Object.assign(options, workspace.run.options); clearAnswers();
  if (workspace.run.stage === 'supplement') for (const [questionId, answer] of Object.entries(workspace.run.supplementAnswers || {})) { answers[questionId] = answer.text; answerConfirmed[questionId] = answer.confirmed; }
  restoring = false; consent.value = false; compatible.value = false; applyMode.value = 'copy'; overwriteConfirmed.value = false;
}
async function deleteRecord(id: string) { if (await confirmAiAction('删除优化记录？', '此记录将从当前浏览器删除，无法恢复；不会删除简历。', '删除记录', true)) await workspace.deleteRun(id); }
function historyOpened(event: Event) { if ((event.target as HTMLDetailsElement).open) void workspace.refreshHistory(); }
async function applySelected() {
  if (applying.value || !workspace.run || !selectedCount.value || (applyMode.value === 'current' && !overwriteConfirmed.value)) return;
  applying.value = true; localError.value = '';
  const run = workspace.run;
  try {
    if (applyMode.value === 'current' && resumeStore.data.id !== run.sourceResumeId) await resumeStore.loadResume(run.sourceResumeId);
    const latest = resumeStore.data.id === run.sourceResumeId ? resumeStore.exportData() : await storageManager.read(run.sourceResumeId);
    if (!latest) throw new Error('来源简历已删除，无法应用。');
    const result = applyOptimizationSuggestions(latest, run);
    let id: string;
    if (applyMode.value === 'copy') {
      const version = createJobResumeVersion(result, { versionName: '', company: run.options.company, position: run.options.target });
      id = await workbench.createResumeFromData(version);
    } else { await resumeStore.importData(result); id = result.id; }
    await workspace.complete(id); emit('applied', id);
  } catch (cause) { localError.value = cause instanceof Error ? cause.message : '应用失败，原简历未被修改。'; }
  finally { applying.value = false; }
}
function beforeUnload(event: BeforeUnloadEvent) { if (workspace.unsaved || answerDirty.value || applying.value) { event.preventDefault(); event.returnValue = ''; } }
onMounted(() => { syncRunForm(); refreshProvider(); window.addEventListener('focus', refreshProvider); window.addEventListener('storage', refreshProvider); window.addEventListener('beforeunload', beforeUnload); refreshTimer = setInterval(refreshProvider, 1000); });
onBeforeUnmount(() => { clearInterval(refreshTimer); window.removeEventListener('focus', refreshProvider); window.removeEventListener('storage', refreshProvider); window.removeEventListener('beforeunload', beforeUnload); workspace.cancel(); });
// Host drawer should call beforeClose to prevent closing with unsaved work (unmount cannot veto).
defineExpose({ beforeClose });
</script>

<style scoped>
.optimization-panel { display: flex; flex-direction: column; gap: var(--ui-space-4); color: var(--ui-text-main); font-size: var(--ui-font-sm); line-height: 1.7; overflow-wrap: anywhere; }
h2 { font-size: var(--ui-font-lg); font-weight: 650; margin: var(--ui-space-2) 0; } h3 { font-size: var(--ui-font-md); font-weight: 600; } h3, p { margin: 0 0 var(--ui-space-2); }.panel-eyebrow { color: var(--ui-primary); font-size: var(--ui-font-xs); font-weight: 600; } header p { color: var(--ui-text-secondary); }
.provider, .actions, .history-row { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }.provider { padding: var(--ui-space-3); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-bg-subtle); }.provider > div, .history-row > span { flex: 1; min-width: 0; }.provider p { margin: var(--ui-space-1) 0 0; font-size: var(--ui-font-xs); color: var(--ui-text-muted); }
fieldset, details, .suggestion, .notice { border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: var(--ui-space-4); min-width: 0; } fieldset { margin: 0; } legend { padding: 0 var(--ui-space-2); font-weight: 600; }.notice { background: var(--ui-bg-subtle); font-size: var(--ui-font-xs); color: var(--ui-text-secondary); }
label { display: flex; flex-direction: column; gap: var(--ui-space-2); margin-bottom: var(--ui-space-3); }.check { flex-direction: row; align-items: flex-start; font-size: var(--ui-font-sm); }.check input { margin-top: var(--ui-space-1); accent-color: var(--ui-primary); flex-shrink: 0; }
input:not([type=checkbox]), textarea, select { width: 100%; min-width: 0; min-height: var(--ui-control-height); box-sizing: border-box; padding: var(--ui-space-2) var(--ui-space-3); background: var(--ui-bg-surface); color: inherit; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); font: inherit; } textarea { resize: vertical; }
button { min-height: var(--ui-control-height); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: var(--ui-space-2) var(--ui-space-3); color: var(--ui-text-main); background: var(--ui-bg-surface); cursor: pointer; font: inherit; transition: background var(--ui-duration-fast) ease; }button:hover:not(:disabled) { background: var(--ui-bg-hover); }button:disabled { opacity: .5; cursor: not-allowed; }button[data-testid=start], button[data-testid=continue], button[data-testid=apply] { background: var(--ui-primary); color: var(--ui-bg-surface); border-color: var(--ui-primary); }button[data-testid=start]:hover:not(:disabled), button[data-testid=continue]:hover:not(:disabled), button[data-testid=apply]:hover:not(:disabled) { background: var(--ui-primary-hover); }
summary { cursor: pointer; font-size: var(--ui-font-sm); } pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 300px; overflow: auto; font-size: var(--ui-font-xs); padding: var(--ui-space-2); background: var(--ui-bg-subtle); }
.form-grid, .diff { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-3); }.suggestion { margin-bottom: var(--ui-space-4); }.suggestion > strong { display: block; margin-bottom: var(--ui-space-3); font-size: var(--ui-font-sm); }.suggestion[data-review=reject] { opacity: .7; border-color: color-mix(in srgb, var(--ui-danger) 35%, var(--ui-border)); }.suggestion[data-review=pass] { border-top: 2px solid var(--ui-success); }.suggestion[data-review=confirm] { border-top: 2px solid var(--ui-warning); }.diff { margin-bottom: var(--ui-space-3); }.diff > div { padding: var(--ui-space-3); border-radius: var(--ui-radius-md); background: var(--ui-bg-subtle); }.diff > div + div { background: color-mix(in srgb, var(--ui-primary) 5%, var(--ui-bg-surface)); }.diff p { white-space: pre-wrap; margin-top: var(--ui-space-2); }
.run-content { display: grid; gap: var(--ui-space-4); }.run-status { padding: var(--ui-space-3) 0; border-top: 1px solid var(--ui-border); border-bottom: 1px solid var(--ui-border); }.run-status span { display: block; margin-top: var(--ui-space-1); color: var(--ui-text-muted); font-size: var(--ui-font-xs); }.error { color: var(--ui-danger); }.muted, small { color: var(--ui-text-muted); font-size: var(--ui-font-xs); }.question, .match { margin-top: var(--ui-space-3); }.history-row { padding: var(--ui-space-3) 0; border-bottom: 1px solid var(--ui-border); font-size: var(--ui-font-xs); }
@media (max-width: 768px) { .form-grid, .diff { grid-template-columns: minmax(0, 1fr); }.actions button { flex: 1 1 100%; }.provider > div { flex-basis: 100%; } }
</style>
