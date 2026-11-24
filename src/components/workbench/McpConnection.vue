<template>
  <el-button text @click="open = true">外部 AI<span v-if="statusSuffix">{{ statusSuffix }}</span></el-button>
  <el-dialog v-model="open" title="连接 Codex / Claude Code" width="min(640px, calc(100vw - 24px))" align-center append-to-body>
  <section class="mcp-connection" aria-labelledby="mcp-connection-title">
    <div class="mcp-connection__heading">
      <p id="mcp-connection-title">启用后可以管理全部简历、导出 PDF，并读取或开始模拟面试。简历写回会立即保存；开始面试会使用设置里的模型。</p>
      <el-tag :type="linkTag.type">{{ linkTag.label }}</el-tag>
    </div>
    <div class="mcp-connection__actions">
      <el-button v-if="!started" type="primary" :loading="connecting" @click="connect">启用 MCP 桥接</el-button>
      <el-button v-else @click="disconnect">停止 MCP 桥接</el-button>
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
    <div class="mcp-connection__actions">
      <el-button @click="copy(setupCommand, '终端命令')">复制终端命令</el-button>
      <el-button @click="copy(agentPrompt, '给 AI 的接入指令')">复制 AI 接入指令</el-button>
    </div>
    <p v-if="linkState === 'waiting'">页面已就绪，但尚未连接本机 relay。请先运行上面的命令，并允许浏览器访问本地网络。</p>
    <p v-else-if="linkState === 'connected'">本机 relay 已连接。先让 CLI 调用 sea_resume_list，再按 id 读取或修改。</p>
    <p v-else-if="linkState === 'reconnecting'">正在重试连接本机 relay。请确认命令仍在运行。</p>
    <el-alert v-if="errorMessage" type="error" :closable="false" :title="errorMessage" show-icon />
  </section>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { relayAgentPrompt, relaySetupCommand, type RelayClient, type RelayShell } from '@/services/ai/externalAiBridge';
import { useMcpBridge } from '@/services/ai/useMcpBridge';

const { linkState, started, connecting, errorMessage, connect, disconnect } = useMcpBridge();
const open = ref(false);
const statusSuffix = computed(() => {
  if (linkState.value === 'connected') return ' · 已连接';
  if (linkState.value === 'waiting') return ' · 等待';
  if (linkState.value === 'reconnecting') return ' · 重试';
  return '';
});
const client = ref<RelayClient>('codex');
const shell = ref<RelayShell>('posix');
const origin = location.origin;
const baseUrl = import.meta.env.BASE_URL;
const setupCommand = computed(() => relaySetupCommand(client.value, origin, baseUrl, shell.value));
const agentPrompt = computed(() => relayAgentPrompt(client.value, origin, baseUrl, shell.value));
const linkTag = computed(() => {
  if (linkState.value === 'connected') return { type: 'success' as const, label: '本机 relay 已连接' };
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
.mcp-connection {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mcp-connection p { margin: 0; line-height: 1.6; color: var(--ui-text-secondary); }
.mcp-connection__heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.mcp-connection__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.mcp-connection__actions :deep(.el-button + .el-button) { margin-left: 0; }
pre { overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; padding: 12px; background: var(--color-paper-2); border-radius: var(--radius-input); font-size: 12px; }
</style>
