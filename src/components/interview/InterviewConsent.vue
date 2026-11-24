<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AiProviderConfig } from '@/types/ai';
import {
  getAiSessionApiKey,
  hasAiSessionApiKey,
  hasAiStoredApiKey,
  isAiProviderReady,
  loadAiModelSettings,
  loadAiProviderProfiles,
  normalizeAiProviderOptions,
  setAiSessionApiKey,
  setAiStoredApiKey,
  toAiProviderConfig,
  type AiProviderProfile,
} from '@/services/ai/AiSettings';
import { useMcpState } from '@/services/ai/useMcpBridge';

const props = defineProps<{ preview: unknown; frozenProvider?: { baseUrl: string; model: string }; disabled?: boolean; revision?: number; authorized?: boolean }>();
const emit = defineEmits<{ confirmed: [config: AiProviderConfig]; changed: []; configure: [] }>();
const { linkState: mcpLinkState } = useMcpState();
const mcpConnected = computed(() => mcpLinkState.value === 'connected');

// Service and model are configured once in the settings panel; this step only picks
// among saved providers, fills in a missing key, and records consent.
const profiles = ref<AiProviderProfile[]>([]);
const selectedProfileId = ref('');
const apiKey = ref('');
const rememberKey = ref(false);
const editingKey = ref(false);
const consent = ref(false);
const confirmed = ref(false);
const keyVersion = ref(0);

const selectedProfile = computed(() => profiles.value.find(profile => profile.profileId === selectedProfileId.value) ?? null);
const providerOptions = computed(() => normalizeAiProviderOptions(selectedProfile.value ?? {}));
const needsKey = computed(() => !!selectedProfile.value && providerOptions.value.authMode !== 'none');
const keyPresent = computed(() => { keyVersion.value; return !!selectedProfile.value && hasAiSessionApiKey(selectedProfile.value.profileId); });
const keyStored = computed(() => { keyVersion.value; return !!selectedProfile.value && hasAiStoredApiKey(selectedProfile.value.profileId); });
const showKeyInput = computed(() => needsKey.value && (editingKey.value || !keyPresent.value));
const effectiveKey = computed(() => apiKey.value.trim() || (selectedProfile.value ? getAiSessionApiKey(selectedProfile.value.profileId) : ''));
const ready = computed(() => !!selectedProfile.value && isAiProviderReady({ ...selectedProfile.value, ...providerOptions.value, enabled: true }, effectiveKey.value));

function reload() {
  const saved = loadAiModelSettings();
  const previousId = selectedProfileId.value;
  const frozen = props.frozenProvider;
  profiles.value = loadAiProviderProfiles().filter(profile => profile.enabled);
  const preferred = (frozen ? profiles.value.find(profile => profile.baseUrl === frozen.baseUrl && profile.model === frozen.model) : undefined)
    ?? profiles.value.find(profile => profile.profileId === saved?.profileId)
    ?? profiles.value.find(profile => profile.profileId === previousId)
    ?? profiles.value[0];
  selectedProfileId.value = preferred?.profileId ?? '';
  apiKey.value = '';
  editingKey.value = false;
  rememberKey.value = !!preferred && hasAiStoredApiKey(preferred.profileId);
  consent.value = false;
  confirmed.value = false;
  keyVersion.value += 1;
}

function invalidate() {
  consent.value = false;
  confirmed.value = false;
  emit('changed');
}

function changeConsent() {
  confirmed.value = false;
  // Unchecking consent must also revoke the parent's permission to send.
  emit('changed');
}

function selectProfile() {
  apiKey.value = '';
  editingKey.value = false;
  rememberKey.value = hasAiStoredApiKey(selectedProfileId.value);
  keyVersion.value += 1;
  invalidate();
}

function editKey() {
  editingKey.value = true;
  apiKey.value = '';
  invalidate();
}

function confirm() {
  const profile = selectedProfile.value;
  if (!profile || !consent.value || !ready.value || props.disabled) return;
  const key = effectiveKey.value;
  if (needsKey.value) {
    if (key) setAiSessionApiKey(key, profile.profileId);
    if (rememberKey.value && key) setAiStoredApiKey(key, profile.profileId);
    else if (!rememberKey.value) setAiStoredApiKey('', profile.profileId);
  }
  keyVersion.value += 1;
  editingKey.value = false;
  apiKey.value = '';
  confirmed.value = true;
  emit('confirmed', toAiProviderConfig({ ...profile, ...providerOptions.value, enabled: true }, key));
}

reload();
// The session form is a new instance; the parent remains the source of active consent.
watch(() => props.authorized, (authorized) => {
  if (authorized === undefined) return;
  consent.value = authorized;
  confirmed.value = authorized;
}, { immediate: true });
watch(() => props.revision, () => { reload(); invalidate(); });
// Clearing consent must not snap the chosen service back, so reset does not reload saved settings.
defineExpose({ reset: () => { editingKey.value = false; invalidate(); } });
</script>
<template>
  <section class="consent-card">
    <div v-if="!profiles.length" class="empty-provider">
      <p v-if="mcpConnected">已连接外部 MCP（免 API Key）：你可以直接让外部 Agent 主持文字模拟面试，并通过 <code>sea_interview_save</code> 将复盘报告保存到本机面试记录。如需由网页自动出题，再配置下方网页模型。</p>
      <p v-else>还没有可用的 AI 服务。先完成配置，再确认发送范围。</p>
      <el-button :disabled="disabled" @click="emit('configure')">配置 AI 服务</el-button>
    </div>
    <template v-else>
      <div class="service-summary">
        <label class="service-picker">本次服务
          <select v-model="selectedProfileId" :disabled="disabled" aria-label="本次服务" @change="selectProfile">
            <option v-for="profile in profiles" :key="profile.profileId" :value="profile.profileId">{{ profile.profileName }}</option>
          </select>
        </label>
        <dl class="service-facts">
          <div><dt>模型</dt><dd>{{ selectedProfile?.model || '未填写模型' }}</dd></div>
          <div><dt>服务地址</dt><dd><code>{{ selectedProfile?.baseUrl || '未填写服务地址' }}</code></dd></div>
          <div><dt>鉴权方式</dt><dd>{{ providerOptions.authMode === 'none' ? '无鉴权（仅本机）' : 'Bearer API Key' }}</dd></div>
          <div><dt>密钥</dt><dd>{{ !needsKey ? '无需密钥' : keyStored ? '已记住到本机' : keyPresent ? '本次会话已配置' : '需要输入' }}</dd></div>
        </dl>
        <el-button text :disabled="disabled" @click="emit('configure')">更换服务 / 模型</el-button>
      </div>
      <template v-if="needsKey">
        <div v-if="showKeyInput" class="key-row">
          <label>本次 API Key<input v-model="apiKey" :disabled="disabled" type="password" autocomplete="off" :placeholder="keyPresent ? '留空则继续使用已配置的密钥' : '输入这家服务商的 API Key'" @input="invalidate" /></label>
          <label class="check"><input v-model="rememberKey" data-testid="remember-key" type="checkbox" :disabled="disabled" @change="invalidate" />记住密钥到本机，刷新后无需重新输入（明文存储，仅建议私人设备）</label>
        </div>
        <div v-else class="key-ready">
          <span>API Key 已就绪{{ keyStored ? '（已记住到本机）' : '（仅本次会话）' }}</span>
          <el-button text :disabled="disabled" @click="editKey">更换密钥</el-button>
        </div>
      </template>
      <p v-if="!ready" role="status">{{ needsKey && !effectiveKey ? '请先输入 API Key，再确认发送范围。' : '服务配置不完整，请检查模型和服务地址。' }}</p>
    </template>
    <p>将发送简历可见内容、岗位要求和后续回答。正文可能含敏感信息，请先检查。</p>
    <details class="privacy-details"><summary>哪些内容不会发送？密钥如何保存？</summary><p>结构化姓名、联系方式、生日、照片和隐藏内容不发送。API Key 默认仅在本次页面会话中保留；勾选记住后会以明文保存在本机浏览器，可在设置中心清除。</p></details>
    <details><summary>预览发送内容（不含密钥）</summary><pre>{{ JSON.stringify(preview, null, 2) }}</pre></details>
    <label class="check"><input v-model="consent" data-testid="interview-consent" type="checkbox" :disabled="disabled || !profiles.length" @change="changeConsent" />我已检查发送范围，同意发送至上述 AI 服务。</label>
    <div class="consent-actions"><el-button :disabled="disabled || !consent || !ready || confirmed" @click="confirm">{{ confirmed ? '已确认，可继续' : '确认服务与发送范围' }}</el-button><el-button v-if="confirmed" text :disabled="disabled" @click="invalidate">撤回同意</el-button></div>
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

.empty-provider { display: grid; gap: var(--space-sm); justify-items: start; }
.empty-provider p { margin: 0; }

/* The configured service is shown, not re-edited: editing happens once in the settings panel. */
.service-summary { display: grid; gap: var(--space-sm); }
.service-picker { max-width: 320px; }
.service-facts { display: grid; gap: var(--space-xs); margin: 0; padding: var(--space-sm) var(--space-md); background: var(--color-paper-2); font-size: var(--text-sm); }
.service-facts > div { display: flex; justify-content: space-between; gap: var(--space-sm); }
.service-facts dt { color: var(--color-muted); }
.service-facts dd { margin: 0; min-width: 0; font-weight: 500; overflow-wrap: anywhere; text-align: right; }
.service-facts code { color: var(--color-ink-2); font-size: var(--text-xs); font-weight: 400; }
.service-summary :deep(.el-button) { justify-self: start; }

.key-row { display: grid; gap: var(--space-xs); margin-top: var(--space-md); }
.key-ready { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-xs); margin-top: var(--space-md); color: var(--color-ink-2); font-size: var(--text-sm); }

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
  .consent-heading { align-items: flex-start; }
}
</style>
