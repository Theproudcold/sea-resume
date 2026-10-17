<template>
  <el-drawer :model-value="visible" title="外部 AI · Codex / Claude Code" size="min(640px, calc(100vw - 24px))" :before-close="beforeClose" @update:model-value="emit('update:visible', $event)">
    <div class="external-ai-panel">
      <el-alert type="warning" :closable="false" show-icon title="CLI 在本机运行，不代表模型在本机推理">
        <p>仅分享当前简历可见正文；不含身份／联系字段、头像和隐藏章节。正文中自行写入的隐私仍会包含，请先检查。云端模型可能接收这些内容。AI 只能提交草稿，不能批准或保存。</p>
      </el-alert>
      <template v-if="!authorized">
        <p>授权范围：当前简历可见的求职意向、简介、经历、项目、教育、技能及自定义正文。有效期 30 分钟，关闭面板、切换简历或刷新即撤销。首版不共享面试历史。</p>
        <el-checkbox v-model="consent">我已检查正文，并同意将上述范围交给自己配置的 AI 工具处理</el-checkbox>
        <el-button type="primary" :disabled="!consent" @click="authorize">授权当前简历</el-button>
      </template>
      <template v-else>
        <div class="session-heading"><el-tag type="success">当前简历已授权 · 剩余 {{ remainingMinutes }} 分钟</el-tag><el-button type="danger" text @click="revoke">撤销授权</el-button></div>
        <section aria-labelledby="external-files-title">
          <h3 id="external-files-title">文件交换 · 无需 MCP</h3>
          <p>下载并解压工作区，在该目录启动 Codex CLI 或 Claude Code。让它读取 context/resume.json，按 AGENTS.md / CLAUDE.md 生成 proposals/*.json，再导入审核。请保持本面板打开。</p>
          <div class="action-row">
            <el-button :loading="busy" @click="exportContext">下载 AI 工作区</el-button>
            <el-button :disabled="busy" @click="fileInput?.click()">导入修改草稿</el-button>
            <input ref="fileInput" hidden type="file" accept=".json,application/json" aria-label="导入外部 AI 修改草稿" @change="importProposal" />
          </div>
        </section>
        <section aria-labelledby="external-mcp-title">
          <h3 id="external-mcp-title">MCP 实时桥接 · 可选</h3>
          <p>需要 Node.js 22+。下方配置固定来源和版本，只连接本机；可能需要允许浏览器访问本地网络。网站不启动 CLI，也不保存 CLI 的密钥。</p>
          <p><a :href="`${baseUrl}ai-relay/relay-install.zip`" download="sea-resume-ai-relay.zip">下载 MCP 启动包</a>，解压后在目录中运行 <code>npm ci --ignore-scripts</code>（首次需联网）。保留锁文件，避免上游依赖冲突。仅需 Node.js，无需扩展。</p>
          <el-collapse>
            <el-collapse-item title="查看 Codex CLI / Claude Code 配置" name="config">
              <el-form-item label="解压后 start.mjs 的绝对路径"><el-input v-model="launcherPath" placeholder="/Users/你的目录/sea-resume-ai-relay/start.mjs" /></el-form-item>
              <p>将下方占位路径替换为真实绝对路径。命令按 POSIX shell 生成；Windows 请使用 MCP 客户端 JSON 配置，并确保 node 可执行程序在 PATH 中。</p>
              <p>Codex CLI：在终端执行配置命令，随后由 CLI 启动本地 relay</p><pre>{{ codexCommand }}</pre>
              <p>Claude Code：在终端执行</p><pre>{{ claudeCommand }}</pre>
              <p>其他 MCP 客户端：加入下方配置，完成后重启客户端</p><pre>{{ clientConfiguration }}</pre>
              <p>配置来源仅限 {{ origin }}；不要将 --widget-origin 改为 *。同一来源的其他页面属于同一信任范围。</p>
            </el-collapse-item>
          </el-collapse>
          <div class="action-row">
            <el-button v-if="!bridgeStarted" :loading="connecting" :disabled="busy" @click="connectBridge">启用 MCP 桥接</el-button>
            <el-button v-else @click="disconnectBridge">停止 MCP 桥接</el-button>
            <el-tag :type="bridgeStarted ? 'warning' : 'info'">{{ bridgeStarted ? '桥接已启动，等待 CLI 调用' : '桥接未启动' }}</el-tag>
          </div>
          <p v-if="bridgeStarted">让 CLI 调用 sea_resume_get_context → sea_resume_propose_changes。是否已连接请在 CLI 的 MCP 工具列表确认；仅加载桥接不代表 relay 已连接。被阻止时可继续使用文件交换。</p>
        </section>
        <section aria-labelledby="external-proposals-title">
          <h3 id="external-proposals-title">修改草稿（{{ session.entries.length }}）</h3>
          <p v-if="!session.entries.length">尚无草稿。AI 提交后会在这里显示，不会自动保存。</p>
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
      </template>
      <el-alert v-if="errorMessage" type="error" :closable="false" :title="errorMessage" show-icon />
      <p class="session-note">授权及草稿状态仅在本次页面会话保存。文件副本和已发送给 CLI 的内容无法通过撤销授权收回。AI 修改保存后可用编辑器“撤销”恢复。</p>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useResumeStore } from '@/stores/resume';
import type { ResumeAiOperation } from '@/types/ai';
import { ExternalAiSession, type ProposalStatus } from '@/services/ai/ExternalAiSession';
import { relayConfiguration, startExternalAiBridge } from '@/services/ai/externalAiBridge';
import { createExternalContextArchive, downloadContextArchive, readExternalProposal } from '@/services/ai/externalAiFiles';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [visible: boolean] }>();
const store = useResumeStore();
const session = reactive(new ExternalAiSession(() => store.exportData(), (proposal, assertAuthorized) => store.applyChangeProposal(proposal, assertAuthorized))) as ExternalAiSession;
const consent = ref(false);
const errorMessage = ref('');
const busy = ref(false);
const connecting = ref(false);
const bridgeStarted = ref(false);
const fileInput = ref<HTMLInputElement>();
const now = ref(Date.now());
const authorized = computed(() => !!session.resumeId && session.expiresAt > now.value && session.resumeId === store.data.id);
const remainingMinutes = computed(() => Math.max(0, Math.ceil((session.expiresAt - now.value) / 60000)));
const origin = location.origin;
const baseUrl = import.meta.env.BASE_URL;
const launcherPath = ref('/绝对路径/sea-resume-ai-relay/start.mjs');
const config = computed(() => relayConfiguration(origin, launcherPath.value));
const clientConfiguration = computed(() => JSON.stringify({ mcpServers: { 'sea-resume': config.value } }, null, 2));
const quotedArgs = computed(() => config.value.args.map(arg => `'${arg.replace(/'/g, "'\\''")}'`).join(' '));
const codexCommand = computed(() => `codex mcp add sea-resume -- node ${quotedArgs.value}`);
const claudeCommand = computed(() => `claude mcp add --transport stdio sea-resume -- node ${quotedArgs.value}`);
const statusLabels: Record<ProposalStatus, string> = { pending: '待确认', applying: '保存中', applied: '已应用', rejected: '已拒绝', conflict: '版本冲突' };
let stopBridge: (() => void) | undefined;
let connectionController: AbortController | undefined;
const timer = setInterval(() => {
  now.value = Date.now();
  if (session.resumeId && !authorized.value) { revoke(); errorMessage.value = '授权已过期，请重新授权并读取上下文。'; }
}, 1000);
watch(() => store.data.id, revoke);
watch(() => props.visible, visible => { if (!visible) revoke(); });
onBeforeUnmount(() => { clearInterval(timer); revoke(); });
function disconnectBridge() { connectionController?.abort(); stopBridge?.(); stopBridge = undefined; bridgeStarted.value = false; connecting.value = false; }
function revoke() { disconnectBridge(); session.revoke(); consent.value = false; }
function authorize() { if (!consent.value) return; session.authorize(); now.value = Date.now(); errorMessage.value = ''; }
function report(error: unknown) { errorMessage.value = error instanceof Error ? error.message : '操作失败。'; }
async function beforeClose(done: () => void) {
  if (busy.value || session.entries.some(entry => entry.status === 'applying')) return;
  if (session.entries.some(entry => entry.status === 'pending')) {
    try { await ElMessageBox.confirm('关闭会撤销外部 AI 授权并丢弃本次待审草稿，是否继续？', '关闭外部 AI', { type: 'warning' }); }
    catch { return; }
  }
  revoke(); done();
}
async function exportContext() {
  busy.value = true; errorMessage.value = '';
  try { downloadContextArchive(await createExternalContextArchive(session)); }
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
async function connectBridge() {
  if (connecting.value || bridgeStarted.value) return;
  connecting.value = true; errorMessage.value = '';
  const controller = new AbortController(); connectionController = controller;
  try { stopBridge = await startExternalAiBridge(session, controller.signal); bridgeStarted.value = true; }
  catch (error) { if (!controller.signal.aborted) report(error); }
  finally { if (connectionController === controller) connecting.value = false; }
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
function operationLabel(operation: ResumeAiOperation) { return 'field' in operation ? `${operation.type} · ${operation.field}` : operation.type; }
function proposedValue(operation: ResumeAiOperation) { return 'value' in operation ? text(operation.value) : '—'; }
function currentValue(operation: ResumeAiOperation) {
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
.external-ai-panel section { border-top: 1px solid var(--ui-border-color, #e5e7eb); padding-top: 18px; }
.external-ai-panel :deep(.el-checkbox) { white-space: normal; height: auto; align-items: flex-start; }
.session-heading, .action-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.session-heading { justify-content: space-between; }
.action-row { margin-top: 12px; }
.action-row :deep(.el-button + .el-button) { margin-left: 0; }
pre { overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; background: var(--ui-bg-subtle, #f4f5f7); border-radius: 8px; font-size: 12px; }
.proposal-card { border: 1px solid var(--ui-border-color, #e5e7eb); border-radius: 10px; padding: 14px; margin-top: 12px; }
.proposal-card small { overflow-wrap: anywhere; color: var(--ui-text-secondary); }
.proposal-card ol { padding-left: 20px; }
.proposal-card li { margin: 12px 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.diff-before { padding: 8px; background: #fff1f2; color: #881337; }
.diff-after { padding: 8px; background: #ecfdf5; color: #065f46; }
.error-text { color: var(--ui-danger, #b91c1c); }
.session-note { font-size: 12px; color: var(--ui-text-secondary); }
</style>
