<template>
  <el-button :text="!link" :link="link" @click="open = true">外部 AI<span v-if="statusSuffix">{{ statusSuffix }}</span></el-button>
  <el-dialog v-model="open" title="连接外部 Agent" width="min(640px, calc(100vw - 24px))" align-center append-to-body modal-class="mcp-connection-overlay">
    <section class="mcp-connection" aria-labelledby="mcp-connection-title">
      <div class="mcp-connection__heading">
        <p id="mcp-connection-title">启用后外部 Agent（CLI / IDE 插件 / MCP 客户端）可直接管理全部简历、打开实时预览、导出 PDF，并读取或开始模拟面试。使用外部 Agent 无需配置网页「AI 简历助手」的 API Key；仅开始模拟面试会用到网页模型设置。</p>
        <el-tag :type="linkTag.type">{{ linkTag.label }}</el-tag>
      </div>
      <div class="mcp-connection__actions">
        <el-button v-if="!started" type="primary" :loading="connecting" @click="connect">启用 MCP 桥接</el-button>
        <el-button v-else @click="disconnect">停止 MCP 桥接</el-button>
        <el-select v-model="client" class="mcp-client" aria-label="选择客户端">
          <template #label="{ label }">
            <span class="mcp-option"><HarnessIcon :id="client" /><span class="mcp-option__name">{{ label }}</span></span>
          </template>
          <el-option v-for="item in relayClients" :key="item.id" :label="item.label" :value="item.id">
            <span class="mcp-option"><HarnessIcon :id="item.id" /><span class="mcp-option__name">{{ item.label }}</span></span>
          </el-option>
        </el-select>
        <el-radio-group v-model="shell" size="small" aria-label="选择系统">
          <el-radio-button value="posix">macOS / Linux</el-radio-button>
          <el-radio-button value="powershell">Windows</el-radio-button>
        </el-radio-group>
      </div>
      <p v-if="configTarget">运行后，把终端打印的配置合并进 {{ configTarget }}</p>
      <p v-if="clientNote">{{ clientNote }}</p>
      <pre class="mcp-command" aria-label="接入命令" tabindex="0">{{ setupCommand }}</pre>
      <p v-if="linkState === 'waiting'">页面已就绪，但尚未连接本机 relay。请先在终端或客户端完成接入并重启，同时允许浏览器访问本地网络。</p>
      <p v-else-if="linkState === 'connected'">本机 relay 已连接。外部 Agent 已可调用 sea_resume_list、sea_resume_create、sea_resume_open 等工具，无需在网页里另配 API Key。</p>
      <p v-else-if="linkState === 'rejected'">本机 relay 拒绝了当前页面（{{ origin }}）。请确认 MCP 配置里的 --widget-origin 与当前地址一致并重启客户端。</p>
      <p v-else-if="linkState === 'reconnecting'">正在重试连接本机 relay。请确认客户端 MCP 服务仍在运行。</p>
      <p>{{ clientReload }}</p>
      <el-alert v-if="errorMessage" type="error" :closable="false" :title="errorMessage" show-icon />
    </section>
    <template #footer>
      <div class="mcp-connection__actions">
        <el-button @click="copy(setupCommand, '终端命令')">复制终端命令</el-button>
        <el-button @click="copy(agentPrompt, '给 AI 的接入指令')">复制 AI 接入指令</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { detectRelayShell, relayAgentPrompt, relayClients, relayConfigTarget, relaySetupCommand, type RelayClient, type RelayShell } from '@/services/ai/externalAiBridge';
import { useMcpBridge } from '@/services/ai/useMcpBridge';
import HarnessIcon from './HarnessIcon.vue';

defineProps<{ link?: boolean }>();

const MCP_CLIENT_STORAGE_KEY = 'sea-resume_mcp-client';
function loadSavedClient(): RelayClient {
  try {
    const saved = localStorage.getItem(MCP_CLIENT_STORAGE_KEY);
    if (saved && relayClients.some((item) => item.id === saved)) return saved as RelayClient;
  } catch { /* 存储不可用时回退默认值 */ }
  return 'codex';
}

const { linkState, started, connecting, errorMessage, connect, disconnect } = useMcpBridge();
const open = ref(false);
const statusSuffix = computed(() => {
  if (linkState.value === 'connected') return ' · 已连接';
  if (linkState.value === 'waiting') return ' · 等待';
  if (linkState.value === 'rejected') return ' · 来源受限';
  if (linkState.value === 'reconnecting') return ' · 重试';
  return '';
});
const client = ref<RelayClient>(loadSavedClient());
watch(client, (value) => {
  try { localStorage.setItem(MCP_CLIENT_STORAGE_KEY, value); } catch { /* 忽略受限存储 */ }
});
const shell = ref<RelayShell>(detectRelayShell());
const origin = location.origin;
const baseUrl = import.meta.env.BASE_URL;
const setupCommand = computed(() => relaySetupCommand(client.value, origin, baseUrl, shell.value));
const configTarget = computed(() => relayConfigTarget(client.value, shell.value));
const agentPrompt = computed(() => relayAgentPrompt(client.value, origin, baseUrl, shell.value));
const selectedClient = computed(() => relayClients.find((item) => item.id === client.value));
const clientNote = computed(() => selectedClient.value?.note ?? '');
const clientReload = computed(() => selectedClient.value?.reload ?? '');
const linkTag = computed(() => {
  if (linkState.value === 'connected') return { type: 'success' as const, label: '本机 relay 已连接' };
  if (linkState.value === 'rejected') return { type: 'danger' as const, label: '来源未获放行' };
  if (linkState.value === 'reconnecting') return { type: 'danger' as const, label: '正在重试连接本机 relay' };
  if (linkState.value === 'waiting') return { type: 'warning' as const, label: '尚未连接本机 relay' };
  return { type: 'info' as const, label: '桥接未启动' };
});

async function copy(value: string, label: string) {
  try {
    if (!navigator.clipboard) throw new Error('剪贴板不可用');
    await navigator.clipboard.writeText(value);
    ElMessage.success(`已复制${label}。`);
  } catch {
    errorMessage.value = '复制失败，请手动选中文本复制。';
  }
}
</script>

<style scoped>
:global(.mcp-connection-overlay .el-dialog) {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 32px);
}
:global(.mcp-connection-overlay .el-dialog__body) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.mcp-connection {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.mcp-connection p { margin: 0; line-height: 1.6; color: var(--ui-text-secondary); }
.mcp-connection__heading { display: flex; flex: none; justify-content: space-between; align-items: flex-start; gap: 12px; }
.mcp-connection__actions { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 10px; }
.mcp-client { width: 248px; }
.mcp-option { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.mcp-option__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcp-connection__actions :deep(.el-button + .el-button) { margin-left: 0; }
.mcp-command {
  flex: 1 1 auto;
  min-height: 7.5rem;
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 12px;
  border-radius: var(--radius-input);
  background: var(--color-paper-2);
  color: var(--color-ink);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
