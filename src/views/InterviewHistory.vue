<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { ArrowRight, ChatDotRound, Document, FolderOpened, Lock, Plus } from '@element-plus/icons-vue';
import AppHeader from '@/components/common/AppHeader.vue';
import { useWorkbenchStore } from '@/stores/workbench';
import { useStorageStore } from '@/stores/storage';
import { useInterviewStore } from '@/stores/interview';
import { useAiWorkspaceStore } from '@/stores/aiWorkspace';
import { aiWorkspaceRepository } from '@/services/ai/AiWorkspaceRepository';
import { downloadInterview } from '@/services/ai/interview';
import type { InterviewSession } from '@/types/interview';

const router = useRouter();
const workbench = useWorkbenchStore();
const storage = useStorageStore();
const interview = useInterviewStore();
const optimization = useAiWorkspaceStore();
const records = ref<InterviewSession[]>([]);
const optimizationRecords = ref<Array<{ id: string; sourceResumeId?: string; updatedAt?: string; stage?: string }>>([]);
const resumeId = ref('');
const busy = ref(false);
const confirming = ref(false);
const initialized = ref(false);
const error = ref('');
const success = ref('');
const category = ref<'interview' | 'optimization'>('interview');
const locked = computed(() => busy.value || confirming.value);
const memorySession = computed(() => interview.session && !records.value.some(record => record.id === interview.session?.id) ? interview.session : null);
const memoryOptimization = computed(() => optimization.run && !optimizationRecords.value.some(record => record.id === optimization.run?.id) ? optimization.run : null);
const hasData = computed(() => !!(records.value.length || optimizationRecords.value.length || interview.session || optimization.run));
const statusLabels: Record<InterviewSession['status'], string> = {
  ready: '待开始', running: '进行中', answering: '待回答', reviewing: '待复盘', paused: '已暂停', interrupted: '已中断', failed: '请求未完成', completed: '已完成',
};
const stageLabels: Record<string, string> = {
  configuration: '待配置', analysis: '分析中', supplement: '待补充事实', rewrite: '改写中', review: '审核中', ready: '待确认建议', completed: '已完成', failed: '请求未完成', cancelled: '已取消',
};
function statusLabel(record: InterviewSession) {
  return record.report ? record.report.incomplete ? '不完整报告' : '报告已完成' : statusLabels[record.status];
}
function resumeTitle(id?: string) {
  return workbench.resumeList.find(item => item.id === id)?.title || '原简历不可用';
}
function formatTime(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return '更新时间未知';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
async function refresh() {
  records.value = await aiWorkspaceRepository.list<InterviewSession>('interview');
  optimizationRecords.value = await aiWorkspaceRepository.list('optimization');
}
async function action(run: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; error.value = ''; success.value = '';
  try { await run(); } catch (cause) { error.value = cause instanceof Error ? cause.message : '本机记录操作失败'; }
  finally { busy.value = false; }
}
async function confirmDestruction(message: string, title: string, confirmButtonText: string) {
  if (locked.value) return false;
  confirming.value = true;
  try {
    await ElMessageBox.confirm(message, title, {
      type: 'warning', confirmButtonText, cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger', customClass: 'interview-history-confirm',
      distinguishCancelAndClose: true, closeOnClickModal: false, autofocus: false,
    });
    return true;
  } catch (cause) {
    if (cause !== 'cancel' && cause !== 'close') error.value = cause instanceof Error ? cause.message : '无法打开确认窗口';
    return false;
  } finally { confirming.value = false; }
}
async function remove(kind: 'interview' | 'optimization', id: string) {
  const isInterview = kind === 'interview';
  if (!await confirmDestruction(
    `仅删除这条${isInterview ? '面试记录（含全部回答和报告）' : '简历优化记录'}；若它是当前会话，也将关闭该会话。不可恢复，不影响简历和 API 服务配置。请先导出重要内容。`,
    isInterview ? '删除这条面试记录？' : '删除这条优化记录？', isInterview ? '删除面试记录' : '删除优化记录',
  )) return;
  await action(async () => {
    if (kind === 'interview' && interview.session?.id === id) { interview.pause(); await interview.checkpoint(); interview.reset(); }
    if (kind === 'optimization' && optimization.run?.id === id) { optimization.cancel(); await optimization.persist(); optimization.reset(); await optimization.setPersistence(false); }
    await aiWorkspaceRepository.delete(kind, id); await refresh();
    success.value = '记录已删除。';
  });
}
async function clearAll() {
  if (!hasData.value) return;
  if (!await confirmDestruction(
    '这会删除本浏览器所有面试回答 / 报告及简历优化记录，并关闭当前内存 AI 会话。不可恢复；不删除简历或 API 服务配置。请先从记录卡导出重要内容，再确认清空。',
    '清空全部 AI 记录？', '清空全部 AI 记录',
  )) return;
  await action(async () => {
    interview.pause(); optimization.cancel();
    await Promise.all([interview.checkpoint(), optimization.persist()]);
    interview.reset(); optimization.reset(); await optimization.setPersistence(false);
    await aiWorkspaceRepository.clear(); await refresh();
    success.value = '全部 AI 记录已清空，当前内存会话已关闭。简历与 API 服务配置未受影响。';
  });
}
async function exportRecord(record: InterviewSession, format: 'json' | 'markdown') {
  await action(async () => { downloadInterview(record, format); success.value = '已发起导出，请查看浏览器下载。'; });
}
async function load() {
  await action(async () => {
    if (!storage.config) await storage.init();
    await workbench.init(); resumeId.value = workbench.resumeList[0]?.id ?? ''; await refresh();
    initialized.value = true;
  });
}
onMounted(load);
</script>

<template>
  <div class="history-page">
    <AppHeader title="面试与 AI 记录" subtitle="本机工作记录" show-back back-label="工作台" @back="router.push('/')" />
    <main class="history-main">
      <div v-if="error || workbench.error" class="notice notice--error" role="alert">
        <span>{{ error || workbench.error }}</span><el-button size="small" :disabled="locked" @click="load">重新读取</el-button>
      </div>
      <p v-if="storage.initializationWarning" class="notice notice--warning" role="alert">{{ storage.initializationWarning }}</p>
      <p v-if="success" class="notice notice--success" role="status">{{ success }}</p>

      <section class="start-panel" aria-labelledby="start-title">
        <div class="start-intro">
          <span class="eyebrow"><ChatDotRound aria-hidden="true" /> 文字模拟面试</span>
          <h2 id="start-title">让每一次练习，都有迹可循</h2>
          <p>从你的简历出发，练习表达、复盘回答。<br class="desktop-break" />在这里继续上次面试，或回看已保存的报告。</p>
          <span class="quiet-note"><Lock aria-hidden="true" /> 由你确认发送范围，不会自动请求 AI</span>
        </div>
        <div class="start-form">
          <template v-if="!initialized">
            <h3>准备你的练习空间</h3>
            <p role="status">{{ busy ? '正在读取简历与本机记录…' : '暂未完成读取，请重试。' }}</p>
          </template>
          <template v-else-if="workbench.resumeList.length">
            <label id="resume-label" for="history-resume">选择一份简历</label>
            <el-select id="history-resume" v-model="resumeId" aria-label="选择一份简历" :disabled="locked" placeholder="请选择简历" class="resume-select">
              <el-option v-for="item in workbench.resumeList" :key="item.id" :label="item.title" :value="item.id" />
            </el-select>
            <el-button class="start-button" type="primary" :disabled="!resumeId || locked" @click="router.push(`/interview/new?resumeId=${encodeURIComponent(resumeId)}`)">设置并开始文字面试 <el-icon><ArrowRight /></el-icon></el-button>
            <p class="form-hint">先设置岗位与模式，再决定是否开始。</p>
          </template>
          <template v-else>
            <h3>先准备一份简历</h3>
            <p>还没有可用于面试的简历。创建简历后，即可围绕真实经历练习。</p>
            <el-button type="primary" :icon="Plus" :disabled="locked" @click="router.push('/templates')">创建第一份简历</el-button>
          </template>
        </div>
      </section>

      <article v-if="memorySession" class="memory-card" aria-labelledby="memory-title">
        <div class="memory-icon"><ChatDotRound aria-hidden="true" /></div>
        <div class="memory-copy">
          <div class="record-title"><h2 id="memory-title">{{ memorySession.settings.targetRole || '通用面试' }}</h2><span class="status status--warning">仅本次会话</span></div>
          <p>当前内存会话（尚未保存） · 刷新或关闭页面后可能丢失，请及时导出。</p>
        </div>
        <el-button type="primary" plain :disabled="locked" @click="router.push(`/interview/${memorySession.id}`)">回到会话 / 导出</el-button>
      </article>
      <div v-if="memoryOptimization" class="notice notice--warning" role="status">当前还有一条未保存到列表的简历优化会话。清空全部 AI 记录也会关闭它。</div>

      <section class="records-panel" aria-labelledby="records-title" :aria-busy="busy">
        <div class="section-heading"><div><h2 id="records-title">本机记录</h2><p>仅展示你选择“保存到本机”的记录</p></div><span class="local-label"><FolderOpened aria-hidden="true" /> 当前浏览器</span></div>
        <div class="category-bar" role="group" aria-label="记录类型">
          <button type="button" :class="{ selected: category === 'interview' }" :aria-pressed="category === 'interview'" @click="category = 'interview'">模拟面试 <span>{{ records.length }}</span></button>
          <button type="button" :class="{ selected: category === 'optimization' }" :aria-pressed="category === 'optimization'" @click="category = 'optimization'">简历优化 <span>{{ optimizationRecords.length }}</span></button>
        </div>
        <p v-if="busy" class="reading-state" role="status">正在读取 / 操作本机记录…</p>
        <div v-if="category === 'interview'" class="record-list">
          <div v-if="initialized && !busy && !records.length" class="empty-state">
            <span class="empty-icon"><ChatDotRound aria-hidden="true" /></span>
            <h3>还没有已保存的面试</h3>
            <p>从上方开始一次练习，并选择“保存到本机”。<br />未保存的面试只在当前会话中保留。</p>
            <span class="empty-caption">练习 → 保存 → 随时复盘</span>
          </div>
          <article v-for="record in records" :key="record.id" class="record-card">
            <div class="record-heading">
              <div class="record-title"><h3>{{ record.settings.targetRole || '通用面试' }}</h3><span class="status" :class="{ 'status--success': record.report && !record.report.incomplete, 'status--warning': record.report?.incomplete || record.status === 'failed' }">{{ statusLabel(record) }}</span></div>
              <span class="mode-label">{{ record.settings.mode === 'real' ? '真实模拟' : '训练模式' }} · {{ record.settings.direction }}</span>
            </div>
            <p class="record-source">{{ resumeTitle(record.sourceResumeId) }}</p>
            <div class="record-meta"><time :datetime="record.updatedAt">更新于 {{ formatTime(record.updatedAt) }}</time><span>主问题 {{ record.turns[record.turns.length - 1]?.mainNumber ?? 0 }} / {{ record.settings.mainQuestionLimit }}</span></div>
            <div class="record-footer">
              <div class="actions"><el-button type="primary" :disabled="locked" @click="router.push(`/interview/${record.id}`)">{{ record.report ? '查看报告' : '继续面试' }}</el-button><span v-if="!record.report" class="action-hint">恢复后不会自动请求</span></div>
              <div class="actions secondary-actions"><span class="export-label">导出</span><el-button size="small" :disabled="locked" :aria-label="`导出 ${record.settings.targetRole || '通用面试'} 为 JSON`" @click="exportRecord(record, 'json')">JSON</el-button><el-button size="small" :disabled="locked" :aria-label="`导出 ${record.settings.targetRole || '通用面试'} 为 Markdown`" @click="exportRecord(record, 'markdown')">Markdown</el-button><el-button type="danger" text size="small" :disabled="locked" :aria-label="`删除面试记录：${record.settings.targetRole || '通用面试'}`" @click="remove('interview', record.id)">删除</el-button></div>
            </div>
          </article>
        </div>
        <div v-else class="record-list">
          <div v-if="initialized && !busy && !optimizationRecords.length" class="empty-state">
            <span class="empty-icon"><Document aria-hidden="true" /></span><h3>还没有已保存的简历优化</h3><p>在简历编辑器中使用 AI 优化，并选择保存到本机后，<br />可在这里管理对应记录。</p><el-button plain :disabled="locked" @click="router.push('/')">返回工作台</el-button>
          </div>
          <article v-for="record in optimizationRecords" :key="record.id" class="record-card optimization-card">
            <div class="optimization-copy"><div class="record-title"><h3>{{ resumeTitle(record.sourceResumeId) }}</h3><span class="status">{{ stageLabels[record.stage || ''] || '已保存' }}</span></div><p class="record-meta">简历优化 · 更新于 {{ formatTime(record.updatedAt) }}</p><p class="record-id">记录编号 {{ record.id }}</p></div>
            <el-button type="danger" text :disabled="locked" :aria-label="`删除优化记录：${record.id}`" @click="remove('optimization', record.id)">删除优化记录</el-button>
          </article>
        </div>
      </section>

      <details class="privacy-details">
        <summary><Lock aria-hidden="true" /><span>关于本机保存与隐私</span><span class="details-hint">查看说明</span></summary>
        <ul><li>记录仅保存在当前浏览器，不随简历文件夹迁移，也不纳入简历全量备份。重要内容请单独导出。</li><li>API Key 不保存在记录中。刷新后需重新输入 Key 并确认发送范围，不会自动请求模型。</li></ul>
      </details>
      <section class="ui-danger-zone data-management" aria-labelledby="data-title">
        <div><h2 id="data-title" class="ui-danger-zone__title">AI 数据管理</h2><p class="ui-danger-zone__description">清空本浏览器的全部 AI 记录并关闭内存会话，不影响简历和 API 服务配置。操作不可恢复，请先导出。</p><p v-if="initialized && !hasData" class="nothing-to-clear">当前没有可清空的 AI 记录或内存会话。</p></div>
        <el-button type="danger" plain :disabled="locked || !hasData" @click="clearAll">清空全部 AI 记录</el-button>
      </section>
    </main>
  </div>
</template>

<style scoped>
.history-page { min-height: 100vh; background: var(--ui-bg-page); color: var(--ui-text-main); font-size: var(--ui-font-md); line-height: var(--ui-line-height); }
.history-main { width: 100%; max-width: var(--ui-content-max-width); margin: 0 auto; padding: var(--ui-space-8) var(--ui-page-gutter); display: grid; gap: var(--ui-space-6); }
h2, h3, p { margin: 0; }
h2 { font-size: var(--ui-font-lg); font-weight: 650; }
h3 { font-size: var(--ui-font-md); font-weight: 650; }
svg { width: 20px; height: 20px; flex: 0 0 auto; }
p, h2, h3, time, .record-id { overflow-wrap: anywhere; }
.start-panel { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: var(--ui-space-8); align-items: center; padding: var(--ui-space-8); border: 1px solid color-mix(in srgb, var(--ui-primary) 18%, var(--ui-border)); border-radius: var(--ui-radius-lg); background: var(--ui-bg-surface); box-shadow: var(--ui-shadow-sm); }
.eyebrow { display: flex; align-items: center; gap: var(--ui-space-2); color: var(--ui-primary); font-weight: 600; font-size: var(--ui-font-sm); margin-bottom: var(--ui-space-3); }
.start-intro h2 { font-size: var(--ui-font-xl); letter-spacing: -.02em; margin-bottom: var(--ui-space-3); }
.start-intro > p { color: var(--ui-text-secondary); line-height: 1.8; }
.quiet-note { display: flex; align-items: center; gap: var(--ui-space-1); margin-top: var(--ui-space-6); color: var(--ui-text-muted); font-size: var(--ui-font-xs); }
.quiet-note svg { width: 14px; height: 14px; }
.start-form { min-width: 0; padding: var(--ui-space-6); border-radius: var(--ui-radius-md); background: color-mix(in srgb, var(--ui-primary) 5%, var(--ui-bg-surface)); display: grid; gap: var(--ui-space-3); }
.start-form label { font-weight: 600; }
.start-form > p { color: var(--ui-text-secondary); font-size: var(--ui-font-sm); }
.resume-select { width: 100%; min-width: 0; }
.resume-select :deep(.el-select__wrapper) { min-height: var(--ui-control-height); }
.start-button { width: 100%; min-height: var(--ui-control-height); }
.start-button .el-icon { margin-left: var(--ui-space-2); }
.start-form .form-hint { text-align: center; font-size: var(--ui-font-xs); color: var(--ui-text-muted); }
.records-panel { min-width: 0; background: var(--ui-bg-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); }
.section-heading { display: flex; justify-content: space-between; align-items: center; gap: var(--ui-space-4); padding: var(--ui-space-6) var(--ui-space-6) var(--ui-space-4); }
.section-heading p { color: var(--ui-text-muted); font-size: var(--ui-font-sm); margin-top: var(--ui-space-1); }
.local-label { display: flex; align-items: center; gap: var(--ui-space-1); font-size: var(--ui-font-xs); color: var(--ui-text-muted); white-space: nowrap; }
.local-label svg { width: 16px; height: 16px; }
.category-bar { display: flex; gap: var(--ui-space-2); padding: 0 var(--ui-space-6) var(--ui-space-4); border-bottom: 1px solid var(--ui-border); }
.category-bar button { display: flex; align-items: center; justify-content: center; gap: var(--ui-space-2); min-height: var(--ui-control-height); padding: var(--ui-space-2) var(--ui-space-4); border: 1px solid transparent; border-radius: var(--ui-radius-md); background: var(--ui-bg-subtle); color: var(--ui-text-secondary); cursor: pointer; font: inherit; font-weight: 500; }
.category-bar button:hover { background: var(--ui-bg-hover); }
.category-bar button:active { border-color: var(--ui-primary); }
.category-bar button.selected { background: color-mix(in srgb, var(--ui-primary) 8%, var(--ui-bg-surface)); color: var(--ui-primary); border-color: color-mix(in srgb, var(--ui-primary) 22%, var(--ui-border)); }
.category-bar button span { min-width: 20px; padding: 0 var(--ui-space-1); border-radius: var(--ui-radius-sm); background: var(--ui-bg-surface); font-size: var(--ui-font-xs); font-variant-numeric: tabular-nums; }
.record-list { padding: 0 var(--ui-space-6); }
.record-card { min-width: 0; padding: var(--ui-space-6) 0; }
.record-card + .record-card { border-top: 1px solid var(--ui-border); }
.record-heading, .record-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--ui-space-3); }
.record-title { min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-2); }
.record-title h3 { font-size: var(--ui-font-lg); }
.status { display: inline-flex; border-radius: var(--ui-radius-sm); padding: var(--ui-space-1) var(--ui-space-2); background: color-mix(in srgb, var(--ui-primary) 7%, var(--ui-bg-surface)); color: var(--ui-primary); font-size: var(--ui-font-xs); font-weight: 500; }
.status--success { color: var(--ui-success); background: color-mix(in srgb, var(--ui-success) 8%, var(--ui-bg-surface)); }
.status--warning { color: var(--ui-warning); background: color-mix(in srgb, var(--ui-warning) 8%, var(--ui-bg-surface)); }
.mode-label, .record-source, .record-meta, .action-hint, .export-label, .record-id { font-size: var(--ui-font-sm); color: var(--ui-text-muted); }
.record-source { margin-top: var(--ui-space-2); color: var(--ui-text-secondary); }
.record-meta { display: flex; flex-wrap: wrap; gap: var(--ui-space-2) var(--ui-space-6); margin-top: var(--ui-space-2); font-variant-numeric: tabular-nums; }
.record-footer { margin-top: var(--ui-space-4); }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-2); }
.actions :deep(.el-button), .history-main :deep(.el-button + .el-button) { margin-left: 0; }
.secondary-actions { gap: var(--ui-space-2); }
.empty-state { display: flex; align-items: center; flex-direction: column; gap: var(--ui-space-2); padding: var(--ui-space-8) var(--ui-space-4); text-align: center; }
.empty-icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: var(--ui-radius-lg); color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 6%, var(--ui-bg-surface)); margin-bottom: var(--ui-space-1); }
.empty-icon svg { width: 24px; height: 24px; }
.empty-state p { color: var(--ui-text-muted); font-size: var(--ui-font-sm); line-height: 1.8; }
.empty-caption { font-size: var(--ui-font-xs); color: var(--ui-text-muted); margin-top: var(--ui-space-2); }
.memory-card { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-4); padding: var(--ui-space-6); border-radius: var(--ui-radius-lg); border: 1px solid color-mix(in srgb, var(--ui-warning) 32%, var(--ui-border)); background: var(--ui-bg-surface); }
.memory-icon { display: grid; place-items: center; color: var(--ui-warning); }
.memory-copy { flex: 1 1 320px; min-width: 0; }
.memory-copy p { font-size: var(--ui-font-sm); color: var(--ui-text-secondary); margin-top: var(--ui-space-2); }
.optimization-card { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--ui-space-4); }
.optimization-copy { flex: 1 1 280px; min-width: 0; }
.record-id { margin-top: var(--ui-space-1); font-size: var(--ui-font-xs); }
.reading-state { padding: var(--ui-space-4) var(--ui-space-6); color: var(--ui-text-muted); }
.privacy-details { border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-bg-surface); font-size: var(--ui-font-sm); }
.privacy-details summary { display: flex; align-items: center; gap: var(--ui-space-2); cursor: pointer; padding: var(--ui-space-4); color: var(--ui-text-secondary); border-radius: var(--ui-radius-md); }
.privacy-details summary:hover { background: var(--ui-bg-subtle); }
.privacy-details summary:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 2px; }
.privacy-details summary svg { width: 16px; height: 16px; }
.details-hint { margin-left: auto; color: var(--ui-text-muted); font-size: var(--ui-font-xs); }
.details-hint::after { content: ' ＋'; }
.privacy-details[open] .details-hint::after { content: ' −'; }
.privacy-details ul { margin: 0; padding: 0 var(--ui-space-8) var(--ui-space-4); list-style: disc; color: var(--ui-text-secondary); }
.privacy-details li + li { margin-top: var(--ui-space-2); }
.data-management { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--ui-space-4); }
.data-management > div { flex: 1 1 560px; min-width: 0; }
.data-management .ui-danger-zone__description { margin-bottom: 0; }
.nothing-to-clear { margin-top: var(--ui-space-2); color: var(--ui-text-muted); font-size: var(--ui-font-xs); }
.notice { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-space-3); padding: var(--ui-space-3) var(--ui-space-4); border-radius: var(--ui-radius-md); background: var(--ui-bg-surface); border: 1px solid var(--ui-border); }
.notice--error { color: var(--ui-danger); }
.notice--warning { color: var(--ui-text-secondary); border-color: color-mix(in srgb, var(--ui-warning) 35%, var(--ui-border)); }
.notice--success { color: var(--ui-success); }
@media (max-width: 768px) {
  .history-main { padding-top: var(--ui-space-4); gap: var(--ui-space-4); }
  .start-panel { grid-template-columns: minmax(0, 1fr); gap: var(--ui-space-6); padding: var(--ui-space-6); }
  .start-intro h2 { font-size: var(--ui-font-title); }
  .quiet-note { margin-top: var(--ui-space-4); }
  .start-form { padding: var(--ui-space-4); }
  .desktop-break { display: none; }
  .section-heading { padding: var(--ui-space-4); }
  .local-label { display: none; }
  .category-bar { padding: 0 var(--ui-space-4) var(--ui-space-4); }
  .category-bar button { flex: 1 1 0; padding-inline: var(--ui-space-2); }
  .record-list { padding: 0 var(--ui-space-4); }
  .record-card { padding-block: var(--ui-space-4); }
  .record-heading { align-items: flex-start; flex-direction: column; gap: var(--ui-space-2); }
  .record-footer { align-items: flex-start; flex-direction: column; gap: var(--ui-space-4); }
  .empty-state { padding: var(--ui-space-6) 0; }
  .memory-card { padding: var(--ui-space-4); }
  .memory-icon { display: none; }
  .memory-copy { flex-basis: 100%; }
}
</style>

<style>
.interview-history-confirm.el-message-box { width: var(--ui-dialog-width-sm); max-width: calc(100vw - 32px); border-radius: var(--ui-radius-lg); padding: var(--ui-space-6); box-shadow: var(--ui-shadow-md); }
.interview-history-confirm .el-message-box__title { font-size: var(--ui-font-lg); color: var(--ui-text-main); }
.interview-history-confirm .el-message-box__message { overflow-wrap: anywhere; line-height: 1.8; color: var(--ui-text-secondary); }
.interview-history-confirm .el-message-box__btns { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); padding-top: var(--ui-space-6); }
.interview-history-confirm .el-message-box__btns .el-button { margin: 0; min-height: var(--ui-control-height); }
</style>
