<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { ElMessage } from 'element-plus';
import AppHeader from '@/components/common/AppHeader.vue';
import InterviewConsent from '@/components/interview/InterviewConsent.vue';
import InterviewConversation from '@/components/interview/InterviewConversation.vue';
import InterviewReport from '@/components/interview/InterviewReport.vue';
import AiProviderSettingsPanel from '@/components/workbench/AiProviderSettingsPanel.vue';
import { useInterviewStore } from '@/stores/interview';
import { useWorkbenchStore } from '@/stores/workbench';
import { useStorageStore } from '@/stores/storage';
import { useAiWorkspaceStore } from '@/stores/aiWorkspace';
import { storageManager } from '@/services/storage/StorageManager';
import { aiWorkspaceRepository } from '@/services/ai/AiWorkspaceRepository';
import { buildResumeContext } from '@/services/ai/resumeContext';
import { downloadInterview, interviewerData, interviewSettingsPayload } from '@/services/ai/interview';
import { answeredDurationMs, formatClock, formatDuration, sessionElapsedMs } from '@/utils/interviewTiming';
import { weaknessFocusFromReport, weaknessTagLabel } from '@/utils/interviewWeakness';
import type { ResumeData } from '@/types/resume';
import type { AiProviderConfig } from '@/types/ai';
import type { InterviewFocus, InterviewSession, InterviewSettings, InterviewWeaknessTag } from '@/types/interview';
import AiWorkflowSteps from '@/components/ai/AiWorkflowSteps.vue';
import { confirmAiAction } from '@/utils/aiDialogs';
const route = useRoute(); const router = useRouter();
const store = useInterviewStore(); const workbench = useWorkbenchStore(); const storage = useStorageStore();
const optimization = useAiWorkspaceStore();
const resumeId = ref(''); const resume = ref<ResumeData | null>(null);
const config = ref<AiProviderConfig | null>(null);
const loading = ref(false); const pageError = ref(''); const draftDirty = ref(false);
const generalize = ref(true); const persistence = ref(false);
const providerDialog = ref(false);
const providerRevision = ref(0);
const consentForm = ref<InstanceType<typeof InterviewConsent>>();
const settings = reactive<InterviewSettings>({ targetRole: '', jd: '', level: '未指定', direction: '综合', mode: 'training', mainQuestionLimit: 8 });
// Targeted practice: a report can hand over its practice points, and the user decides which to keep.
const focusSource = ref<{ sessionId: string; points: string[]; tags: InterviewWeaknessTag[] } | null>(null);
const focusSelected = ref<string[]>([]);
const focusNotice = ref('');
watch(focusSelected, value => {
  settings.focus = focusSource.value && value.length
    ? { sourceSessionId: focusSource.value.sessionId, points: [...value], tags: [...focusSource.value.tags] }
    : undefined;
}, { deep: true });
const preview = computed(() => store.session ? interviewerData(store.session) : { context: resume.value ? buildResumeContext(resume.value, { generalizeOrganizations: generalize.value }) : null, settings: interviewSettingsPayload(settings) });
const statusLabels = { ready: '准备', running: '出题中', answering: '等待你的回答', reviewing: '回答已提交', paused: '已暂停', interrupted: '已暂停', failed: '这一步没有完成', completed: '已完成' };
const processedMain = computed(() => store.session?.turns.filter(turn => !turn.followup && turn.submittedAt).length || 0);
const progressPercent = computed(() => store.session ? Math.round(processedMain.value / store.session.settings.mainQuestionLimit * 100) : 0);
// Local rhythm readout: elapsed time is shown here only and is never part of a model request.
const now = ref(Date.now());
const elapsedLabel = computed(() => {
  if (!store.session) return '';
  const ms = sessionElapsedMs(store.session, now.value);
  return ms === null ? '' : formatClock(ms);
});
const answeredMs = computed(() => store.session ? answeredDurationMs(store.session) : 0);
const answeredLabel = computed(() => answeredMs.value > 0 ? formatDuration(answeredMs.value) : '');
let clock: ReturnType<typeof setInterval> | undefined;
function startClock() { if (!clock) clock = setInterval(() => { now.value = Date.now(); }, 1000); }
function stopClock() { if (clock) { clearInterval(clock); clock = undefined; } }
watch(() => store.session?.status, status => { if (status && status !== 'completed') startClock(); else stopClock(); });
let loadEpoch = 0;
async function loadResume() {
  const token = ++loadEpoch; resume.value = null; config.value = null; consentForm.value?.reset();
  if (!resumeId.value) return;
  try { const result = await storageManager.read(resumeId.value); if (token !== loadEpoch) return; if (!result) throw new Error('所选简历不存在。'); resume.value = result; settings.targetRole = result.basic.title || ''; }
  catch (cause) { pageError.value = cause instanceof Error ? cause.message : '读取简历失败'; }
}
/** Loads the finished interview named by ?focusSessionId and carries its practice points into the setup. */
async function loadFocus() {
  focusSource.value = null; focusSelected.value = []; focusNotice.value = '';
  const sourceId = String(route.query.focusSessionId ?? '');
  if (!sourceId) return;
  try {
    const record = await aiWorkspaceRepository.get<InterviewSession>('interview', sourceId);
    if (!record) throw new Error('找不到上一场面试记录');
    const focus = weaknessFocusFromReport(record);
    if (!focus) throw new Error('上一场报告没有可带走的练习重点');
    focusSource.value = { sessionId: focus.sourceSessionId, points: focus.points, tags: focus.tags };
    focusSelected.value = [...focus.points];
    if (record.settings.targetRole) settings.targetRole = record.settings.targetRole;
    if (record.settings.level) settings.level = record.settings.level;
    settings.direction = record.settings.direction;
  } catch (cause) { focusNotice.value = `${cause instanceof Error ? cause.message : '读取上一场复盘失败'}，将按常规开始。`; }
}
function clearFocus() { focusSource.value = null; focusSelected.value = []; focusNotice.value = ''; }
async function enter() {
  loading.value = true; pageError.value = ''; draftDirty.value = false;
  try {
    if (!storage.config) await storage.init();
    await workbench.init();
    const id = String(route.params.sessionId ?? 'new');
    if (id === 'new') {
      store.reset(); focusSource.value = null; focusSelected.value = []; focusNotice.value = '';
      resumeId.value = String(route.query.resumeId ?? workbench.resumeList[0]?.id ?? ''); await loadResume();
      await loadFocus();
    } else if (store.session?.id !== id) await store.restore(id);
  } catch (cause) { pageError.value = cause instanceof Error ? cause.message : '初始化失败'; }
  finally { loading.value = false; }
}
function invalidate() { config.value = null; store.revokeConsent(); }
function confirmed(provider: AiProviderConfig) { config.value = provider; if (store.session) store.confirmProvider(provider, true); }
watch([settings, generalize], () => { if (!store.session) { invalidate(); consentForm.value?.reset(); } }, { deep: true });
watch(() => route.params.sessionId, () => { void enter(); });
async function start() {
  if (!resume.value || !config.value || store.busy) return;
  await store.start(resume.value, settings, config.value, { consent: true, persistence: persistence.value, generalizeOrganizations: generalize.value });
  if (store.session && route.params.sessionId === 'new') await router.replace(`/interview/${store.session.id}`);
}
async function confirmFinish() { if (await confirmAiAction('结束本轮问答？', '已提交的回答会保留；未回答或跳过的题目将标为不完整。生成报告需要一次模型调用。', '结束并生成报告')) await store.finish(); }
async function guard() {
  if ((store.unsaved || draftDirty.value || optimization.unsaved) && !await confirmAiAction('离开当前面试？', '本次面试或回补优化有仅内存、未保存内容或草稿。离开可能丢失，请先保存或导出。', '仍然离开')) return false;
  store.pause(); optimization.cancel(); return true;
}
onBeforeRouteLeave(guard);
onBeforeRouteUpdate(to => { if (to.params.sessionId === store.session?.id) return true; return guard(); });
function beforeUnload(event: BeforeUnloadEvent) {
  if (store.unsaved || draftDirty.value || optimization.unsaved) { event.preventDefault(); event.returnValue = ''; }
  if (store.busy) store.pause();
  if (optimization.busy) optimization.cancel();
}
onMounted(() => { window.addEventListener('beforeunload', beforeUnload); void enter(); });
onBeforeUnmount(() => { window.removeEventListener('beforeunload', beforeUnload); stopClock(); store.pause(); store.revokeConsent(); });
function applied(id: string) { ElMessage.success('已按优化审核结果采纳，可用新版本开始面试。'); void router.push(`/interview/new?resumeId=${encodeURIComponent(id)}`); }
function startPractice(focus: InterviewFocus) {
  const sourceResumeId = store.session?.sourceResumeId || resumeId.value;
  void router.push({ path: '/interview/new', query: { resumeId: sourceResumeId, focusSessionId: focus.sourceSessionId } });
}
</script>
<template>
  <div class="interview-page">
    <AppHeader title="文字模拟面试" subtitle="真实经历，逐题练习" show-back back-label="面试记录" @back="router.push('/interviews')" />
    <main>
      <div v-if="loading" class="page-notice" role="status">正在读取本机数据…</div>
      <el-alert v-if="pageError || store.error" type="error" :closable="false" show-icon :title="pageError || store.error" />
      <el-alert v-if="storage.initializationWarning" type="warning" :closable="false" :title="storage.initializationWarning" />
      <p v-if="focusNotice" class="focus-notice" role="status">{{ focusNotice }}</p>
      <template v-if="!loading && !store.session">
        <header class="page-intro"><h1>准备模拟面试</h1><p>选择简历和练习方式，确认发送范围后开始。</p></header>
        <section v-if="!workbench.resumeList.length" class="card" aria-label="尚无简历"><h2>先准备一份简历</h2><p>创建简历后，即可围绕你的经历练习面试。</p><el-button type="primary" @click="router.push('/templates')">创建简历</el-button></section>
        <div v-else class="setup-layout">
          <div class="setup-main">
            <section class="card setup-card">
              <div class="section-heading"><span class="section-number">01</span><div><h2>选简历和岗位</h2><p>岗位信息帮助面试官更有针对性地提问。</p></div></div>
              <div class="fields">
                <label>来源简历<select v-model="resumeId" aria-label="来源简历" @change="loadResume"><option value="">选择简历</option><option v-for="item in workbench.resumeList" :key="item.id" :value="item.id">{{ item.title }}</option></select></label>
                <label>目标岗位<input v-model="settings.targetRole" maxlength="200" placeholder="例如：前端开发工程师" /></label>
                <label>目标级别（选填）<input v-model="settings.level" maxlength="200" placeholder="例如：初级、中级" /></label>
                <label>面试方向<select v-model="settings.direction" aria-label="面试方向"><option>综合</option><option>项目深挖</option><option>岗位专业</option><option>行为面试</option></select></label>
              </div>
            </section>
            <section class="card setup-card">
              <div class="section-heading"><span class="section-number">02</span><div><h2>选练习方式</h2><p>训练模式答完就看反馈；真实模拟留到结束再看。</p></div></div>
              <label>模式<select v-model="settings.mode" aria-label="模式"><option value="training">训练：答后点评，再手动继续</option><option value="real">真实模拟：结束后统一反馈</option></select></label>
            </section>
            <section v-if="focusSource" class="card focus-card">
              <div class="section-heading"><span class="section-chip">专项</span><div><h2>弱项专项练习</h2><p>来自上一场复盘；只带进入你勾选的重点。</p></div></div>
              <p v-if="focusSource.tags.length" class="focus-tags"><span v-for="tag in focusSource.tags" :key="tag">{{ weaknessTagLabel(tag) }}</span></p>
              <label v-for="point in focusSource.points" :key="point" class="check"><input v-model="focusSelected" type="checkbox" :value="point" />{{ point }}</label>
              <div class="focus-actions"><p>{{ focusSelected.length ? `已选 ${focusSelected.length} 个重点，题目上限与追问规则不变。` : '未选择任何重点，将按常规面试开始。' }}</p><el-button text @click="clearFocus">取消专项</el-button></div>
            </section>
            <section class="card setup-card">
              <div class="section-heading"><span class="section-number">03</span><div><h2>确认发送范围</h2><p>开始前看清会发出去的内容。</p></div></div>
              <details class="quiet-details">
                <summary>题数、岗位要求与保存方式</summary>
                <label>主问题数<select v-model="settings.mainQuestionLimit" aria-label="主问题数"><option :value="5">5</option><option :value="8">8</option><option :value="12">12</option></select></label>
                <label>岗位要求（选填）<textarea v-model="settings.jd" rows="4" maxlength="15000" placeholder="粘贴岗位要求；留空也可围绕简历进行面试。" /></label>
                <div class="setup-options"><label class="check"><input v-model="generalize" type="checkbox" />发送时替换公司和学校名称（正文需自行检查）</label><label class="check"><input v-model="persistence" type="checkbox" />保存到本机（未勾选时，刷新可能丢失）</label></div>
              </details>
              <InterviewConsent ref="consentForm" :preview="preview" :revision="providerRevision" @confirmed="confirmed" @changed="invalidate" @configure="providerDialog = true" />
            </section>
            <div class="start-row"><p>{{ !resume ? '请先选择一份简历。' : config ? '发送范围已确认，可以开始。' : '请先确认 AI 服务与发送范围。' }}</p><el-button type="primary" size="large" :disabled="!resume || !config || store.busy" @click="start">开始面试</el-button></div>
          </div>
          <aside class="setup-guide card">
            <span class="eyebrow">本次练习</span><h2>{{ settings.mode === 'training' ? '边练边调整' : '接近真实面试的节奏' }}</h2><p>{{ settings.mode === 'training' ? '每次回答后查看教练反馈，整理思路后再继续。' : '过程中不展示教练点评，结束后统一回看与复盘。' }}</p>
            <AiWorkflowSteps :steps="['准备', '问答', '复盘']" :current="0" label="面试流程" />
            <dl class="practice-facts"><div><dt>主问题</dt><dd>{{ settings.mainQuestionLimit }} 道</dd></div><div><dt>追问</dt><dd>每题最多 1 次</dd></div><div><dt>面试方向</dt><dd>{{ settings.direction }}</dd></div></dl>
            <details class="quiet-details"><summary>请求次数与使用边界</summary><p>初始化 1 次，继续时最多 1 次面试官请求；训练模式每次作答另加 1 次教练请求，最终报告 1 次。手动重试也可能收费。</p><p>每道主问题最多追问一次，不会自动持续提问。项目深挖侧重你的职责、取舍与验证，不搜索网络。</p></details>
            <p class="guide-footnote">不生成虚构经历，不给录用概率。真实回答，比完美答案更重要。</p>
          </aside>
        </div>
      </template>
      <template v-else-if="store.session">
        <section class="card session-progress">
          <div class="session-heading"><div><div class="session-tags"><span class="eyebrow">{{ store.session.settings.mode === 'real' ? '真实模拟' : '训练模式' }}</span><span>{{ store.session.settings.direction }}</span><span v-if="store.session.settings.focus" class="focus-chip">专项 · {{ store.session.settings.focus.points.length }} 个重点</span></div><h1>{{ store.session.settings.targetRole || '通用面试' }}</h1></div><span class="status-pill" :class="`is-${store.session.status}`" role="status"><span aria-hidden="true" />{{ statusLabels[store.session.status] }}</span></div>
          <div class="progress-caption"><span>第 {{ store.currentTurn?.mainNumber || processedMain || 1 }} 题，共 {{ store.session.settings.mainQuestionLimit }} 题<strong v-if="store.currentTurn?.followup"> · 追问</strong></span><span v-if="elapsedLabel">已进行 {{ elapsedLabel }}</span><span v-if="answeredLabel">累计答题 {{ answeredLabel }}</span></div>
          <div class="progress-track" role="progressbar" aria-label="主问题处理进度" :aria-valuenow="processedMain" :aria-valuemax="store.session.settings.mainQuestionLimit" :aria-valuemin="0"><span :style="{ width: `${progressPercent}%` }" /></div>
          <div class="session-controls">
            <AiWorkflowSteps :steps="['准备', '问答', '复盘']" :current="store.session.report ? 2 : 1" :complete="!!store.session.report" label="面试流程" />
            <div class="actions"><el-button v-if="store.session.status !== 'completed' && !['paused', 'interrupted'].includes(store.session.status)" @click="store.pause">暂停</el-button><el-button v-if="['paused', 'interrupted'].includes(store.session.status)" type="primary" plain @click="store.resume">恢复面试</el-button><el-button v-if="store.session.status === 'failed'" :disabled="store.busy || !store.consented" type="primary" plain @click="store.retry">重试这一步</el-button><el-button v-if="store.session.status !== 'completed'" :disabled="!store.consented || (store.busy && store.session.pendingStage === 'report')" @click="confirmFinish">结束并生成报告</el-button></div>
          </div>
          <el-button v-if="store.compatibilityError" text type="primary" @click="store.enableCompatibilityMode">启用兼容模式（启用后需手动重试）</el-button>
        </section>
        <div class="session-layout" :class="{ 'needs-consent': !store.consented }">
          <div class="session-main">
            <InterviewReport v-if="store.session.report" :session="store.session" @configure="providerDialog = true" @applied="applied" @practice="startPractice" />
            <details v-if="store.session.report" class="transcript"><summary>查看本轮问答记录 · {{ store.session.turns.length }} 条问题</summary><InterviewConversation :session="store.session" :busy="store.busy" :consented="store.consented" @draft="value => draftDirty = value" /></details>
            <InterviewConversation v-else :session="store.session" :busy="store.busy" :consented="store.consented" @answer="store.submitAnswer" @continue="store.continueInterview" @draft="value => draftDirty = value" />
          </div>
          <aside class="session-sidebar">
            <details v-if="store.session.status !== 'completed'" class="access-panel card" :open="!store.consented"><summary>模型与发送范围 <span>{{ store.consented ? '已确认' : '需要确认' }}</span></summary><InterviewConsent :preview="preview" :frozen-provider="store.session.provider" :authorized="store.consented" :revision="providerRevision" :disabled="store.busy" @confirmed="confirmed" @changed="invalidate" @configure="providerDialog = true" /></details>
            <section class="card session-tools"><div class="section-heading"><div><h2>本次练习</h2><p>{{ store.session.provider.model }}</p></div></div><details class="quiet-details"><summary>请求用量</summary><dl class="practice-facts"><div><dt>请求次数</dt><dd>{{ store.session.usage.calls }}</dd></div><div><dt>输入 tokens</dt><dd>{{ store.session.usage.promptTokens.toLocaleString() }}</dd></div><div><dt>输出 tokens</dt><dd>{{ store.session.usage.completionTokens.toLocaleString() }}</dd></div></dl><p class="microcopy">服务未返回 usage 时为 0，不估算费用。</p></details><div class="save-state" :class="{ 'is-saved': store.session.persistence && !store.unsaved }">{{ store.session.persistence && !store.unsaved ? '已保存到本机' : '尚未保存，刷新可能丢失' }}</div><el-button @click="store.setPersistence(true)">{{ store.session.persistence ? '保存当前进度' : '保存到本机' }}</el-button><p v-if="store.storageError" class="error" role="alert">{{ store.storageError }}<el-button text @click="store.setPersistence(false)">暂不保存，继续练习</el-button></p><div class="export-actions"><el-button text @click="downloadInterview(store.session, 'json')">导出 JSON</el-button><el-button text @click="downloadInterview(store.session, 'markdown')">导出 Markdown</el-button></div></section>
            <details class="card resume-summary"><summary>本次使用的简历</summary><p class="microcopy">原简历的后续编辑不会改变本次面试。</p><p>{{ store.session.context.basic.summary || store.session.context.basic.title || '未填写个人简介' }}</p><ul><li v-for="item in store.session.context.projects" :key="item.id">{{ item.name }}<span>{{ item.role }}</span></li><li v-for="item in store.session.context.experiences" :key="item.id">{{ item.company }}<span>{{ item.position }}</span></li></ul><details class="quiet-details"><summary>查看完整发送数据</summary><pre>{{ JSON.stringify(store.session.context, null, 2) }}</pre></details></details>
          </aside>
        </div>
      </template>
      <footer class="storage-note">记录仅在当前浏览器保存，不随简历目录迁移，也不包含在简历全量备份中。可在面试记录页导出或删除。</footer>
    </main>
    <el-dialog v-model="providerDialog" title="配置 AI 服务" width="min(980px, calc(100vw - 32px))"><AiProviderSettingsPanel @saved="providerRevision++" /></el-dialog>
  </div>
</template>

<style scoped>
/* Cobalt tokens only: the interview shell uses the same surfaces, keys and hairlines as every other page. */
.interview-page { min-height: 100vh; min-height: 100dvh; background: var(--color-paper); color: var(--color-ink); }

main { display: grid; gap: var(--space-lg); width: 100%; max-width: 1280px; margin: 0 auto; padding: var(--space-xl) var(--space-lg); }

.card { min-width: 0; padding: var(--space-lg); border: var(--rule-hair) solid var(--color-rule); border-radius: var(--radius-card); background: var(--color-paper-3); box-shadow: var(--shadow-card); }

.page-intro h1, .session-heading h1 { min-width: 0; margin: var(--space-2xs) 0; font-size: var(--text-2xl); font-weight: 600; letter-spacing: var(--tracking-display); line-height: 1.4; overflow-wrap: anywhere; text-wrap: balance; }
.page-intro p { margin: 0; color: var(--color-ink-2); }
.eyebrow { color: var(--color-accent); font-family: var(--font-display); font-size: var(--text-xs); font-weight: 600; letter-spacing: .05em; }
h2 { min-width: 0; margin: 0; font-size: var(--text-lg); font-weight: 600; letter-spacing: var(--tracking-display); }
p { font-size: var(--text-md); line-height: 1.75; overflow-wrap: anywhere; }

.setup-layout, .session-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--space-lg); align-items: start; }
.setup-main, .session-main, .session-sidebar { display: grid; gap: var(--space-md); min-width: 0; }
.setup-guide, .session-sidebar { position: sticky; top: var(--space-lg); }

.section-heading { display: flex; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-lg); }
.section-heading p { margin: var(--space-2xs) 0 0; color: var(--color-muted); font-size: var(--text-sm); }
.section-number { display: grid; flex-shrink: 0; place-items: center; width: 36px; height: 36px; border-radius: var(--radius-input); background: var(--color-accent-wash); color: var(--color-accent); font-family: var(--font-display); font-size: var(--text-sm); font-weight: 600; font-variant-numeric: tabular-nums; }

.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-md); }
label { display: grid; gap: var(--space-xs); margin-bottom: var(--space-md); color: var(--color-ink-2); font-size: var(--text-sm); font-weight: 500; }
.fields label { margin: 0; }
.fields + label { margin-top: var(--space-md); }

input, select, textarea { width: 100%; min-width: 0; min-height: var(--control-height); padding: var(--space-2xs) var(--space-sm); border: var(--rule-hair) solid var(--color-rule-2); border-radius: var(--radius-input); background: var(--color-paper-3); color: var(--color-ink); font: inherit; font-weight: 400; transition: box-shadow var(--dur-micro) var(--ease-out), border-color var(--dur-micro) var(--ease-out); }
textarea { resize: vertical; line-height: 1.7; }
input:focus-visible, select:focus-visible, textarea:focus-visible { outline: none; border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-accent-wash); }
.check { display: flex; align-items: flex-start; margin: 0; font-weight: 400; line-height: 1.6; }
.check input { width: auto; min-height: auto; margin-top: var(--space-2xs); accent-color: var(--color-accent); }
.setup-options { display: grid; gap: var(--space-sm); padding-top: var(--space-md); border-top: var(--rule-hair) solid var(--color-rule); }

/* Targeted practice: a distinct card before consent, never a numbered setup step. */
.focus-card { display: grid; gap: var(--space-xs); }
.focus-card .section-heading { margin-bottom: var(--space-xs); }
.section-chip { display: inline-grid; flex-shrink: 0; place-items: center; min-width: 36px; min-height: 36px; padding: 0 var(--space-2xs); border: var(--rule-hair) solid var(--color-accent); border-radius: var(--radius-input); color: var(--color-accent); font-family: var(--font-display); font-size: var(--text-xs); font-weight: 600; }
.focus-tags { display: flex; flex-wrap: wrap; gap: var(--space-2xs); margin: 0 0 var(--space-xs); }
.focus-tags span { padding: 0 var(--space-xs); border: var(--rule-hair) solid var(--color-rule); border-radius: var(--radius-input); color: var(--color-ink-2); font-family: var(--font-display); font-size: var(--text-xs); font-weight: 500; line-height: 1.7; }
.focus-card .check { padding: var(--space-2xs) 0; }
.focus-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-xs); padding-top: var(--space-xs); border-top: var(--rule-hair) solid var(--color-rule); }
.focus-actions p { margin: 0; color: var(--color-muted); font-size: var(--text-xs); }
.focus-notice { margin: 0; padding: var(--space-xs) var(--space-md); border: var(--rule-hair) solid color-mix(in oklab, var(--color-warning) 40%, transparent); border-radius: var(--radius-card); background: var(--color-warning-wash); color: var(--color-ink); font-size: var(--text-sm); font-weight: 500; }
.focus-chip { padding: 0 var(--space-2xs); border: var(--rule-hair) solid var(--color-accent); border-radius: var(--radius-s); color: var(--color-accent); font-weight: 500; }

.setup-guide > h2 { margin-top: var(--space-2xs); }
.setup-guide > p { color: var(--color-ink-2); font-size: var(--text-sm); }
.setup-guide :deep(.workflow) { margin: var(--space-lg) 0; }
.practice-facts { display: grid; gap: var(--space-sm); margin: 0; font-size: var(--text-sm); }
.practice-facts > div { display: flex; justify-content: space-between; gap: var(--space-sm); }
.practice-facts dt { color: var(--color-muted); }
.practice-facts dd { margin: 0; font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; }
.guide-footnote { margin-top: var(--space-lg); padding-top: var(--space-md); border-top: var(--rule-hair) solid var(--color-rule); }

.start-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); padding: var(--space-2xs) 0; }
.start-row p { margin: 0; color: var(--color-muted); font-size: var(--text-sm); }

.session-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); }
.session-tags { display: flex; align-items: center; gap: var(--space-sm); color: var(--color-muted); font-size: var(--text-xs); }
.status-pill { display: inline-flex; align-items: center; gap: var(--space-xs); padding: 0 var(--space-xs); border-radius: var(--radius-input); background: var(--color-paper-2); color: var(--color-ink-2); font-family: var(--font-display); font-size: var(--text-xs); font-weight: 500; line-height: 1.7; white-space: nowrap; }
.status-pill > span { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.is-running, .is-answering { color: var(--color-accent); }
.is-failed { color: var(--color-error); }
.is-completed { color: var(--color-success); }

.progress-caption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2xs) var(--space-md); margin: var(--space-md) 0 var(--space-xs); color: var(--color-muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
.progress-caption strong { color: var(--color-accent); font-weight: 500; }
.progress-track { height: 4px; overflow: hidden; border-radius: var(--radius-s); background: var(--color-paper-2); }
.progress-track > span { display: block; height: 100%; background: var(--color-accent); transition: width var(--dur-short) var(--ease-out); }

.session-controls { display: flex; align-items: center; justify-content: space-between; gap: var(--space-lg); margin-top: var(--space-md); }
.session-controls > :first-child { flex: 1; max-width: 320px; }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-xs); }
.actions :deep(.el-button) { margin: 0; }
.session-tools .section-heading { margin-bottom: var(--space-md); }
.session-tools > :deep(.el-button) { width: 100%; }
.export-actions { display: flex; justify-content: space-between; margin-top: var(--space-sm); }
.export-actions :deep(.el-button) { margin: 0; padding-inline: var(--space-2xs); }

.microcopy, .quiet-details p { color: var(--color-muted); font-size: var(--text-xs); line-height: 1.7; }
.save-state { margin: var(--space-md) 0 var(--space-sm); color: var(--color-warning); font-size: var(--text-xs); font-weight: 500; }
.save-state.is-saved { color: var(--color-success); }
.error { color: var(--color-error); }

summary { cursor: pointer; font-size: var(--text-sm); line-height: 1.6; }
.quiet-details { margin-top: var(--space-md); color: var(--color-ink-2); }
.access-panel > summary { font-weight: 500; }
.access-panel > summary > span { margin-left: var(--space-xs); color: var(--color-muted); font-size: var(--text-xs); font-weight: 400; }
.access-panel { padding: var(--space-md); }
.access-panel :deep(.consent-card) { padding: var(--space-md) 0 0; border: 0; }
.access-panel :deep(.service-picker) { max-width: 100%; }
.access-panel :deep(.consent-heading) { display: none; }
.access-panel :deep(.el-button) { max-width: 100%; height: auto; min-height: var(--control-height); margin: var(--space-xs) 0 0; white-space: normal; }

.resume-summary ul { margin: var(--space-sm) 0; padding: 0; list-style: none; }
.resume-summary li { padding: var(--space-xs) 0; border-bottom: var(--rule-hair) solid var(--color-rule); font-size: var(--text-sm); overflow-wrap: anywhere; }
.resume-summary li span { display: block; color: var(--color-muted); font-size: var(--text-xs); }
.resume-summary > p { font-size: var(--text-sm); }
.transcript > summary { padding: var(--space-md); border: var(--rule-hair) solid var(--color-rule); border-radius: var(--radius-card); background: var(--color-paper-3); }
.transcript[open] > summary { margin-bottom: var(--space-sm); }
pre { max-height: 240px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--font-outlier); font-size: var(--text-xs); }
.storage-note { padding: var(--space-md) 0; color: var(--color-muted); font-size: var(--text-xs); line-height: 1.7; text-align: center; }
.page-notice { color: var(--color-muted); }

@media (max-width: 1024px) {
  .setup-layout, .session-layout { grid-template-columns: minmax(0, 1fr); }
  .setup-guide, .session-sidebar { position: static; }
  .session-sidebar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .access-panel { grid-column: 1 / -1; }
  .needs-consent .session-sidebar { order: -1; }
  .session-controls { align-items: flex-start; flex-wrap: wrap; }
  .session-controls > :first-child { flex-basis: 100%; }
}

@media (max-width: 768px) {
  main { gap: var(--space-md); padding-top: var(--space-lg); }
  .card { padding: var(--space-md); }
  .page-intro h1, .session-heading h1 { font-size: var(--text-xl); }
  .fields, .session-sidebar { grid-template-columns: minmax(0, 1fr); }
  .session-heading { align-items: flex-start; }
  .progress-caption { flex-wrap: wrap; }
  .start-row { align-items: stretch; flex-direction: column; }
  .start-row :deep(.el-button) { width: 100%; }
  .actions :deep(.el-button) { height: auto; min-height: var(--control-height); padding-inline: var(--space-sm); white-space: normal; }
}
</style>
