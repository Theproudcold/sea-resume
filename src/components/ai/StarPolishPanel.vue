<template>
  <section class="star-panel" aria-label="经历润色">
    <p class="hint">把所选经历写清楚：你做了什么、如何行动、取得什么结果。不补写原文没有的数字和结果。</p>
    <div class="provider">
      <span>{{ isMcpMode ? '外部 Agent（MCP · 免 API Key） · 已就绪' : `${settings?.profileName || '未配置模型'} · ${settings?.model || '请选择模型'}` }}</span>
      <el-button text type="primary" @click="emit('configure')">{{ isMcpMode ? '模型设置' : '配置模型' }}</el-button>
    </div>
    <p v-if="!isMcpMode && !providerReady" class="hint" role="status">请先配置 AI 服务和所需密钥，再开始生成。</p>
    <template v-if="!draft">
      <p v-if="!targets.length" class="hint">当前没有可润色的个人简介、工作描述、亮点或项目描述。请先在编辑器中填写。</p>
      <fieldset v-else :disabled="loading">
        <legend>选择要润色的内容（已选 {{ selected.length }} / 12）</legend>
        <label v-for="target in targets" :key="target.key" class="target">
          <input v-model="selected" type="checkbox" :value="target.key" :disabled="loading || (!selected.includes(target.key) && selected.length >= 12)" />
          <span><strong>{{ target.label }}</strong><small>{{ kindLabels[target.kind] }} · {{ preview(target.text) }}</small></span>
        </label>
      </fieldset>
      <label for="star-role">目标岗位（选填，只影响用词侧重）</label>
      <input id="star-role" v-model="role" data-testid="star-role" maxlength="200" :disabled="loading" placeholder="例如：前端工程师" />
      <p class="hint">发送时不含姓名、联系方式、出生日期和头像，公司与学校名称会替换为占位。请先检查正文里是否写了敏感信息。</p>
      <label class="consent"><input v-model="consent" data-testid="star-consent" type="checkbox" :disabled="loading" />我同意把所选内容发送给当前 AI 服务做本次润色</label>
      <div class="actions">
        <el-button type="primary" data-testid="star-start" :disabled="!canPolish" :loading="loading" @click="polish">{{ isMcpMode ? '派发给外部 Agent 润色（免 Key）' : '开始润色' }}</el-button>
        <el-button v-if="loading" @click="cancel">取消润色</el-button>
      </div>
      <McpTaskStatusCard v-if="activeMcpTask" :task="activeMcpTask" :prompt="mcpPrompt" :initial-copied="mcpCopied" @cancel="cancelMcpTask" />
    </template>
    <template v-else>
      <p v-if="draft.explanation" class="hint">{{ draft.explanation }}</p>
      <p v-if="!draft.suggestions.length" class="hint">没有需要改动的内容，原文保持不变。</p>
      <article v-for="suggestion in draft.suggestions" :key="suggestion.key" class="suggestion">
        <label class="target">
          <input v-model="accepted" type="checkbox" :value="suggestion.key" :disabled="applying" />
          <strong>{{ suggestion.label }}</strong>
        </label>
        <div class="diff">
          <div><small>原文</small><p>{{ suggestion.before }}</p></div>
          <div><small>润色</small><p>{{ suggestion.after }}</p></div>
        </div>
        <p v-if="suggestion.note" class="hint">{{ suggestion.note }}</p>
        <p v-if="suggestion.novelNumbers.length" class="warning">出现了原文没有的数字：{{ suggestion.novelNumbers.join('、') }}。请核对后再勾选。</p>
      </article>
      <div class="actions">
        <el-button :disabled="applying" @click="draft = null">返回选择内容</el-button>
        <el-button type="primary" data-testid="star-apply" :disabled="!accepted.length || applying" :loading="applying" @click="apply">应用 {{ accepted.length }} 条</el-button>
      </div>
    </template>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ResumeData } from '@/types/resume';
import type { EditProposal } from '@/services/ai/externalProposal';
import { createExternalProposal } from '@/services/ai/externalProposal';
import { getAiSessionApiKey, hasAiSessionApiKey, isAiProviderReady, loadAiModelSettings, toAiProviderConfig } from '@/services/ai/AiSettings';
import { assertStarPolishCurrent, collectStarPolishTargets, requestStarPolish, type StarPolishDraft, type StarPolishKind } from '@/services/ai/starPolish';
import { useMcpState } from '@/services/ai/useMcpBridge';
import { resolveAiDriver, useAiDriverPreference } from '@/services/ai/useAiExecutionMode';
import { cancelExternalTask, copyExternalTaskPrompt, enqueueExternalTask, useExternalTasks } from '@/services/ai/externalTaskQueue';
import McpTaskStatusCard from './McpTaskStatusCard.vue';

const props = defineProps<{ resume: ResumeData }>();
const emit = defineEmits<{
  configure: [];
  apply: [proposal: EditProposal, done: (saved: boolean) => void];
}>();
const settings = ref(loadAiModelSettings());
const keyAvailable = ref(hasAiSessionApiKey());
const selected = ref<string[]>([]);
const accepted = ref<string[]>([]);
const role = ref('');
const consent = ref(false);
const loading = ref(false);
const applying = ref(false);
const draft = ref<StarPolishDraft | null>(null);
const error = ref('');
let controller: AbortController | undefined;
let generation = 0;
const { linkState: mcpLinkState } = useMcpState();
const { driverPreference } = useAiDriverPreference();
const { findTask } = useExternalTasks();
const mcpTaskId = ref('');
const mcpPrompt = ref('');
const mcpCopied = ref(false);
const activeMcpTask = computed(() => findTask(mcpTaskId.value));
const kindLabels: Record<StarPolishKind, string> = { summary: '个人简介', experience: '工作描述', project: '项目描述', highlights: '工作亮点' };
const targets = computed(() => collectStarPolishTargets(props.resume));
const providerReady = computed(() => isAiProviderReady(settings.value, keyAvailable.value ? getAiSessionApiKey(settings.value?.profileId) : ''));
const isMcpMode = computed(() => resolveAiDriver(mcpLinkState.value === 'connected', providerReady.value, driverPreference.value) === 'mcp');
const canPolish = computed(() => consent.value && (isMcpMode.value || providerReady.value) && selected.value.length > 0 && selected.value.length <= 12 && !loading.value);
function cancelMcpTask() { if (mcpTaskId.value) cancelExternalTask(mcpTaskId.value); }
const preview = (value: string) => value.replace(/\s+/g, ' ').slice(0, 72);
function cancel() { generation++; controller?.abort(); loading.value = false; }
function refreshSettings() {
  const next = loadAiModelSettings();
  const available = hasAiSessionApiKey();
  if (JSON.stringify(next) !== JSON.stringify(settings.value) || available !== keyAvailable.value) {
    cancel(); consent.value = false;
  }
  settings.value = next; keyAvailable.value = available;
}
watch([role, selected, () => props.resume], () => {
  if (loading.value) cancel();
  consent.value = false; draft.value = null; accepted.value = []; error.value = '';
}, { deep: true });
onMounted(() => window.addEventListener('focus', refreshSettings));
onBeforeUnmount(() => { cancel(); window.removeEventListener('focus', refreshSettings); });
async function polish() {
  refreshSettings();
  if (!canPolish.value) return;
  if (isMcpMode.value) {
    error.value = '';
    try {
      const chosenTargets = targets.value.filter((item) => selected.value.includes(item.key));
      const { task, prompt } = enqueueExternalTask({
        kind: 'polish',
        resumeId: props.resume.id,
        summary: `STAR 润色 ${chosenTargets.length} 项${role.value.trim() ? `（${role.value.trim()}）` : ''}`,
        payload: { resumeId: props.resume.id, targetRole: role.value.trim(), targets: chosenTargets },
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
  const keys = [...selected.value];
  controller = new AbortController(); loading.value = true; error.value = '';
  try {
    const result = await requestStarPolish(toAiProviderConfig(settings.value), props.resume, keys, role.value, { signal: controller.signal });
    if (current !== generation) return;
    draft.value = result;
    accepted.value = result.suggestions.filter((suggestion) => !suggestion.novelNumbers.length).map((suggestion) => suggestion.key);
  } catch (cause) {
    if (current === generation) error.value = cause instanceof Error ? cause.message : '润色失败，请重试。';
  } finally {
    if (current === generation) loading.value = false;
  }
}
function apply() {
  if (!draft.value || applying.value || !accepted.value.length) return;
  const chosen = draft.value.suggestions.filter((suggestion) => accepted.value.includes(suggestion.key));
  try { assertStarPolishCurrent(props.resume, chosen); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '内容已变化，请重新生成。'; return; }
  applying.value = true;
  void createExternalProposal(props.resume, { explanation: draft.value.explanation || '按 STAR 法则润色所选内容。', operations: chosen.map((suggestion) => suggestion.operation) }).then((proposal) => {
    emit('apply', proposal, (saved) => {
      applying.value = false;
      if (saved) { draft.value = null; accepted.value = []; selected.value = []; consent.value = false; }
    });
  }).catch((cause: unknown) => {
    applying.value = false;
    error.value = cause instanceof Error ? cause.message : '无法生成修改草稿。';
  });
}
defineExpose({ beforeClose: async () => !applying.value });
</script>

<style scoped>
.star-panel { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.hint { margin: 0; color: var(--ui-text-secondary); font-size: var(--ui-font-sm); line-height: 1.7; }
.provider, .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.provider { justify-content: space-between; }
.provider span, .suggestion p { overflow-wrap: anywhere; }
fieldset { display: flex; flex-direction: column; gap: 8px; min-width: 0; margin: 0; padding: 12px; border: 1px solid var(--color-rule-2); border-radius: var(--radius-input); }
legend { padding: 0 4px; font-size: var(--ui-font-sm); }
.target { display: flex; align-items: flex-start; gap: 8px; min-width: 0; line-height: 1.5; }
.target span { display: flex; min-width: 0; flex-direction: column; }
.target small { color: var(--ui-text-secondary); }
input[type=text], #star-role { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid var(--color-rule-2); border-radius: var(--radius-input); background: var(--color-paper-3); color: var(--color-ink); font: inherit; }
.consent { display: flex; align-items: flex-start; gap: 8px; line-height: 1.6; }
.suggestion { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-rule-2); }
.diff { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.diff div { min-width: 0; padding: 8px; border-radius: var(--ui-radius-md); background: var(--ui-bg-subtle); }
.diff small { color: var(--ui-text-muted); }
.diff p { margin: 4px 0 0; white-space: pre-wrap; }
.warning { margin: 0; color: var(--ui-warning); font-size: var(--ui-font-sm); line-height: 1.6; }
.error { margin: 0; color: var(--el-color-danger); }
@media (max-width: 640px) { .diff { grid-template-columns: 1fr; } }
</style>
