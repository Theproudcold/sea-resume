<template>
  <el-drawer :model-value="visible" title="外部 AI · Codex / Claude Code" size="min(640px, calc(100vw - 24px))" :before-close="beforeClose" @update:model-value="emit('update:visible', $event)">
    <div class="external-ai-panel">
      <el-alert type="warning" :closable="false" show-icon title="外部 AI 可能将内容发送到云端">
        <p>仅分享当前简历可见正文；不含身份／联系字段、头像和隐藏章节。正文中自行写入的隐私仍会包含，请先检查。云端模型可能接收这些内容。AI 只能提交草稿，不能批准或保存。</p>
      </el-alert>
      <template v-if="!authorized">
        <p>授权范围：当前简历可见的求职意向、简介、经历、项目、教育、技能及自定义正文。有效期 30 分钟，关闭面板、切换简历或刷新即撤销。不共享面试历史。</p>
        <el-checkbox v-model="consent">我已检查正文，并同意将上述范围交给自己配置的 AI 工具处理</el-checkbox>
        <el-button type="primary" :disabled="!consent" @click="authorize">授权当前简历</el-button>
      </template>
      <template v-else>
        <div class="session-heading"><el-tag type="success">当前简历已授权 · 剩余 {{ remainingMinutes }} 分钟</el-tag><el-button type="danger" text @click="revoke">撤销授权</el-button></div>
        <section aria-labelledby="external-connect-title">
          <h3 id="external-connect-title">连接 Codex / Claude Code</h3>
          <p>接入包在构建时已打成单个文件并随本站托管，固定来源和版本、只连接本机。网站不启动 CLI，也不保存 CLI 的密钥；首次可能需要允许浏览器访问本地网络。</p>
          <ol class="steps">
            <li>先点「启用 MCP 桥接」，并保持本面板打开。</li>
            <li>复制一行命令到终端；或复制「给 AI 的一句话」，直接粘给 Codex CLI / Claude Code，让它自己接入。</li>
          </ol>
          <div class="action-row">
            <el-button v-if="!bridgeStarted" type="primary" :loading="connecting" :disabled="busy" @click="connectBridge">启用 MCP 桥接</el-button>
            <el-button v-else @click="disconnectBridge">停止 MCP 桥接</el-button>
            <el-tag :type="bridgeStarted ? 'warning' : 'info'">{{ bridgeStarted ? '桥接已启动，等待 CLI 调用' : '桥接未启动' }}</el-tag>
          </div>
          <div class="picker-row">
            <el-radio-group v-model="client" size="small" aria-label="选择 CLI">
              <el-radio-button value="codex">Codex CLI</el-radio-button>
              <el-radio-button value="claude">Claude Code</el-radio-button>
            </el-radio-group>
            <el-radio-group v-model="shell" size="small" aria-label="选择系统">
              <el-radio-button value="posix">macOS / Linux</el-radio-button>
              <el-radio-button value="powershell">Windows</el-radio-button>
            </el-radio-group>
          </div>
          <pre aria-label="接入命令">{{ setupCommand }}</pre>
          <div class="action-row">
            <el-button @click="copy(setupCommand, '终端命令')">复制终端命令</el-button>
            <el-button @click="copy(agentPrompt, '给 AI 的接入指令')">复制 AI 接入指令</el-button>
          </div>
          <p v-if="bridgeStarted">让 CLI 调用 sea_resume_get_context → sea_resume_propose_changes。是否已连接请在 CLI 的 MCP 工具列表确认；仅加载桥接不代表 relay 已连接。</p>
          <el-collapse>
            <el-collapse-item title="其他 MCP 客户端 / 离线安装" name="config">
              <p>没有 curl 时可直接下载 <a :href="bundleUrl" download="relay.mjs">relay.mjs</a>（单文件，无需安装依赖）。网络受限时可用<a :href="`${baseUrl}ai-relay/relay-install.zip`" download="sea-resume-ai-relay.zip">完整启动包</a>，解压后在目录中运行 <code>npm ci --ignore-scripts</code>，保留锁文件避免上游依赖冲突。</p>
              <el-form-item label="relay.mjs 的绝对路径" for="relay-launcher-path"><el-input id="relay-launcher-path" v-model="launcherPath" placeholder="/Users/你的目录/.sea-resume-ai-relay/relay.mjs" /></el-form-item>
              <p>其他 MCP 客户端：加入下方配置并重启客户端。JSON 不展开 <code>~</code>，请填写真实绝对路径；Windows 需确保 <code>node</code> 在 PATH 中。</p>
              <pre>{{ clientConfiguration }}</pre>
              <p>配置来源仅限 {{ origin }}；不要将 --widget-origin 改为 *。同一来源的其他页面属于同一信任范围。</p>
            </el-collapse-item>
          </el-collapse>
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
import { relayAgentPrompt, relayBundleUrl, relayConfiguration, relaySetupCommand, startExternalAiBridge, type RelayClient, type RelayShell } from '@/services/ai/externalAiBridge';
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
const client = ref<RelayClient>('codex');
const shell = ref<RelayShell>('posix');
const launcherPath = ref('/绝对路径/.sea-resume-ai-relay/relay.mjs');
const bundleUrl = computed(() => relayBundleUrl(origin, baseUrl));
const setupCommand = computed(() => relaySetupCommand(client.value, origin, baseUrl, shell.value));
const agentPrompt = computed(() => relayAgentPrompt(client.value, origin, baseUrl, shell.value));
const config = computed(() => relayConfiguration(origin, launcherPath.value));
const clientConfiguration = computed(() => JSON.stringify({ mcpServers: { 'sea-resume': config.value } }, null, 2));
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
async function copy(value: string, label: string) {
  try {
    if (!navigator.clipboard) throw new Error('剪贴板不可用');
    await navigator.clipboard.writeText(value);
    ElMessage.success(`已复制${label}，粘贴到终端或 CLI 对话框即可。`);
  } catch { report(new Error('复制失败，请手动选中文本复制。')); }
}
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
