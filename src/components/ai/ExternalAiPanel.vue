<template>
  <el-drawer :model-value="visible" title="用文件交给外部 AI" size="min(640px, calc(100vw - 24px))" :before-close="beforeClose" @update:model-value="emit('update:visible', $event)">
    <div class="external-ai-panel">
      <el-alert type="warning" :closable="false" show-icon title="文件交换不连接本机 MCP">
        <p>实时管理全部简历请回到简历主页的「连接 Codex / Claude Code」。这里只导出可见正文，导入后仍需确认才保存。</p>
      </el-alert>
        <section v-if="session.entries.length" aria-labelledby="external-proposals-title">
          <h3 id="external-proposals-title">文件导入的草稿（{{ session.entries.length }}）</h3>
          <article v-for="entry in session.entries" :key="entry.proposal.proposalId" class="proposal-card">
            <div class="session-heading"><strong>{{ entry.proposal.explanation }}</strong><el-tag>{{ statusLabels[entry.status] }}</el-tag></div>
            <small>{{ entry.proposal.proposalId }}</small>
            <ol>
              <li v-for="(operation, index) in entry.proposal.operations" :key="index">
                <strong>{{ operationLabel(operation) }}</strong>
                <div class="diff-before">原：{{ currentValue(operation) }}</div>
                <div class="diff-after">新：{{ proposedValue(operation) }}</div>
              </li>
            </ol>
            <p v-if="entry.error" class="error-text" role="alert">{{ entry.error }}</p>
            <div v-if="entry.status === 'pending' || entry.status === 'conflict'" class="action-row">
              <el-button :disabled="busy" @click="reject(entry.proposal.proposalId)">拒绝</el-button>
              <el-button type="primary" :disabled="busy || entry.status === 'conflict'" @click="approve(entry.proposal.proposalId)">确认差异并保存</el-button>
            </div>
          </article>
        </section>
        <el-collapse>
          <el-collapse-item title="通过文件导入修改（无需实时连接）" name="files">
            <p>下载并解压工作区，在该目录启动 Codex CLI 或 Claude Code。让它读取 context/resume.json，按 AGENTS.md / CLAUDE.md 生成 proposals/*.json，再导入审核。请保持本面板打开。</p>
            <div class="action-row">
              <el-button :loading="busy" @click="exportContext">下载 AI 工作区</el-button>
              <el-button :disabled="busy" @click="fileInput?.click()">导入修改草稿</el-button>
              <input ref="fileInput" hidden type="file" accept=".json,application/json" aria-label="导入外部 AI 修改草稿" @change="importProposal" />
            </div>
          </el-collapse-item>
        </el-collapse>
      <el-alert v-if="errorMessage" type="error" :closable="false" :title="errorMessage" show-icon />
      <p class="session-note">已发给 CLI 的内容无法收回。文件导入的草稿只在本次打开面板期间保留，确认后可用编辑器“撤销”恢复。</p>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useResumeStore } from '@/stores/resume';
import type { ResumeAiOperation } from '@/types/ai';
import { ExternalAiSession, type ProposalStatus } from '@/services/ai/ExternalAiSession';
import { createExternalContextArchive, downloadContextArchive, readExternalProposal } from '@/services/ai/externalAiFiles';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [visible: boolean] }>();
const store = useResumeStore();
const session = reactive(new ExternalAiSession(() => store.exportData(), (proposal, assertAuthorized) => store.applyChangeProposal(proposal, assertAuthorized))) as ExternalAiSession;
const errorMessage = ref('');
const busy = ref(false);
const fileInput = ref<HTMLInputElement>();
const now = ref(Date.now());
const statusLabels: Record<ProposalStatus, string> = { pending: '待确认', applying: '保存中', applied: '已应用', rejected: '已拒绝', conflict: '版本冲突' };
const timer = setInterval(() => {
  now.value = Date.now();
  if (session.resumeId && session.expiresAt <= now.value) { session.revoke(); errorMessage.value = '文件交换已过期，请重新导出上下文。'; }
}, 1000);
watch(() => store.data.id, () => session.revoke());
watch(() => props.visible, visible => { if (!visible) session.revoke(); });
onBeforeUnmount(() => { clearInterval(timer); session.revoke(); });
function ensureFileSession() {
  if (!session.resumeId || session.expiresAt <= Date.now() || session.resumeId !== store.data.id) session.authorize();
}
function report(error: unknown) { errorMessage.value = error instanceof Error ? error.message : '操作失败。'; }
async function beforeClose(done: () => void) {
  if (busy.value || session.entries.some(entry => entry.status === 'applying')) return;
  if (session.entries.some(entry => entry.status === 'pending')) {
    try { await ElMessageBox.confirm('关闭会撤销外部 AI 授权并丢弃本次待审草稿，是否继续？', '关闭外部 AI', { type: 'warning' }); }
    catch { return; }
  }
  session.revoke(); done();
}
async function exportContext() {
  busy.value = true; errorMessage.value = '';
  try { ensureFileSession(); downloadContextArchive(await createExternalContextArchive(session)); }
  catch (error) { report(error); }
  finally { busy.value = false; }
}
async function importProposal(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  busy.value = true; errorMessage.value = '';
  try { await session.propose(await readExternalProposal(file)); }
  catch (error) { report(error); }
  finally { busy.value = false; }
}
function reject(id: string) { try { session.reject(id); } catch (error) { report(error); } }
async function approve(id: string) {
  busy.value = true; errorMessage.value = '';
  try { await session.approve(id); ElMessage.success('外部 AI 修改已保存，可使用编辑器撤销恢复。'); }
  catch (error) { report(error); }
  finally { busy.value = false; }
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.join('、');
  return String(value ?? '（空）').replace(/<[^>]*>/g, '').slice(0, 10000);
}
function operationLabel(operation: ResumeAiOperation) {
  if (operation.type === 'remove_entry') return `删除条目 · ${operation.collection}`;
  return 'field' in operation ? `${operation.type} · ${operation.field}` : operation.type;
}
function proposedValue(operation: ResumeAiOperation) {
  if (operation.type === 'set_layout') return operation.layout ? `${operation.layout.structure} / ${operation.layout.paper}` : '恢复内置模板';
  if (operation.type === 'remove_entry') return '删除此条目';
  return 'value' in operation ? text(operation.value) : '—';
}
function currentValue(operation: ResumeAiOperation) {
  if (operation.type === 'set_layout') return store.data.layout ? `${store.data.layout.structure} / ${store.data.layout.paper}` : '内置模板';
  if (operation.type === 'set_basic') return text(store.data.basic[operation.field]);
  if (!('field' in operation)) return '—';
  const collections = { update_experience: store.data.experiences, update_project: store.data.projects, update_education: store.data.education, update_skill: store.data.skills, update_custom_block: store.data.customBlocks };
  const item = collections[operation.type].find(item => item.id === operation.id);
  return text(item ? (item as unknown as Record<string, unknown>)[operation.field] : '条目已变化');
}
</script>

<style scoped>
.external-ai-panel { display: flex; flex-direction: column; gap: 20px; }
.external-ai-panel p { line-height: 1.65; margin: 8px 0; }
.external-ai-panel h3 { margin: 0 0 8px; font-size: 16px; }
.external-ai-panel section { border-top: 1px solid var(--color-rule); padding-top: 18px; }
.external-ai-panel :deep(.el-checkbox) { white-space: normal; height: auto; align-items: flex-start; }
.external-ai-panel :deep(.el-collapse) { border-top: none; }
.external-ai-panel :deep(.el-collapse-item__header) { border-bottom: none; }
.session-heading, .action-row, .picker-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.session-heading { justify-content: space-between; }
.action-row { margin-top: 12px; }
.picker-row { margin: 12px 0 4px; }
.steps { margin: 8px 0; padding-left: 20px; }
.steps li { margin: 6px 0; line-height: 1.65; }
.action-row :deep(.el-button + .el-button) { margin-left: 0; }
pre { overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; background: var(--color-paper-2); border-radius: var(--radius-input); font-size: 12px; }
.proposal-card { border: 1px solid var(--color-rule); border-radius: var(--radius-card); padding: 14px; margin-top: 12px; }
.proposal-card small { overflow-wrap: anywhere; color: var(--ui-text-secondary); }
.proposal-card ol { padding-left: 20px; }
.proposal-card li { margin: 12px 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.diff-before { padding: 8px; border-radius: var(--radius-s); background: var(--color-error-wash); color: var(--color-error); }
.diff-after { padding: 8px; border-radius: var(--radius-s); background: var(--color-success-wash); color: var(--color-success); }
.error-text { color: var(--color-error); }
.session-note { font-size: 12px; color: var(--ui-text-secondary); }
</style>
