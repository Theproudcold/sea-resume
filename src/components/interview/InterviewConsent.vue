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
    <div class="consent-actions"><el-button type="primary" :disabled="disabled || !consent || !ready" @click="confirm">{{ confirmed ? '已确认，可继续' : '确认服务与发送范围' }}</el-button><el-button :disabled="disabled" @click="consent = false; confirmed = false; emit('changed')">撤回同意</el-button></div>
  </section>
</template>
<style scoped>
.consent-card { min-width: 0; padding: var(--ui-space-6); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); background: var(--ui-bg-surface); }
.consent-heading { display: flex; align-items: center; gap: var(--ui-space-3); margin-bottom: var(--ui-space-6); }.section-number { width: 36px; height: 36px; display: grid; place-items: center; border-radius: var(--ui-radius-md); background: color-mix(in srgb, var(--ui-primary) 7%, var(--ui-bg-surface)); color: var(--ui-primary); font-size: var(--ui-font-sm); font-weight: 600; flex-shrink: 0; }
h2 { font-size: var(--ui-font-lg); margin: 0; font-weight: 600; }.consent-heading p { margin: var(--ui-space-1) 0 0; color: var(--ui-text-muted); }
.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-4); } label { display: grid; gap: var(--ui-space-2); font-size: var(--ui-font-sm); color: var(--ui-text-secondary); }
input, select { width: 100%; min-width: 0; min-height: var(--ui-control-height); padding: var(--ui-space-2) var(--ui-space-3); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-bg-surface); color: var(--ui-text-main); font: inherit; }
p { line-height: 1.75; color: var(--ui-text-secondary); font-size: var(--ui-font-sm); overflow-wrap: anywhere; }.sending-destination { display: grid; gap: var(--ui-space-1); margin: var(--ui-space-4) 0; padding: var(--ui-space-3) var(--ui-space-4); border-radius: var(--ui-radius-md); background: var(--ui-bg-subtle); font-size: var(--ui-font-sm); }.sending-destination > span { color: var(--ui-text-muted); font-size: var(--ui-font-xs); }.sending-destination code { font-size: var(--ui-font-xs); color: var(--ui-text-secondary); overflow-wrap: anywhere; }
.check { display: flex; align-items: flex-start; gap: var(--ui-space-2); margin: var(--ui-space-4) 0; line-height: 1.7; }.check input { width: auto; min-height: auto; margin-top: var(--ui-space-1); accent-color: var(--ui-primary); }
.consent-actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); }.consent-actions :deep(.el-button) { margin: 0; height: auto; min-height: var(--ui-control-height); white-space: normal; max-width: 100%; }
details { margin-top: var(--ui-space-3); } summary { cursor: pointer; color: var(--ui-text-secondary); font-size: var(--ui-font-sm); } pre { max-height: 280px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--ui-font-xs); padding: var(--ui-space-3); background: var(--ui-bg-subtle); border-radius: var(--ui-radius-md); }
@media (max-width: 768px) { .consent-card { padding: var(--ui-space-4); }.fields { grid-template-columns: minmax(0, 1fr); }.consent-heading { align-items: flex-start; } }
</style>
