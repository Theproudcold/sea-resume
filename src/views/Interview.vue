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
import { buildResumeContext } from '@/services/ai/resumeContext';
import { downloadInterview, interviewerData } from '@/services/ai/interview';
import type { ResumeData } from '@/types/resume';
import type { AiProviderConfig } from '@/types/ai';
import type { InterviewSettings } from '@/types/interview';
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
const consentForm = ref<InstanceType<typeof InterviewConsent>>();
const settings = reactive<InterviewSettings>({ targetRole: '', jd: '', level: '未指定', direction: '综合', mode: 'training', mainQuestionLimit: 8 });
const preview = computed(() => store.session ? interviewerData(store.session) : { context: resume.value ? buildResumeContext(resume.value, { generalizeOrganizations: generalize.value }) : null, settings });
const statusLabels = { ready: '待开始', running: '请求中', answering: '等待回答', reviewing: '待手动继续', paused: '已暂停', interrupted: '已中断，等待恢复', failed: '步骤失败', completed: '已完成' };
const processedMain = computed(() => store.session?.turns.filter(turn => !turn.followup && turn.submittedAt).length || 0);
const progressPercent = computed(() => store.session ? Math.round(processedMain.value / store.session.settings.mainQuestionLimit * 100) : 0);
let loadEpoch = 0;
async function loadResume() {
  const token = ++loadEpoch; resume.value = null; config.value = null; consentForm.value?.reset();
  if (!resumeId.value) return;
  try { const result = await storageManager.read(resumeId.value); if (token !== loadEpoch) return; if (!result) throw new Error('所选简历不存在。'); resume.value = result; settings.targetRole = result.basic.title || ''; }
  catch (cause) { pageError.value = cause instanceof Error ? cause.message : '读取简历失败'; }
}
async function enter() {
  loading.value = true; pageError.value = ''; draftDirty.value = false;
  try {
    if (!storage.config) await storage.init();
    await workbench.init();
    const id = String(route.params.sessionId ?? 'new');
    if (id === 'new') {
      store.reset(); resumeId.value = String(route.query.resumeId ?? workbench.resumeList[0]?.id ?? ''); await loadResume();
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
onBeforeUnmount(() => { window.removeEventListener('beforeunload', beforeUnload); store.pause(); store.revokeConsent(); });
function applied(id: string) { ElMessage.success('已按优化审核结果采纳，可用新版本开始面试。'); void router.push(`/interview/new?resumeId=${encodeURIComponent(id)}`); }
</script>
<template>
  <div class="interview-page">
    <AppHeader title="文字模拟面试" subtitle="真实经历，逐题练习" show-back back-label="面试记录" @back="router.push('/interviews')" />
    <main>
      <div v-if="loading" class="page-notice" role="status">正在读取本机数据…</div>
      <el-alert v-if="pageError || store.error" type="error" :closable="false" show-icon :title="pageError || store.error" />
      <el-alert v-if="storage.initializationWarning" type="warning" :closable="false" :title="storage.initializationWarning" />
      <template v-if="!loading && !store.session">
        <header class="page-intro"><span class="eyebrow">面试练习室</span><h1>从你的真实经历，开始一场对话</h1><p>先选简历与面试方向，再确认模型和发送范围。一次一题，按自己的节奏练习。</p></header>
        <div class="setup-layout">
          <div class="setup-main">
            <section class="card setup-card">
              <div class="section-heading"><span class="section-number">01</span><div><h2>开始设置</h2><p>岗位信息帮助面试官更有针对性地提问。</p></div></div>
              <div class="fields">
                <label>来源简历<select v-model="resumeId" aria-label="来源简历" @change="loadResume"><option value="">选择简历</option><option v-for="item in workbench.resumeList" :key="item.id" :value="item.id">{{ item.title }}</option></select></label>
                <label>目标岗位<input v-model="settings.targetRole" maxlength="200" placeholder="例如：前端开发工程师" /></label>
                <label>目标级别<input v-model="settings.level" maxlength="200" /></label>
                <label>方向<select v-model="settings.direction" aria-label="面试方向"><option>综合</option><option>项目深挖</option><option>岗位专业</option><option>行为面试</option></select></label>
                <label>模式<select v-model="settings.mode" aria-label="模式"><option value="training">训练：答后点评，再手动继续</option><option value="real">真实模拟：结束后统一反馈</option></select></label>
                <label>主问题数<select v-model="settings.mainQuestionLimit" aria-label="主问题数"><option :value="5">5</option><option :value="8">8</option><option :value="12">12</option></select></label>
              </div>
              <label>JD（可选，不提供时不会推断目标公司标准）<textarea v-model="settings.jd" rows="4" maxlength="15000" placeholder="粘贴岗位要求；留空也可围绕简历进行面试。" /></label>
              <div class="setup-options"><label class="check"><input v-model="generalize" type="checkbox" />泛化公司与学校名称（正文请自行检查）</label><label class="check"><input v-model="persistence" type="checkbox" />保存到本机（默认仅内存）</label></div>
            </section>
            <InterviewConsent ref="consentForm" :preview="preview" @confirmed="confirmed" @changed="invalidate" />
            <div class="start-row"><p>{{ config ? '发送范围已确认，可以开始。' : '完成模型与发送确认后，即可开始面试。' }}</p><el-button type="primary" size="large" :disabled="!resume || !config || store.busy" @click="start">冻结快照并开始</el-button></div>
          </div>
          <aside class="setup-guide card">
            <span class="eyebrow">本次练习</span><h2>{{ settings.mode === 'training' ? '边练边调整' : '接近真实面试的节奏' }}</h2><p>{{ settings.mode === 'training' ? '每次回答后查看教练反馈，整理思路后再继续。' : '过程中不展示教练点评，结束后统一回看与复盘。' }}</p>
            <AiWorkflowSteps :steps="['准备', '问答', '复盘']" :current="0" label="面试流程" />
            <dl class="practice-facts"><div><dt>主问题</dt><dd>{{ settings.mainQuestionLimit }} 道</dd></div><div><dt>追问</dt><dd>每题最多 1 次</dd></div><div><dt>面试方向</dt><dd>{{ settings.direction }}</dd></div></dl>
            <details class="quiet-details"><summary>请求次数与使用边界</summary><p>初始化 1 次，继续时最多 1 次面试官请求；训练模式每次作答另加 1 次教练请求，最终报告 1 次。手动重试也可能收费。</p><p>Loop Agent 是有界追问循环；项目深挖围绕职责、取舍与验证，不联网、不无限自主执行。</p></details>
            <p class="guide-footnote">不生成虚构经历，不给录用概率。真实回答，比完美答案更重要。</p>
          </aside>
        </div>
      </template>
      <template v-else-if="store.session">
        <section class="card session-progress">
          <div class="session-heading"><div><div class="session-tags"><span class="eyebrow">{{ store.session.settings.mode === 'real' ? '真实模拟' : '训练模式' }}</span><span>{{ store.session.settings.direction }}</span></div><h1>{{ store.session.settings.targetRole || '通用面试' }}</h1></div><span class="status-pill" :class="`is-${store.session.status}`" role="status"><span aria-hidden="true" />{{ statusLabels[store.session.status] }}</span></div>
          <div class="progress-caption"><span>主问题 {{ store.currentTurn?.mainNumber ?? 0 }} / {{ store.session.settings.mainQuestionLimit }} <strong v-if="store.currentTurn?.followup">· 追问 1/1</strong></span><span>已处理 {{ processedMain }} 道主问题（含跳过）</span></div>
          <div class="progress-track" role="progressbar" aria-label="主问题处理进度" :aria-valuenow="processedMain" :aria-valuemax="store.session.settings.mainQuestionLimit" :aria-valuemin="0"><span :style="{ width: `${progressPercent}%` }" /></div>
          <div class="session-controls">
            <AiWorkflowSteps :steps="['准备', '问答', '复盘']" :current="store.session.report ? 2 : 1" :complete="!!store.session.report" label="面试流程" />
            <div class="actions"><el-button v-if="store.session.status !== 'completed' && !['paused', 'interrupted'].includes(store.session.status)" @click="store.pause">暂停 / 取消请求</el-button><el-button v-if="['paused', 'interrupted'].includes(store.session.status)" type="primary" plain @click="store.resume">恢复阶段（不自动请求）</el-button><el-button v-if="store.session.status === 'failed'" :disabled="store.busy || !store.consented" type="primary" plain @click="store.retry">仅重试 {{ store.session.pendingStage }} 步骤</el-button><el-button v-if="store.session.status !== 'completed'" :disabled="!store.consented || (store.busy && store.session.pendingStage === 'report')" @click="confirmFinish">结束并生成报告</el-button></div>
          </div>
          <el-button v-if="store.compatibilityError" text type="primary" @click="store.enableCompatibilityMode">选择兼容模式（省略 response_format），然后手动重试</el-button>
        </section>
        <div class="session-layout" :class="{ 'needs-consent': !store.consented }">
          <div class="session-main">
            <InterviewReport v-if="store.session.report" :session="store.session" @configure="providerDialog = true" @applied="applied" />
            <details v-if="store.session.report" class="transcript"><summary>查看本轮问答记录 · {{ store.session.turns.length }} 条问题</summary><InterviewConversation :session="store.session" :busy="store.busy" :consented="store.consented" @draft="value => draftDirty = value" /></details>
            <InterviewConversation v-else :session="store.session" :busy="store.busy" :consented="store.consented" @answer="store.submitAnswer" @continue="store.continueInterview" @draft="value => draftDirty = value" />
          </div>
          <aside class="session-sidebar">
            <details v-if="store.session.status !== 'completed'" class="access-panel card" :open="!store.consented"><summary>模型与发送范围 <span>{{ store.consented ? '已确认' : '需要确认' }}</span></summary><InterviewConsent :preview="preview" :frozen-provider="store.session.provider" :disabled="store.busy" @confirmed="confirmed" @changed="invalidate" /></details>
            <section class="card session-tools"><div class="section-heading"><div><h2>本次练习</h2><p>{{ store.session.provider.model }}</p></div></div><dl class="practice-facts"><div><dt>请求次数</dt><dd>{{ store.session.usage.calls }}</dd></div><div><dt>输入 tokens</dt><dd>{{ store.session.usage.promptTokens.toLocaleString() }}</dd></div><div><dt>输出 tokens</dt><dd>{{ store.session.usage.completionTokens.toLocaleString() }}</dd></div></dl><p class="microcopy">服务未返回 usage 时为 0，不估算费用。</p><div class="save-state" :class="{ 'is-saved': store.session.persistence && !store.unsaved }">{{ store.session.persistence && !store.unsaved ? '✓ 检查点已保存到本机' : '当前有仅内存 / 未保存内容' }}</div><el-button @click="store.setPersistence(true)">{{ store.session.persistence ? '保存当前检查点' : '选择保存到本机' }}</el-button><p v-if="store.storageError" class="error" role="alert">{{ store.storageError }}<el-button text @click="store.setPersistence(false)">仅内存继续</el-button></p><div class="export-actions"><el-button text @click="downloadInterview(store.session, 'json')">导出 JSON</el-button><el-button text @click="downloadInterview(store.session, 'markdown')">导出 Markdown</el-button></div></section>
            <details class="card resume-summary"><summary>本次简历快照</summary><p class="microcopy">原简历的后续编辑不会改变本次面试。</p><p>{{ store.session.context.basic.summary || store.session.context.basic.title || '未填写个人简介' }}</p><ul><li v-for="item in store.session.context.projects" :key="item.id">{{ item.name }}<span>{{ item.role }}</span></li><li v-for="item in store.session.context.experiences" :key="item.id">{{ item.company }}<span>{{ item.position }}</span></li></ul><details class="quiet-details"><summary>查看完整发送数据</summary><pre>{{ JSON.stringify(store.session.context, null, 2) }}</pre></details></details>
          </aside>
        </div>
      </template>
      <footer class="storage-note">记录仅在当前浏览器保存，不随简历目录迁移，也不包含在简历全量备份中。可在面试记录页导出或删除。</footer>
    </main>
    <el-dialog v-model="providerDialog" title="配置 AI 服务与会话密钥" width="var(--ui-dialog-width-lg)"><AiProviderSettingsPanel /></el-dialog>
  </div>
</template>

<style scoped>
.interview-page { min-height: 100vh; background: var(--ui-bg-page); color: var(--ui-text-main); }
main { max-width: var(--ui-content-max-width); width: 100%; margin: 0 auto; padding: var(--ui-space-8) var(--ui-page-gutter); display: grid; gap: var(--ui-space-6); }
.card { min-width: 0; background: var(--ui-bg-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); padding: var(--ui-space-6); }
.page-intro h1, .session-heading h1 { font-size: var(--ui-font-xl); font-weight: 650; line-height: 1.4; margin: var(--ui-space-2) 0; overflow-wrap: anywhere; } .page-intro p { color: var(--ui-text-secondary); margin: 0; }
.eyebrow { font-size: var(--ui-font-xs); color: var(--ui-primary); font-weight: 600; letter-spacing: .05em; }
h2 { font-size: var(--ui-font-lg); font-weight: 600; margin: 0; } p { font-size: var(--ui-font-md); line-height: 1.75; overflow-wrap: anywhere; }
.setup-layout, .session-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--ui-space-6); align-items: start; }.setup-main, .session-main, .session-sidebar { min-width: 0; display: grid; gap: var(--ui-space-4); }.setup-guide, .session-sidebar { position: sticky; top: var(--ui-space-6); }
.section-heading { display: flex; align-items: center; gap: var(--ui-space-3); margin-bottom: var(--ui-space-6); }.section-heading p { margin: var(--ui-space-1) 0 0; color: var(--ui-text-muted); font-size: var(--ui-font-sm); }.section-number { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; font-size: var(--ui-font-sm); font-weight: 600; color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 7%, var(--ui-bg-surface)); border-radius: var(--ui-radius-md); }
.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-4); } label { display: grid; gap: var(--ui-space-2); margin-bottom: var(--ui-space-4); font-size: var(--ui-font-sm); color: var(--ui-text-secondary); font-weight: 500; } .fields label { margin: 0; }.fields + label { margin-top: var(--ui-space-4); }
input, select, textarea { width: 100%; min-width: 0; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: var(--ui-space-2) var(--ui-space-3); min-height: var(--ui-control-height); font: inherit; background: var(--ui-bg-surface); color: var(--ui-text-main); } textarea { resize: vertical; line-height: 1.7; }.check { display: flex; align-items: flex-start; font-weight: 400; margin: 0; }.check input { width: auto; min-height: auto; margin-top: var(--ui-space-1); accent-color: var(--ui-primary); }.setup-options { display: grid; gap: var(--ui-space-3); padding-top: var(--ui-space-4); border-top: 1px solid var(--ui-border); }
.setup-guide > h2 { margin-top: var(--ui-space-2); }.setup-guide > p { color: var(--ui-text-secondary); font-size: var(--ui-font-sm); }.setup-guide :deep(.workflow) { margin: var(--ui-space-6) 0; }.practice-facts { margin: 0; display: grid; gap: var(--ui-space-3); font-size: var(--ui-font-sm); }.practice-facts > div { display: flex; justify-content: space-between; gap: var(--ui-space-3); }.practice-facts dt { color: var(--ui-text-muted); }.practice-facts dd { margin: 0; text-align: right; font-weight: 550; font-variant-numeric: tabular-nums; }.guide-footnote { border-top: 1px solid var(--ui-border); padding-top: var(--ui-space-4); margin-top: var(--ui-space-6); }
.start-row { display: flex; justify-content: space-between; gap: var(--ui-space-4); align-items: center; padding: var(--ui-space-2) 0; }.start-row p { margin: 0; color: var(--ui-text-muted); font-size: var(--ui-font-sm); }
.session-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4); }.session-tags { display: flex; align-items: center; gap: var(--ui-space-3); font-size: var(--ui-font-xs); color: var(--ui-text-muted); }.status-pill { display: inline-flex; align-items: center; gap: var(--ui-space-2); padding: var(--ui-space-1) var(--ui-space-3); border-radius: var(--ui-radius-lg); background: var(--ui-bg-subtle); color: var(--ui-text-secondary); font-size: var(--ui-font-xs); white-space: nowrap; }.status-pill > span { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }.is-running, .is-answering { color: var(--ui-primary); }.is-failed { color: var(--ui-danger); }.is-completed { color: var(--ui-success); }
.progress-caption { display: flex; justify-content: space-between; gap: var(--ui-space-3); margin: var(--ui-space-4) 0 var(--ui-space-2); font-size: var(--ui-font-xs); color: var(--ui-text-muted); }.progress-caption strong { color: var(--ui-primary); font-weight: 500; }.progress-track { height: 4px; border-radius: var(--ui-radius-sm); background: var(--ui-bg-hover); overflow: hidden; }.progress-track > span { display: block; height: 100%; background: var(--ui-primary); transition: width var(--ui-duration-normal) ease; }
.session-controls { display: flex; justify-content: space-between; gap: var(--ui-space-6); align-items: center; margin-top: var(--ui-space-4); }.session-controls > :first-child { flex: 1; max-width: 320px; }.actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); }.actions :deep(.el-button) { margin: 0; }.session-tools .section-heading { margin-bottom: var(--ui-space-4); }.session-tools > :deep(.el-button) { width: 100%; }.export-actions { display: flex; justify-content: space-between; margin-top: var(--ui-space-3); }.export-actions :deep(.el-button) { margin: 0; padding-inline: var(--ui-space-1); }
.microcopy, .quiet-details p { font-size: var(--ui-font-xs); color: var(--ui-text-muted); line-height: 1.7; }.save-state { margin: var(--ui-space-4) 0 var(--ui-space-3); font-size: var(--ui-font-xs); color: var(--ui-warning); }.save-state.is-saved { color: var(--ui-success); }.error { color: var(--ui-danger); }
summary { cursor: pointer; font-size: var(--ui-font-sm); line-height: var(--ui-line-height); }.quiet-details { margin-top: var(--ui-space-4); color: var(--ui-text-secondary); }.access-panel > summary { font-weight: 550; }.access-panel > summary > span { color: var(--ui-text-muted); font-size: var(--ui-font-xs); font-weight: 400; margin-left: var(--ui-space-2); }.access-panel { padding: var(--ui-space-4); }.access-panel :deep(.consent-card) { border: 0; padding: var(--ui-space-4) 0 0; }.access-panel :deep(.fields) { grid-template-columns: minmax(0, 1fr); }.access-panel :deep(.consent-heading) { display: none; }.access-panel :deep(.el-button) { max-width: 100%; white-space: normal; height: auto; min-height: var(--ui-control-height); margin: var(--ui-space-2) 0 0; }
.resume-summary ul { margin: var(--ui-space-3) 0; padding: 0; list-style: none; }.resume-summary li { font-size: var(--ui-font-sm); padding: var(--ui-space-2) 0; border-bottom: 1px solid var(--ui-border); overflow-wrap: anywhere; }.resume-summary li span { display: block; font-size: var(--ui-font-xs); color: var(--ui-text-muted); }.resume-summary > p { font-size: var(--ui-font-sm); }.transcript > summary { padding: var(--ui-space-4); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); background: var(--ui-bg-surface); }.transcript[open] > summary { margin-bottom: var(--ui-space-3); } pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow: auto; font-size: var(--ui-font-xs); }.storage-note { padding: var(--ui-space-4) 0; text-align: center; color: var(--ui-text-muted); font-size: var(--ui-font-xs); line-height: 1.7; }.page-notice { color: var(--ui-text-muted); }
@media (max-width: 1024px) { .setup-layout, .session-layout { grid-template-columns: minmax(0, 1fr); }.setup-guide, .session-sidebar { position: static; }.session-sidebar { grid-template-columns: repeat(2, minmax(0, 1fr)); }.access-panel { grid-column: 1 / -1; }.access-panel :deep(.fields) { grid-template-columns: repeat(2, minmax(0, 1fr)); }.needs-consent .session-sidebar { order: -1; }.session-controls { align-items: flex-start; flex-wrap: wrap; }.session-controls > :first-child { flex-basis: 100%; } }
@media (max-width: 768px) { main { padding-top: var(--ui-space-6); gap: var(--ui-space-4); }.card { padding: var(--ui-space-4); }.page-intro h1, .session-heading h1 { font-size: var(--ui-font-title); }.fields, .session-sidebar { grid-template-columns: minmax(0, 1fr); }.session-heading { align-items: flex-start; }.progress-caption { flex-wrap: wrap; }.start-row { align-items: stretch; flex-direction: column; }.start-row :deep(.el-button) { width: 100%; }.actions :deep(.el-button) { padding-inline: var(--ui-space-3); white-space: normal; min-height: var(--ui-control-height); height: auto; }.access-panel :deep(.fields) { grid-template-columns: minmax(0, 1fr); } }
</style>
