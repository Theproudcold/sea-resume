<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AiProviderConfig } from '@/types/ai';
import { AI_PROVIDER_PRESETS, loadAiModelSettings, loadAiProviderProfiles, getAiSessionApiKey, setAiSessionApiKey, normalizeAiProviderOptions, isAiProviderReady, toAiProviderConfig } from '@/services/ai/AiSettings';
const props = defineProps<{ preview: unknown; frozenProvider?: { baseUrl: string; model: string }; disabled?: boolean }>();
const emit = defineEmits<{ confirmed: [config: AiProviderConfig]; changed: [] }>();
const profiles = loadAiProviderProfiles().filter(p => p.enabled);
const saved = loadAiModelSettings();
const profileId = ref(saved?.profileId ?? '');
const baseUrl = ref(props.frozenProvider?.baseUrl ?? saved?.baseUrl ?? 'https://api.deepseek.com/v1');
const model = ref(props.frozenProvider?.model ?? saved?.model ?? 'deepseek-chat');
const apiKey = ref(getAiSessionApiKey(profileId.value));
const providerOptions = ref(normalizeAiProviderOptions(saved ?? {}));
const currentSettings = computed(() => ({ baseUrl: baseUrl.value, model: model.value, ...providerOptions.value }));
const ready = computed(() => isAiProviderReady(currentSettings.value, apiKey.value));
const consent = ref(false);
const confirmed = ref(false);
watch([baseUrl, model, apiKey, providerOptions], () => { consent.value = false; confirmed.value = false; emit('changed'); }, { deep: true });
function selectProfile() {
  const profile = profiles.find(p => p.profileId === profileId.value);
  if (profile) { baseUrl.value = profile.baseUrl; model.value = profile.model; apiKey.value = getAiSessionApiKey(profile.profileId); providerOptions.value = normalizeAiProviderOptions(profile); }
}
function preset(event: Event) {
  const selected = AI_PROVIDER_PRESETS.find(p => p.id === (event.target as HTMLSelectElement).value);
  if (selected) { profileId.value = ''; baseUrl.value = selected.baseUrl; model.value = selected.model; apiKey.value = ''; providerOptions.value = normalizeAiProviderOptions(selected); }
}
function confirm() {
  if (!consent.value || !ready.value) return;
  setAiSessionApiKey(apiKey.value, profileId.value || undefined);
  confirmed.value = true;
  emit('confirmed', toAiProviderConfig(currentSettings.value, apiKey.value));
}
defineExpose({ reset: () => { consent.value = false; confirmed.value = false; emit('changed'); } });
</script>
<template>
  <section class="consent-card">
    <header class="consent-heading"><span class="section-number" aria-hidden="true">02</span><div><h2>发送范围与服务确认</h2><p>你决定内容发送到哪里，以及何时开始。</p></div></header>
    <div class="fields">
      <label v-if="profiles.length">已有服务<select v-model="profileId" :disabled="disabled" @change="selectProfile"><option value="">自定义</option><option v-for="p in profiles" :key="p.profileId" :value="p.profileId">{{ p.profileName }}</option></select></label>
      <label>预设<select :disabled="disabled" aria-label="服务预设" @change="preset"><option value="">选择预设</option><option v-for="p in AI_PROVIDER_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option></select></label>
      <label>服务地址<input v-model="baseUrl" :disabled="disabled" maxlength="2048" /></label>
      <label>模型<input v-model="model" :disabled="disabled" maxlength="200" /></label>
      <label>鉴权方式<select v-model="providerOptions.authMode" :disabled="disabled"><option value="bearer">Bearer API Key</option><option value="none">无鉴权（仅本机 loopback）</option></select></label>
      <label v-if="providerOptions.authMode !== 'none'">本次 API Key<input v-model="apiKey" :disabled="disabled" type="password" autocomplete="off" /></label>
      <label>JSON 模式<select v-model="providerOptions.jsonMode" :disabled="disabled"><option :value="true">启用</option><option :value="false">关闭（仍校验 JSON）</option></select></label>
      <label>请求超时（毫秒）<input v-model.number="providerOptions.timeoutMs" :disabled="disabled" type="number" min="1000" max="600000" /></label>
    </div>
    <div class="sending-destination"><span>本次发送至</span><strong>{{ model || '未填写模型' }}</strong><code>{{ baseUrl || '未填写服务地址' }}</code></div>
    <details class="privacy-details"><summary>隐私边界与密钥保存方式</summary><p>仅发送白名单快照、岗位 / JD 和后续实际回答。隐藏内容、照片、生日和结构化联系方式不发送；正文仍可能含敏感信息，请检查。Key 仅在内存，刷新需重新输入。</p></details>
    <details><summary>预览实际发送数据（不含 Key）</summary><pre>{{ JSON.stringify(preview, null, 2) }}</pre></details>
    <label class="check"><input v-model="consent" type="checkbox" :disabled="disabled" />我已检查发送范围，同意发送至此服务。更换服务/模型后重新确认。</label>
    <div class="consent-actions"><el-button :disabled="disabled || !consent || !ready" @click="confirm">{{ confirmed ? '已确认，可继续' : '确认服务与发送范围' }}</el-button><el-button text :disabled="disabled" @click="consent = false; confirmed = false; emit('changed')">撤回同意</el-button></div>
  </section>
</template>
<style scoped>
/* A setup section: flat on the paper under a 2px ink rule, numbered like a route sign. */
.consent-card {
  min-width: 0;
  padding-top: var(--space-md);
  border-top: var(--rule-hair) solid var(--color-rule);
}

.consent-heading {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.section-number {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-input);
  background: var(--color-accent-wash);
  color: var(--color-accent);
  font-size: var(--text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

h2 {
  min-width: 0;
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: break-word;
  text-wrap: balance;
}

.consent-heading p { margin: var(--space-2xs) 0 0; color: var(--color-muted); }

.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
}

label {
  display: grid;
  gap: var(--space-2xs);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  font-weight: 500;
}

input, select {
  width: 100%;
  min-width: 0;
  min-height: var(--control-height);
  padding: var(--space-2xs) var(--space-sm);
  border: var(--rule-hair) solid var(--color-rule-2);
  border-radius: var(--radius-input);
  background: var(--color-paper-3);
  color: var(--color-ink);
  font: inherit;
  font-weight: 400;
  transition: box-shadow var(--dur-micro) var(--ease-out), border-color var(--dur-micro) var(--ease-out);
}

input:focus-visible, select:focus-visible { outline: none; border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-accent-wash); }
input:disabled, select:disabled { opacity: 0.55; cursor: not-allowed; }

@media (hover: hover) {
  input:not(:disabled):hover, select:not(:disabled):hover { border-color: var(--color-ink-2); }
}

p {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  line-height: 1.7;
  overflow-wrap: break-word;
}

.sending-destination {
  display: grid;
  gap: var(--space-2xs);
  margin: var(--space-md) 0;
  padding: var(--space-sm) var(--space-md);
  background: var(--color-paper-2);
  font-size: var(--text-sm);
}

.sending-destination > span { color: var(--color-muted); font-size: var(--text-xs); font-weight: 500; }
.sending-destination strong { font-weight: 600; overflow-wrap: break-word; }
.sending-destination code { color: var(--color-ink-2); font-size: var(--text-xs); overflow-wrap: anywhere; }

.check {
  display: flex;
  align-items: flex-start;
  gap: var(--space-xs);
  margin: var(--space-md) 0;
  color: var(--color-ink);
  line-height: 1.6;
}

.check input {
  width: auto;
  min-height: auto;
  margin-top: var(--space-2xs);
  accent-color: var(--color-accent);
}

.consent-actions { display: flex; flex-wrap: wrap; gap: var(--space-xs); }
.consent-actions :deep(.el-button) { max-width: 100%; height: auto; min-height: var(--control-height); margin: 0; white-space: normal; }

details {
  padding: var(--space-xs) 0;
  border-bottom: var(--rule-hair) solid var(--color-rule);
}

.privacy-details { border-top: var(--rule-hair) solid var(--color-rule); }

summary {
  color: var(--color-ink-2);
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 500;
  transition: color var(--dur-micro) var(--ease-out);
}

summary:active { color: var(--color-accent); }

@media (hover: hover) {
  summary:hover { color: var(--color-ink); text-decoration: underline; }
}

pre {
  max-height: 280px;
  margin: var(--space-xs) 0 0;
  padding: var(--space-sm);
  overflow: auto;
  background: var(--color-paper-2);
  font-size: var(--text-xs);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 768px) {
  .fields { grid-template-columns: minmax(0, 1fr); }
  .consent-heading { align-items: flex-start; }
}
</style>
