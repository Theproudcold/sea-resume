<template>
  <section class="provider-manager" aria-label="AI 服务商配置">
    <section v-if="view === 'list'" class="provider-flow-view">
      <div v-if="profiles.length" class="provider-list" aria-label="已添加的服务商">
        <article
          v-for="profile in profiles"
          :key="profile.profileId"
          class="provider-row"
          :class="{ 'is-disabled': !profile.enabled }"
        >
          <button class="provider-row-main" type="button" @click="openDetails(profile.profileId)">
            <AiProviderLogo :preset-id="profile.presetId" />
            <span class="provider-copy">
              <span class="provider-name-line">
                <strong>{{ profile.profileName }}</strong>
                <el-tag v-if="defaultProviderId === profile.profileId" size="small" type="primary" effect="light" round>默认</el-tag>
              </span>
              <span class="provider-subtitle">
                {{ providerTypeLabel(profile) }}<span v-if="providerHost(profile)"> · {{ providerHost(profile) }}</span>
                · {{ modelCount(profile) }} 个模型
              </span>
            </span>
          </button>
          <div class="provider-row-actions">
            <span class="provider-status" :class="`status-${providerStatus(profile).kind}`">
              <i aria-hidden="true" />{{ providerStatus(profile).label }}
            </span>
            <el-switch
              :model-value="profile.enabled"
              :aria-label="`${profile.profileName} ${profile.enabled ? '已启用' : '未启用'}`"
              @change="toggleProvider(profile, Boolean($event))"
            />
            <el-button class="row-detail-button" text aria-label="查看服务商详情" @click="openDetails(profile.profileId)">
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
        </article>
      </div>
      <button v-else type="button" class="add-first-provider-card" @click="view = 'catalog'">
        <span class="first-provider-plus" aria-hidden="true">+</span>
        <strong>添加服务商</strong>
      </button>

      <div class="provider-list-actions">
        <el-button v-if="profiles.length" type="primary" plain class="add-provider-button" @click="view = 'catalog'">
          <el-icon><Plus /></el-icon>添加服务商
        </el-button>
        <div class="local-config-actions">
          <input ref="configInput" class="visually-hidden" type="file" accept="application/json,.json" @change="importConfigFile" />
          <el-button text @click="configInput?.click()">导入本地配置</el-button>
          <el-button text :disabled="!profiles.length" @click="exportConfig">导出配置</el-button>
        </div>
      </div>

      <el-alert v-if="profiles.length && !enabledCount" class="empty-enabled-alert" type="info" :closable="false" show-icon title="目前没有启用的服务商。启用一家服务商后，AI 助手和 PDF 导入才可使用。" />
      <el-alert class="privacy-note" type="info" :closable="false" show-icon>
        <template #title>隐私说明</template>
        <p>服务商地址、模型选择和启用状态保存在本机。API Key 不会写入本地配置；简历只在你主动发起 AI 操作并确认后发送。</p>
      </el-alert>
    </section>

    <section v-else-if="view === 'catalog'" class="provider-flow-view provider-catalog-view">
      <header class="flow-heading">
        <el-button text @click="view = 'list'">返回供应商</el-button>
        <div><span class="detail-eyebrow">新增连接</span><h3>添加服务商</h3></div>
      </header>
      <p class="add-dialog-intro">选择模型平台开始配置，也可以选择自定义服务商地址。</p>
      <div class="provider-catalog">
        <button
          v-for="preset in AI_PROVIDER_PRESETS"
          :key="preset.id"
          type="button"
          class="catalog-card"
          @click="addProvider(preset.id)"
        >
          <AiProviderLogo :preset-id="preset.id" />
          <span class="catalog-copy"><strong>{{ preset.label }}</strong><small>{{ preset.id === 'custom' ? '配置任意兼容服务地址' : '预填服务地址和推荐模型' }}</small></span>
          <el-icon><ArrowRight /></el-icon>
        </button>
      </div>
    </section>

    <section v-else-if="view === 'detail' && selectedProfile" class="provider-flow-view provider-detail-view">
      <header class="flow-heading">
        <el-button text @click="backToProviderList">返回供应商</el-button>
        <div class="detail-heading-copy">
          <AiProviderLogo :preset-id="selectedProfile.presetId" />
          <div>
            <span class="detail-eyebrow">{{ isNewProfile ? '新增连接' : '服务商设置' }}</span>
            <h3>{{ selectedProfile.profileName || '新服务商' }}</h3>
          </div>
        </div>
        <el-tag v-if="defaultProviderId === selectedProfile.profileId" type="primary" effect="light" round>默认服务</el-tag>
      </header>

      <el-form label-position="top" class="provider-form">
        <div class="form-grid">
          <el-form-item label="显示名称">
            <el-input v-model="selectedProfile.profileName" maxlength="80" placeholder="例如：公司内网模型" />
          </el-form-item>
          <el-form-item label="服务商类型">
            <el-select v-model="selectedProfile.presetId" class="w-full" @change="applyProviderPreset">
              <el-option v-for="preset in AI_PROVIDER_PRESETS" :key="preset.id" :label="preset.label" :value="preset.id" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item v-if="selectedProfile.presetId === 'custom'" label="自定义服务商地址" class="provider-address-field">
          <el-input v-model="selectedProfile.baseUrl" placeholder="https://api.example.com/v1" autocomplete="url" />
        </el-form-item>
        <el-form-item label="模型">
          <div class="model-picker-row">
            <el-select
              v-model="selectedProfile.model"
              class="model-picker"
              filterable
              allow-create
              default-first-option
              clearable
              placeholder="获取列表后选择，或直接输入模型 ID"
            >
              <el-option v-for="modelId in selectedProfile.models" :key="modelId" :label="modelId" :value="modelId" />
            </el-select>
            <el-button :loading="fetchingModels" :disabled="!selectedProfile.baseUrl.trim()" @click="fetchModels">
              获取模型列表
            </el-button>
          </div>
          <p class="field-note">从服务商的 <code>/models</code> 接口读取。服务商未开放列表或浏览器跨域时，可手动输入模型 ID。</p>
        </el-form-item>
        <el-form-item label="API Key（仅当前会话）">
          <el-input
            v-model="apiKeyDraft"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="hasSelectedKey ? '当前会话已配置；留空则保持不变' : '输入此服务商的 API Key'"
          />
          <p class="field-note">{{ hasSelectedKey ? '密钥仅供这家服务商使用，刷新或关闭页面后需要重新输入。' : '密钥保存在当前页面内存，不会写入浏览器存储。' }}</p>
        </el-form-item>
      </el-form>

      <el-alert v-if="modelError" class="model-error" type="warning" :closable="false" show-icon :title="modelError" />
      <el-alert v-if="!selectedProfile.enabled" class="detail-hint" type="info" :closable="false" title="保存后可在供应商列表中启用此服务商。" />

      <footer class="detail-footer">
        <el-button text type="danger" @click="removeProvider">{{ isNewProfile ? '取消添加' : '删除服务商' }}</el-button>
        <span class="footer-spacer" />
        <el-button
          v-if="selectedProfile.enabled && defaultProviderId !== selectedProfile.profileId"
          @click="saveSettings(true)"
        >保存并设为默认</el-button>
        <el-button type="primary" :disabled="!canSave" @click="saveSettings()">保存配置</el-button>
      </footer>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowRight, Plus } from '@element-plus/icons-vue';
import AiProviderLogo from '@/components/workbench/AiProviderLogo.vue';
import {
  AI_PROVIDER_PRESETS,
  clearAiModelSettings,
  clearAiSessionApiKey,
  getActiveAiProviderId,
  getAiSessionApiKey,
  hasAiSessionApiKey,
  loadAiProviderProfiles,
  saveAiProviderProfiles,
  setAiSessionApiKey,
  type AiProviderPresetId,
  type AiProviderProfile,
} from '@/services/ai/AiSettings';
import { listProviderModels } from '@/services/ai/AiProvider';

const emit = defineEmits<{ saved: [] }>();
const profiles = ref<AiProviderProfile[]>(loadAiProviderProfiles());
const defaultProviderId = ref(getActiveAiProviderId() ?? '');
const selectedProfile = ref<AiProviderProfile | null>(null);
const selectedHasKeyVersion = ref(0);
const apiKeyDraft = ref('');
const modelError = ref('');
const fetchingModels = ref(false);
const view = ref<'list' | 'catalog' | 'detail'>('list');
const isNewProfile = ref(false);
const configInput = ref<HTMLInputElement>();
const enabledCount = computed(() => profiles.value.filter((profile) => profile.enabled).length);
const hasSelectedKey = computed(() => {
  selectedHasKeyVersion.value;
  return !!selectedProfile.value && hasAiSessionApiKey(selectedProfile.value.profileId);
});
const canSave = computed(() => !!selectedProfile.value
  && !!selectedProfile.value.profileName.trim()
  && !!selectedProfile.value.baseUrl.trim()
  && !!selectedProfile.value.model.trim()
  && !fetchingModels.value);

function providerTypeLabel(profile: AiProviderProfile): string {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === profile.presetId)?.label ?? '自定义服务';
}

function providerHost(profile: AiProviderProfile): string {
  try { return new URL(profile.baseUrl).host; } catch { return ''; }
}

function modelCount(profile: AiProviderProfile): number {
  return profile.models.length || (profile.model.trim() ? 1 : 0);
}

function providerStatus(profile: AiProviderProfile): { kind: string; label: string } {
  if (!profile.enabled) return { kind: 'off', label: '已停用' };
  if (!profile.baseUrl.trim() || !profile.model.trim()) return { kind: 'warning', label: '待配置' };
  if (!hasAiSessionApiKey(profile.profileId)) return { kind: 'warning', label: '需输入 API Key' };
  return { kind: 'success', label: '已就绪' };
}

function openDetails(profileId: string) {
  const profile = profiles.value.find((item) => item.profileId === profileId);
  if (!profile) return;
  selectedProfile.value = { ...profile, models: [...profile.models] };
  isNewProfile.value = false;
  apiKeyDraft.value = '';
  modelError.value = '';
  selectedHasKeyVersion.value += 1;
  view.value = 'detail';
}

function backToProviderList() {
  selectedProfile.value = null;
  isNewProfile.value = false;
  apiKeyDraft.value = '';
  modelError.value = '';
  selectedHasKeyVersion.value += 1;
  view.value = 'list';
}

function makeProfile(presetId: AiProviderPresetId): AiProviderProfile {
  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === presetId)!;
  const profileId = `provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sameNameCount = profiles.value.filter((profile) => profile.profileName.startsWith(preset.label)).length;
  return {
    profileId,
    profileName: sameNameCount ? `${preset.label} ${sameNameCount + 1}` : preset.label,
    presetId,
    baseUrl: preset.baseUrl,
    model: preset.model,
    enabled: true,
    models: [],
  };
}

function addProvider(presetId: AiProviderPresetId) {
  if (profiles.value.length >= 30) {
    ElMessage.warning('服务商配置最多支持 30 家。');
    return;
  }
  selectedProfile.value = makeProfile(presetId);
  isNewProfile.value = true;
  apiKeyDraft.value = '';
  modelError.value = '';
  selectedHasKeyVersion.value += 1;
  view.value = 'detail';
}

function applyProviderPreset(presetId: AiProviderPresetId) {
  const profile = selectedProfile.value;
  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === presetId);
  if (!profile || !preset) return;
  profile.presetId = presetId;
  profile.baseUrl = preset.baseUrl;
  profile.model = preset.model;
  profile.models = [];
}

async function fetchModels() {
  const profile = selectedProfile.value;
  if (!profile) return;
  const apiKey = apiKeyDraft.value.trim() || getAiSessionApiKey(profile.profileId);
  if (!apiKey) {
    modelError.value = '请先填写这家服务商的 API Key，再获取模型列表。';
    return;
  }
  fetchingModels.value = true;
  modelError.value = '';
  try {
    profile.models = await listProviderModels(profile.baseUrl, apiKey);
    if (profile.model && !profile.models.includes(profile.model)) profile.models.unshift(profile.model);
    ElMessage.success(`已获取 ${profile.models.length} 个模型`);
  } catch (error) {
    modelError.value = error instanceof Error ? error.message : '获取模型列表失败。';
  } finally {
    fetchingModels.value = false;
  }
}

function persistProfiles(nextProfiles: AiProviderProfile[], activeId?: string) {
  saveAiProviderProfiles(nextProfiles, activeId);
  profiles.value = nextProfiles;
  defaultProviderId.value = getActiveAiProviderId() ?? '';
}

function saveSettings(makeDefault = false) {
  const profile = selectedProfile.value;
  if (!profile || !canSave.value) return;
  try {
    const nextProfiles = isNewProfile.value
      ? [...profiles.value, profile]
      : profiles.value.map((item) => item.profileId === profile.profileId ? profile : item);
    const activeId = makeDefault || (profile.enabled && !defaultProviderId.value)
      ? profile.profileId
      : defaultProviderId.value || undefined;
    persistProfiles(nextProfiles, activeId);
    if (apiKeyDraft.value.trim()) setAiSessionApiKey(apiKeyDraft.value, profile.profileId);
    apiKeyDraft.value = '';
    selectedHasKeyVersion.value += 1;
    isNewProfile.value = false;
    ElMessage.success(makeDefault ? '服务商配置已保存并设为默认' : '服务商配置已保存');
    emit('saved');
    backToProviderList();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存服务商配置失败。');
  }
}

function toggleProvider(profile: AiProviderProfile, enabled: boolean) {
  const previous = profile.enabled;
  const nextProfiles = profiles.value.map((item) => item.profileId === profile.profileId ? { ...item, enabled } : item);
  try {
    persistProfiles(nextProfiles, enabled ? (defaultProviderId.value || profile.profileId) : defaultProviderId.value || undefined);
    emit('saved');
  } catch (error) {
    profile.enabled = previous;
    ElMessage.error(error instanceof Error ? error.message : '更新服务商状态失败。');
  }
}

async function removeProvider() {
  const profile = selectedProfile.value;
  if (!profile) return;
  if (isNewProfile.value) {
    backToProviderList();
    return;
  }
  try {
    await ElMessageBox.confirm(`确定删除「${profile.profileName}」的本地配置吗？API Key 也会从当前会话清除。`, '删除服务商', {
      confirmButtonText: '删除配置', cancelButtonText: '取消', type: 'warning',
    });
    clearAiSessionApiKey(profile.profileId);
    const nextProfiles = profiles.value.filter((item) => item.profileId !== profile.profileId);
    persistProfiles(nextProfiles);
    ElMessage.success('服务商配置已删除');
    emit('saved');
    backToProviderList();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error instanceof Error ? error.message : '删除服务商配置失败。');
  }
}

function exportConfig() {
  if (!profiles.value.length) return;
  const payload = {
    format: 'sea-resume-ai-providers',
    version: 1,
    providers: profiles.value.map(({ profileId, profileName, presetId, baseUrl, model, enabled, models }) => ({
      profileId, profileName, presetId, baseUrl, model, enabled, models,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'sea-resume-ai-providers.json';
  anchor.click();
  URL.revokeObjectURL(url);
  ElMessage.success('已导出服务商配置（不含 API Key）');
}

async function importConfigFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('本地配置文件不能超过 1 MB。');
    const payload = JSON.parse(await file.text()) as { format?: unknown; providers?: unknown };
    if (payload.format !== 'sea-resume-ai-providers' || !Array.isArray(payload.providers)) {
      throw new Error('配置文件格式不正确。');
    }
    const imported = payload.providers.flatMap((entry): AiProviderProfile[] => {
      if (!entry || typeof entry !== 'object') return [];
      const item = entry as Record<string, unknown>;
      if (typeof item.profileName !== 'string' || !item.profileName.trim() || typeof item.baseUrl !== 'string' || typeof item.model !== 'string') return [];
      if (typeof item.presetId !== 'string' || !AI_PROVIDER_PRESETS.some((preset) => preset.id === item.presetId)) return [];
      const presetId = item.presetId as AiProviderPresetId;
      return [{
        profileId: `provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        profileName: item.profileName.trim().slice(0, 80),
        presetId,
        baseUrl: item.baseUrl.slice(0, 2048),
        model: item.model.slice(0, 200),
        enabled: item.enabled === true,
        models: Array.isArray(item.models) ? item.models.filter((model): model is string => typeof model === 'string' && model.length <= 200).slice(0, 1000) : [],
      }];
    });
    if (!imported.length) throw new Error('配置文件中没有可导入的服务商。');
    if (profiles.value.length + imported.length > 30) throw new Error('服务商配置最多支持 30 家。');
    const nextProfiles = [...profiles.value, ...imported];
    persistProfiles(nextProfiles);
    const firstImported = imported[0]!;
    selectedProfile.value = { ...firstImported, models: [...firstImported.models] };
    isNewProfile.value = false;
    view.value = 'detail';
    ElMessage.success(`已导入 ${imported.length} 家服务商；请分别填写 API Key。`);
    emit('saved');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导入服务商配置失败。');
  } finally {
    input.value = '';
  }
}
</script>

<style scoped>
.provider-manager { display: flex; flex-direction: column; gap: 16px; }
.provider-flow-view { display: flex; min-height: 0; flex-direction: column; gap: 16px; }
.flow-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
.flow-heading > div:not(.detail-heading-copy) { flex: 1; min-width: 0; }
.flow-heading h3 { margin: 3px 0 0; color: var(--ui-text-main); font-size: var(--ui-font-lg); }
.detail-heading-copy { display: flex; flex: 1; min-width: 0; align-items: center; gap: 12px; }
.provider-detail-view { padding: 18px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); background: var(--ui-bg-surface); }
.provider-detail-view .provider-form { margin-top: 16px; }
.provider-catalog-view { min-height: 320px; }
.provider-list { overflow: hidden; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); background: var(--ui-bg-surface); }
.provider-row { display: flex; align-items: center; gap: 14px; min-height: 82px; padding: 13px 16px; border-bottom: 1px solid var(--ui-border); transition: background-color .16s ease; }
.provider-row:last-child { border-bottom: 0; }
.provider-row:hover { background: color-mix(in srgb, var(--ui-primary) 4%, var(--ui-bg-surface)); }
.provider-row.is-disabled .provider-row-main { opacity: .68; }
.provider-row-main { display: flex; flex: 1; min-width: 0; align-items: center; gap: 13px; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.provider-copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.provider-name-line { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.provider-name-line strong { overflow: hidden; color: var(--ui-text-main); font-size: var(--ui-font-md); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.provider-subtitle { overflow: hidden; color: var(--ui-text-muted); font-size: var(--ui-font-sm); text-overflow: ellipsis; white-space: nowrap; }
.provider-row-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 14px; }
.provider-status { display: inline-flex; align-items: center; gap: 7px; color: var(--ui-text-muted); font-size: var(--ui-font-sm); white-space: nowrap; }
.provider-status i { width: 8px; height: 8px; border-radius: 50%; background: var(--ui-text-faint); }
.status-success { color: var(--ui-success); }
.status-success i { background: var(--ui-success); }
.status-warning { color: var(--ui-warning); }
.status-warning i { background: var(--ui-warning); }
.status-off i { background: var(--ui-text-faint); }
.row-detail-button { color: var(--ui-text-muted); }
.provider-list-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.add-provider-button { min-height: 40px; }
.local-config-actions { display: flex; align-items: center; gap: 4px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
.add-first-provider-card { display: flex; width: 100%; min-height: 190px; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; border: 1px dashed var(--ui-border); border-radius: var(--ui-radius-lg); background: var(--ui-bg-surface); color: var(--ui-text-main); cursor: pointer; transition: border-color .16s ease, background-color .16s ease, transform .16s ease; }
.add-first-provider-card:hover { border-color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 3%, white); transform: translateY(-1px); }
.add-first-provider-card:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 3px; }
.first-provider-plus { display: grid; width: 48px; height: 48px; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--ui-primary) 9%, white); color: var(--ui-primary); font-size: 32px; font-weight: 300; line-height: 1; }
.add-first-provider-card strong { color: var(--ui-text-main); font-size: var(--ui-font-md); font-weight: 650; }
.empty-enabled-alert { margin-top: -2px; }
.detail-eyebrow { color: var(--ui-primary); font-size: var(--ui-font-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.provider-form :deep(.el-form-item) { min-width: 0; margin-bottom: 12px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.form-grid :deep(.el-form-item) { min-width: 0; }
.model-picker-row { display: flex; align-items: center; gap: 10px; width: 100%; }
.model-picker { flex: 1; min-width: 0; }
.field-note { margin: 6px 0 0; color: var(--ui-text-muted); font-size: var(--ui-font-xs); line-height: var(--ui-line-height); }
.field-note code { padding: 1px 4px; border-radius: 4px; background: var(--ui-bg-subtle); }
.model-error, .detail-hint { margin: -2px 0 12px; }
.detail-footer { display: flex; align-items: center; gap: 10px; padding-top: 4px; }
.footer-spacer { flex: 1; }
.privacy-note :deep(p) { margin: 4px 0 0; line-height: var(--ui-line-height); }
.add-dialog-intro { margin: 0 0 14px; color: var(--ui-text-secondary); font-size: var(--ui-font-sm); }
.provider-catalog { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.catalog-card { display: flex; min-width: 0; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-bg-surface); color: var(--ui-text-main); text-align: left; cursor: pointer; transition: border-color .16s ease, background-color .16s ease; }
.catalog-card:hover { border-color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 4%, white); }
.catalog-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; }
.catalog-copy strong { font-size: var(--ui-font-sm); }
.catalog-copy small { color: var(--ui-text-muted); font-size: var(--ui-font-xs); }
@media (max-width: 700px) {
  .provider-row { align-items: flex-start; flex-wrap: wrap; padding: 13px; }
  .provider-row-main { flex-basis: calc(100% - 2px); }
  .provider-row-actions { width: 100%; justify-content: flex-end; gap: 12px; }
  .provider-status { margin-right: auto; }
  .form-grid, .provider-catalog { grid-template-columns: 1fr; }
  .model-picker-row { align-items: stretch; flex-direction: column; }
  .model-picker-row :deep(.el-button) { width: 100%; }
}
@media (max-width: 480px) {
  .provider-list-actions { align-items: flex-start; flex-direction: column; }
  .local-config-actions { align-self: flex-end; }
}
</style>
