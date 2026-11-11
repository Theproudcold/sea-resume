<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { ArrowRight, FolderOpened, Lock, Plus } from '@element-plus/icons-vue';
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
          <h2 id="start-title">文字模拟面试</h2>
          <p>从你的简历出发，练习表达、复盘回答。在这里继续上次面试，或回看已保存的报告。</p>
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
        <p class="quiet-note"><Lock aria-hidden="true" /> 由你确认发送范围，不会自动请求 AI</p>
      </section>

      <article v-if="memorySession" class="memory-card" aria-labelledby="memory-title">
        <div class="memory-copy">
          <div class="record-title"><h2 id="memory-title">{{ memorySession.settings.targetRole || '通用面试' }}</h2><span class="status status--memory">仅本次会话</span></div>
          <p><span>当前内存会话（尚未保存）</span><span>刷新或关闭页面后可能丢失，请及时导出。</span></p>
        </div>
        <el-button :disabled="locked" @click="router.push(`/interview/${memorySession.id}`)">回到会话 / 导出</el-button>
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
            <h3>还没有已保存的面试</h3>
            <p>从上方开始一次练习，并选择“保存到本机”。未保存的面试只在当前会话中保留。</p>
          </div>
          <article v-for="record in records" :key="record.id" class="record-card">
            <div class="record-heading">
              <div class="record-title"><h3>{{ record.settings.targetRole || '通用面试' }}</h3><span class="status" :class="{ 'status--success': record.report && !record.report.incomplete, 'status--warning': record.report?.incomplete || record.status === 'failed' }">{{ statusLabel(record) }}</span></div>
              <span class="mode-label"><span>{{ record.settings.mode === 'real' ? '真实模拟' : '训练模式' }}</span><span>{{ record.settings.direction }}</span></span>
            </div>
            <p class="record-source">{{ resumeTitle(record.sourceResumeId) }}</p>
            <div class="record-meta"><span class="record-progress">主问题 <strong>{{ record.turns[record.turns.length - 1]?.mainNumber ?? 0 }}</strong> / {{ record.settings.mainQuestionLimit }}</span><time :datetime="record.updatedAt">更新于 {{ formatTime(record.updatedAt) }}</time></div>
            <div class="record-footer">
              <div class="actions"><el-button :disabled="locked" @click="router.push(`/interview/${record.id}`)">{{ record.report ? '查看报告' : '继续面试' }}</el-button><span v-if="!record.report" class="action-hint">恢复后不会自动请求</span></div>
              <div class="actions secondary-actions"><span class="export-label">导出</span><el-button text size="small" :disabled="locked" :aria-label="`导出 ${record.settings.targetRole || '通用面试'} 为 JSON`" @click="exportRecord(record, 'json')">JSON</el-button><el-button text size="small" :disabled="locked" :aria-label="`导出 ${record.settings.targetRole || '通用面试'} 为 Markdown`" @click="exportRecord(record, 'markdown')">Markdown</el-button><el-button type="danger" text size="small" :disabled="locked" :aria-label="`删除面试记录：${record.settings.targetRole || '通用面试'}`" @click="remove('interview', record.id)">删除</el-button></div>
            </div>
          </article>
        </div>
        <div v-else class="record-list">
          <div v-if="initialized && !busy && !optimizationRecords.length" class="empty-state">
            <h3>还没有已保存的简历优化</h3><p>在简历编辑器中使用 AI 优化，并选择保存到本机后，可在这里管理对应记录。</p><el-button :disabled="locked" @click="router.push('/')">返回工作台</el-button>
          </div>
          <article v-for="record in optimizationRecords" :key="record.id" class="record-card optimization-card">
            <div class="optimization-copy"><div class="record-title"><h3>{{ resumeTitle(record.sourceResumeId) }}</h3><span class="status">{{ stageLabels[record.stage || ''] || '已保存' }}</span></div><p class="record-meta"><span>简历优化</span><time :datetime="record.updatedAt">更新于 {{ formatTime(record.updatedAt) }}</time></p><p class="record-id">记录编号 {{ record.id }}</p></div>
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
.history-page {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-body);
  font-size: var(--text-md);
  line-height: 1.55;
}

.history-main {
  display: grid;
  gap: var(--space-lg);
  width: 100%;
  max-width: var(--ui-content-max-width);
  margin: 0 auto;
  padding: var(--space-xl) var(--ui-page-gutter) var(--space-2xl);
}

h2, h3, p { margin: 0; }
h2, h3 { font-family: var(--font-display); font-weight: 600; letter-spacing: var(--tracking-display); }
h2 { font-size: var(--text-xl); line-height: 1.25; text-wrap: balance; }
h3 { font-size: var(--text-md); line-height: 1.35; }
svg { flex: 0 0 auto; width: 16px; height: 16px; }
p, h2, h3, time, .record-id { min-width: 0; overflow-wrap: break-word; }

/* Start: one card, the resume picker beside the one cobalt action. */
.start-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  align-items: start;
  gap: var(--space-md) var(--space-xl);
  padding: var(--space-lg);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper-3);
  box-shadow: var(--shadow-card);
}

.start-intro {
  display: grid;
  gap: var(--space-xs);
  min-width: 0;
}

.start-intro h2 { font-size: var(--text-2xl); }

.start-intro > p {
  max-width: 48ch;
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}

.start-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-xs) var(--space-sm);
  min-width: 0;
}

.start-form > :is(label, h3, p) {
  grid-column: 1 / -1;
}

.start-form > .el-button:not(.start-button) {
  grid-column: 1 / -1;
  justify-self: start;
}

.start-form label {
  color: var(--color-muted);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 500;
}

.start-form > p {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}

.start-form .start-button { grid-column: 2; }

.resume-select { width: 100%; min-width: 0; }
.resume-select :deep(.el-select__wrapper) { min-height: var(--control-height); }
.start-button { min-height: var(--control-height); }
.start-button .el-icon { margin-left: var(--space-xs); }

.start-form .form-hint {
  color: var(--color-muted);
  font-size: var(--text-xs);
}

.quiet-note {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  gap: var(--space-2xs);
  padding-top: var(--space-sm);
  border-top: var(--rule-hair) solid var(--color-rule);
  color: var(--color-muted);
  font-size: var(--text-xs);
}

.quiet-note svg { width: 14px; height: 14px; }

/* Unsaved in-memory session: a reminder on the warning wash. */
.memory-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm) var(--space-md);
  padding: var(--space-md) var(--space-lg);
  border: var(--rule-hair) solid color-mix(in oklab, var(--color-warning) 40%, transparent);
  border-radius: var(--radius-card);
  background: var(--color-warning-wash);
  color: var(--color-ink);
}

.memory-copy { flex: 1 1 320px; min-width: 0; }
.memory-copy h2 { font-size: var(--text-lg); }

.memory-copy p {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-md);
  margin-top: var(--space-2xs);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}

/* Records: a card whose rows split on hairlines. */
.records-panel {
  min-width: 0;
  overflow: hidden;
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper-3);
  box-shadow: var(--shadow-card);
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-lg) var(--space-lg) var(--space-md);
}

.section-heading p {
  margin-top: var(--space-2xs);
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.local-label {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  color: var(--color-muted);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 500;
  white-space: nowrap;
}

/* Record type: keys on a sunken tray, the chosen one raised. */
.category-bar {
  display: inline-flex;
  gap: var(--space-3xs);
  margin: 0 var(--space-lg) var(--space-md);
  padding: var(--space-3xs);
  border-radius: var(--radius-input);
  background: var(--color-sunken);
}

.category-bar button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  min-height: var(--control-height-s);
  padding: var(--space-2xs) var(--space-sm);
  border: 0;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--color-ink-2);
  cursor: pointer;
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 500;
  white-space: nowrap;
  transition: background-color var(--dur-micro) var(--ease-out), color var(--dur-micro) var(--ease-out), box-shadow var(--dur-micro) var(--ease-out), transform var(--dur-micro) var(--ease-out);
}

.category-bar button span {
  min-width: 20px;
  padding: 0 var(--space-2xs);
  border-radius: var(--radius-s);
  background: var(--color-paper-2);
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.category-bar button.selected {
  background: var(--color-paper-3);
  color: var(--color-ink);
  box-shadow: var(--shadow-key);
}

.category-bar button.selected span {
  background: var(--color-accent-wash);
  color: var(--color-accent);
}

.category-bar button:active {
  box-shadow: var(--shadow-key-press);
  transform: translateY(1px);
}

@media (hover: hover) {
  .category-bar button:not(.selected):hover { color: var(--color-ink); background: var(--color-paper-2); }
}

.record-list {
  min-width: 0;
  border-top: var(--rule-hair) solid var(--color-rule);
}

.record-card {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 13rem);
  align-items: start;
  gap: var(--space-xs) var(--space-lg);
  min-width: 0;
  padding: var(--space-md) var(--space-lg);
}

.record-card + .record-card { border-top: var(--rule-hair) solid var(--color-rule); }

.record-heading { display: grid; gap: var(--space-2xs); min-width: 0; }

.record-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs);
  min-width: 0;
}

.record-title h3 { font-size: var(--text-lg); }

.status {
  display: inline-flex;
  padding: 0 var(--space-xs);
  border-radius: var(--radius-input);
  background: var(--color-paper-2);
  color: var(--color-ink-2);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 500;
  line-height: 1.7;
  white-space: nowrap;
}

.status--success { background: var(--color-success-wash); color: var(--color-success); }
.status--warning, .status--memory { background: var(--color-warning-wash); color: var(--color-warning); }
.memory-card .status--memory { background: var(--color-paper-3); }

.mode-label, .record-source, .record-meta, .action-hint, .export-label, .record-id {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}

.mode-label {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-md);
  color: var(--color-muted);
  font-family: var(--font-display);
  font-weight: 500;
}

.record-source { padding-top: var(--space-2xs); }

.record-meta {
  display: grid;
  justify-items: end;
  gap: var(--space-2xs);
  font-variant-numeric: tabular-nums;
}

.record-meta time { color: var(--color-muted); font-size: var(--text-xs); }

.record-progress { font-family: var(--font-display); font-weight: 500; }
.record-progress strong { color: var(--color-ink); font-size: var(--text-lg); font-weight: 600; }

.record-footer {
  display: flex;
  flex-wrap: wrap;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding-top: var(--space-xs);
}

.actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xs); }
.actions :deep(.el-button), .history-main :deep(.el-button + .el-button) { margin-left: 0; }
.action-hint, .export-label { color: var(--color-muted); font-size: var(--text-xs); }
.export-label { font-family: var(--font-display); font-weight: 500; }

.optimization-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.optimization-copy { flex: 1 1 280px; min-width: 0; }

.optimization-card .record-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-md);
  margin-top: var(--space-2xs);
}

.record-id {
  margin-top: var(--space-2xs);
  color: var(--color-muted);
  font-family: var(--font-outlier);
  font-size: var(--text-xs);
}

/* Empty: what is empty and why, then the action that fills it. */
.empty-state {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-xs) var(--space-md);
  padding: var(--space-xl) var(--space-lg);
}

.empty-state p { flex: 1 1 320px; color: var(--color-ink-2); font-size: var(--text-sm); }

.reading-state {
  padding: var(--space-md) var(--space-lg);
  border-top: var(--rule-hair) solid var(--color-rule);
  color: var(--color-muted);
  font-size: var(--text-sm);
}

/* Privacy: a quiet disclosure row. */
.privacy-details {
  border-top: var(--rule-hair) solid var(--color-rule);
  border-bottom: var(--rule-hair) solid var(--color-rule);
  font-size: var(--text-sm);
}

.privacy-details summary {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  min-height: 44px;
  padding: var(--space-xs) var(--space-2xs);
  border-radius: var(--radius-input);
  color: var(--color-ink-2);
  cursor: pointer;
  font-family: var(--font-display);
  font-weight: 500;
  list-style: none;
  transition: background-color var(--dur-micro) var(--ease-out), color var(--dur-micro) var(--ease-out);
}

.privacy-details summary::-webkit-details-marker { display: none; }
.privacy-details summary:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.privacy-details summary:active { background: var(--color-accent-wash); color: var(--color-accent); }

@media (hover: hover) {
  .privacy-details summary:hover { background: var(--color-paper-2); color: var(--color-ink); }
}

.details-hint { margin-left: auto; color: var(--color-muted); font-size: var(--text-xs); }
.details-hint::after { content: ' ＋'; }
.privacy-details[open] .details-hint::after { content: ' −'; }

.privacy-details ul {
  margin: 0;
  padding: 0 0 var(--space-md) var(--space-lg);
  color: var(--color-ink-2);
  list-style: disc;
}

.privacy-details li + li { margin-top: var(--space-xs); }

.data-management { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-md); }
.data-management > div { flex: 1 1 560px; min-width: 0; }
.data-management .ui-danger-zone__description { margin-bottom: 0; }
.nothing-to-clear { margin-top: var(--space-xs); color: var(--color-muted); font-size: var(--text-xs); }

/* Notices: each on its own wash with a 40% edge. */
.notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper-3);
  color: var(--color-ink);
  font-size: var(--text-sm);
}

.notice--error { border-color: color-mix(in oklab, var(--color-error) 40%, transparent); background: var(--color-error-wash); color: var(--color-error); }
.notice--warning { border-color: color-mix(in oklab, var(--color-warning) 40%, transparent); background: var(--color-warning-wash); }
.notice--success { border-color: color-mix(in oklab, var(--color-success) 40%, transparent); background: var(--color-success-wash); color: var(--color-success); }

@media (max-width: 768px) {
  .history-main { gap: var(--space-md); padding-top: var(--space-lg); }
  .start-panel { grid-template-columns: minmax(0, 1fr); padding: var(--space-md); }
  .start-intro h2 { font-size: var(--text-xl); }
  .start-form { grid-template-columns: minmax(0, 1fr); }
  .start-form .start-button { grid-column: 1; justify-self: stretch; }
  .section-heading { padding: var(--space-md); }
  .local-label { display: none; }
  .category-bar { display: flex; margin-inline: var(--space-md); }
  .category-bar button { flex: 1 1 0; }
  .record-card { grid-template-columns: minmax(0, 1fr); padding-inline: var(--space-md); }
  .record-meta { justify-items: start; }
  .record-footer { align-items: flex-start; flex-direction: column; }
  .empty-state { padding: var(--space-lg) var(--space-md); }
  .memory-card { padding: var(--space-md); }
}
</style>

<style>
.interview-history-confirm.el-message-box {
  width: var(--ui-dialog-width-sm);
  max-width: calc(100vw - 32px);
  padding: var(--space-lg);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper-3);
  box-shadow: var(--shadow-float);
}

.interview-history-confirm .el-message-box__title { color: var(--color-ink); font-family: var(--font-display); font-size: var(--text-lg); font-weight: 600; }
.interview-history-confirm .el-message-box__message { color: var(--color-ink-2); font-family: var(--font-body); line-height: 1.7; overflow-wrap: break-word; }
.interview-history-confirm .el-message-box__btns { display: flex; flex-wrap: wrap; gap: var(--space-xs); padding-top: var(--space-lg); }
.interview-history-confirm .el-message-box__btns .el-button { min-height: var(--control-height); margin: 0; }
</style>
