<template>
  <section class="greeting-panel" aria-label="打招呼语生成">
    <p class="hint">生成求职打招呼语，可编辑后复制，不会修改简历。</p>
    <div class="provider">
      <span>{{ isMcpMode ? '外部 Agent（MCP · 免 API Key） · 已就绪' : `${settings?.profileName || '未配置模型'} · ${settings?.model || '请选择模型'}` }}</span>
      <el-button text type="primary" @click="emit('configure')">{{ isMcpMode ? '模型设置' : '配置模型' }}</el-button>
    </div>
    <p v-if="!isMcpMode && !providerReady" class="hint" role="status">请先配置 AI 服务和所需密钥，再开始生成。</p>
    <label for="greeting-jd">招聘要求（选填）</label>
    <textarea id="greeting-jd" v-model="jd" data-testid="greeting-jd" rows="6" maxlength="10000" :disabled="loading" placeholder="粘贴职位描述、岗位职责、任职要求……也可以留空，直接根据简历生成。" />
    <p class="hint">{{ jd.length }} / 10000 · {{ jd.trim() ? '根据简历 + 招聘要求生成' : '仅根据简历生成' }}</p>
    <p class="hint">生成时将向所配置的 AI 服务发送当前简历的可见经历、技能等内容及招聘要求，不发送结构化姓名、联系方式、出生日期和头像。请先检查自由文本中是否包含敏感信息。</p>
    <label class="consent"><input v-model="consent" data-testid="greeting-consent" type="checkbox" :disabled="loading" />我同意发送上述内容给当前 AI 服务</label>
    <div class="actions">
      <el-button type="primary" data-testid="greeting-start" :disabled="!canGenerate" :loading="loading" @click="generate">{{ isMcpMode ? '派发给外部 Agent 生成（免 Key）' : (greetings.length ? '重新生成' : '生成打招呼语') }}</el-button>
      <el-button v-if="loading" @click="cancel">取消生成</el-button>
    </div>
    <McpTaskStatusCard v-if="activeMcpTask" :task="activeMcpTask" :prompt="mcpPrompt" :initial-copied="mcpCopied" @cancel="cancelMcpTask" />
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="greetings.length" class="hint">AI 文案仅供参考，请核对事实后发送。可以直接编辑再复制。</p>
    <article v-for="(_, index) in greetings" :key="index" class="greeting-result">
      <label :for="`greeting-result-${index}`">候选 {{ index + 1 }}</label>
      <textarea :id="`greeting-result-${index}`" v-model="greetings[index]" rows="5" maxlength="1000" />
      <el-button :disabled="!greetings[index]?.trim()" @click="copy(index)">复制文案</el-button>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ResumeData } from '@/types/resume';
import { getAiSessionApiKey, hasAiSessionApiKey, isAiProviderReady, loadAiModelSettings, toAiProviderConfig } from '@/services/ai/AiSettings';
import { requestGreetings } from '@/services/ai/greeting';
import { useMcpState } from '@/services/ai/useMcpBridge';
import { resolveAiDriver, useAiDriverPreference } from '@/services/ai/useAiExecutionMode';
import { cancelExternalTask, copyExternalTaskPrompt, enqueueExternalTask, useExternalTasks } from '@/services/ai/externalTaskQueue';
import McpTaskStatusCard from './McpTaskStatusCard.vue';

const props = defineProps<{ resume: ResumeData }>();
const emit = defineEmits<{ configure: [] }>();
const settings = ref(loadAiModelSettings());
const keyAvailable = ref(hasAiSessionApiKey());
const jd = ref('');
const consent = ref(false);
const loading = ref(false);
const greetings = ref<string[]>([]);
const error = ref('');
const notice = ref('');
let controller: AbortController | undefined;
let generation = 0;
const { linkState: mcpLinkState } = useMcpState();
const { driverPreference } = useAiDriverPreference();
const { findTask } = useExternalTasks();
const mcpTaskId = ref('');
const mcpPrompt = ref('');
const mcpCopied = ref(false);
const activeMcpTask = computed(() => findTask(mcpTaskId.value));
const providerReady = computed(() => isAiProviderReady(settings.value, keyAvailable.value ? getAiSessionApiKey(settings.value?.profileId) : ''));
const isMcpMode = computed(() => resolveAiDriver(mcpLinkState.value === 'connected', providerReady.value, driverPreference.value) === 'mcp');
const canGenerate = computed(() => consent.value && (isMcpMode.value || providerReady.value) && !loading.value);
function cancelMcpTask() { if (mcpTaskId.value) cancelExternalTask(mcpTaskId.value); }
watch(() => activeMcpTask.value?.result?.greetings, (items) => {
  if (items?.length) greetings.value = [...items];
});
function cancel() { generation++; controller?.abort(); loading.value = false; }
function refreshSettings() {
  const next = loadAiModelSettings();
  const available = hasAiSessionApiKey();
  if (JSON.stringify(next) !== JSON.stringify(settings.value) || available !== keyAvailable.value) {
    cancel(); consent.value = false;
  }
  settings.value = next; keyAvailable.value = available;
}
watch([jd, () => props.resume], () => {
  cancel(); consent.value = false; greetings.value = []; error.value = ''; notice.value = '';
}, { deep: true });
onMounted(() => window.addEventListener('focus', refreshSettings));
onBeforeUnmount(() => { cancel(); window.removeEventListener('focus', refreshSettings); });
async function generate() {
  refreshSettings();
  if (!canGenerate.value) return;
  if (isMcpMode.value) {
    error.value = ''; notice.value = '';
    try {
      const { task, prompt } = enqueueExternalTask({
        kind: 'greeting',
        resumeId: props.resume.id,
        summary: jd.value.trim() ? '结合 JD 生成打招呼语' : '根据简历生成打招呼语',
        payload: { resumeId: props.resume.id, jd: jd.value.trim() },
      });
      mcpTaskId.value = task.id;
      mcpPrompt.value = prompt;
      mcpCopied.value = await copyExternalTaskPrompt(prompt);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '派发任务失败。';
    }
    return;
  }
  if (!settings.value) return;
  const current = ++generation;
  controller = new AbortController(); loading.value = true; error.value = ''; notice.value = '';
  try {
    const result = await requestGreetings(toAiProviderConfig(settings.value), props.resume, jd.value, { signal: controller.signal });
    if (current === generation) greetings.value = result;
  } catch (cause) {
    if (current === generation) error.value = cause instanceof Error ? cause.message : '生成失败，请重试。';
  } finally {
    if (current === generation) loading.value = false;
  }
}
async function copy(index: number) {
  notice.value = '';
  try {
    await navigator.clipboard.writeText(greetings.value[index] || '');
    notice.value = '文案已复制';
  } catch { notice.value = '无法自动复制，请在文本框中选择文案后手动复制。'; }
}
</script>

<style scoped>
.greeting-panel { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.hint { margin: 0; color: var(--ui-text-secondary); font-size: var(--ui-font-sm); line-height: 1.7; }
.provider, .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.provider { justify-content: space-between; }
.provider span { overflow-wrap: anywhere; }
textarea { box-sizing: border-box; width: 100%; padding: 12px; border: 1px solid var(--color-rule-2); border-radius: var(--radius-input); background: var(--color-paper-3); color: var(--color-ink); font: inherit; line-height: 1.7; resize: vertical; }
textarea:focus { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
.consent { display: flex; align-items: flex-start; gap: 8px; line-height: 1.6; }
.greeting-result { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
.error { color: var(--el-color-danger); }
</style>
