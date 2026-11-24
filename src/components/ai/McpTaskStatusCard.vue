<template>
  <section class="mcp-task-card" :class="`is-${task.status}`" role="status" aria-live="polite">
    <div class="mcp-task-card__head">
      <strong>{{ statusTitle }}</strong>
      <span class="mcp-task-card__id">{{ task.id }}</span>
    </div>
    <p v-if="task.status === 'pending'" class="mcp-task-card__copy">
      {{ copied ? '已复制触发指令，直接粘贴发给已连接的外部 Agent 即可执行（无需 API Key）：' : '请复制下方指令发给已连接的外部 Agent 执行（无需 API Key）：' }}
    </p>
    <pre v-if="task.status === 'pending'" class="mcp-task-card__prompt">{{ prompt }}</pre>
    <p v-else-if="task.status === 'completed'" class="mcp-task-card__copy">
      {{ task.result?.summary || '外部 Agent 已完成本次任务。' }}
    </p>
    <p v-else class="mcp-task-card__copy">任务已取消。</p>
    <div v-if="task.status === 'pending'" class="mcp-task-card__actions">
      <button type="button" @click="copyPrompt">{{ copied ? '重新复制指令' : '复制触发指令' }}</button>
      <button type="button" @click="emit('cancel')">取消任务</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { copyExternalTaskPrompt, type ExternalTask } from '@/services/ai/externalTaskQueue';

const props = defineProps<{ task: ExternalTask; prompt: string; initialCopied?: boolean }>();
const emit = defineEmits<{ cancel: [] }>();
const copied = ref(Boolean(props.initialCopied));

const statusTitle = computed(() => {
  if (props.task.status === 'completed') return '外部 Agent 已完成（MCP）';
  if (props.task.status === 'cancelled') return '外部 Agent 任务已取消';
  return '已派发给外部 Agent（等待执行）';
});

async function copyPrompt() {
  copied.value = await copyExternalTaskPrompt(props.prompt);
}
</script>

<style scoped>
.mcp-task-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--ui-border);
  border-left: 3px solid var(--ui-primary);
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg-subtle);
  font-size: var(--ui-font-sm);
}
.mcp-task-card.is-completed { border-left-color: var(--ui-success); }
.mcp-task-card.is-cancelled { border-left-color: var(--ui-text-muted); opacity: 0.8; }
.mcp-task-card__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mcp-task-card__id { color: var(--ui-text-muted); font-family: var(--font-mono, monospace); font-size: var(--ui-font-xs); }
.mcp-task-card__copy { margin: 0; color: var(--ui-text-secondary); line-height: 1.6; }
.mcp-task-card__prompt {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--radius-input);
  background: var(--ui-bg-surface);
  color: var(--ui-text-main);
  font-size: var(--ui-font-xs);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.mcp-task-card__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.mcp-task-card__actions button {
  padding: 6px 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg-surface);
  color: var(--ui-text-main);
  cursor: pointer;
  font: inherit;
  font-size: var(--ui-font-xs);
}
</style>
