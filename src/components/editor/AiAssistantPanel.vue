<template>
  <el-drawer
    :model-value="visible"
    title="AI 简历助手"
    direction="rtl"
    size="min(560px, calc(100vw - 24px))"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="assistant-panel">
      <el-alert type="warning" :closable="false" show-icon>
        <template #title>隐私说明</template>
        <p>AI 服务由你配置。只有点击生成后，本简历的数据和你的指令才会发送到下方服务地址；出生日期不会随请求发送。API Key 仅保存在当前页面内存中，不会写入浏览器存储。</p>
      </el-alert>

      <template v-if="!pendingDraft">
        <el-form label-position="top" class="provider-form">
          <el-form-item label="服务商预设">
            <el-select v-model="presetId" class="w-full" @change="applyProviderPreset">
              <el-option v-for="preset in AI_PROVIDER_PRESETS" :key="preset.id" :label="preset.label" :value="preset.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="OpenAI-compatible 服务地址">
            <el-input v-model="baseUrl" @input="presetId = 'custom'" placeholder="https://api.openai.com/v1" />
          </el-form-item>
          <el-form-item label="模型名称">
            <el-input v-model="model" placeholder="gpt-4o-mini" />
          </el-form-item>
          <el-form-item label="配置记忆">
            <div class="settings-actions">
              <el-button size="small" @click="rememberProviderSettings">记住服务地址和模型</el-button>
              <el-button size="small" text @click="forgetProviderSettings">清除已记住配置</el-button>
            </div>
            <p class="settings-note">只保存预设、服务地址和模型名称；API Key 不会保存。</p>
          </el-form-item>
          <el-form-item label="API Key（仅当前会话）">
            <el-input v-model="apiKey" type="password" show-password autocomplete="off" placeholder="输入服务商 API Key" />
          </el-form-item>
          <el-form-item label="希望 AI 如何修改？">
            <el-input v-model="instruction" type="textarea" :rows="4" maxlength="1000" show-word-limit placeholder="例如：把个人简介调整得更精炼，保留原有事实；不要编造数据。" />
          </el-form-item>
        </el-form>

        <el-checkbox v-model="consent" class="consent-check">
          我确认将当前简历内容发送给所配置的 AI 服务以完成本次请求。
        </el-checkbox>
        <el-checkbox v-model="directApply" class="direct-check">
          跳过逐项审核，直接应用本次修改（仍可撤销）
        </el-checkbox>
        <div class="current-resume">当前目标：<strong>{{ resume.basic.name || resume.title }}</strong></div>
        <el-button type="primary" :loading="loading" :disabled="!canRequest" class="request-button" @click="requestChanges">
          生成修改建议
        </el-button>
      </template>

      <template v-else>
        <div class="draft-heading">
          <div><span class="eyebrow">待确认修改</span><p>{{ pendingDraft.explanation }}</p></div>
          <el-tag type="warning" effect="plain">{{ pendingDraft.operations.length }} 项</el-tag>
        </div>
        <ol class="change-list">
          <li v-for="(operation, index) in pendingDraft.operations" :key="index">
            <strong>{{ describeOperation(operation) }}</strong>
            <div class="diff-row"><span class="before">{{ displayCurrent(operation) }}</span><span class="arrow">→</span><span class="after">{{ displayProposed(operation) }}</span></div>
          </li>
        </ol>
        <el-alert type="info" :closable="false" title="AI 不能删除简历条目、执行脚本或写入其他简历。拒绝或关闭不会更改数据。" />
        <div class="app-dialog-actions draft-actions">
          <el-button @click="pendingDraft = null">拒绝修改</el-button>
          <el-button type="primary" @click="confirmApply">确认并应用</el-button>
        </div>
      </template>

      <el-alert v-if="undoAvailable" class="undo-callout" type="success" :closable="false" title="最近的 AI 修改可撤销。">
        <el-button text type="primary" @click="emit('undo')">撤销上一批 AI 修改</el-button>
      </el-alert>
      <el-alert v-if="errorMessage" class="error-callout" type="error" :closable="false" show-icon :title="errorMessage" />
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { ResumeData } from '@/types/resume';
import type { ResumeAiDraft, ResumeAiOperation } from '@/types/ai';
import { AI_PROVIDER_PRESETS, clearAiModelSettings, loadAiModelSettings, saveAiModelSettings, type AiModelSettings, type AiProviderPresetId } from '@/services/ai/AiSettings';
import { requestResumeAiDraft } from '@/services/ai/AiProvider';

const props = defineProps<{ visible: boolean; resume: ResumeData; undoAvailable: boolean }>();
const emit = defineEmits<{
  'update:visible': [visible: boolean];
  apply: [operations: ResumeAiOperation[]];
  undo: [];
}>();
const defaultPreset = AI_PROVIDER_PRESETS.find((preset) => preset.id === 'openai')!;
const presetId = ref<AiProviderPresetId>(defaultPreset.id);
const baseUrl = ref(defaultPreset.baseUrl);
const apiKey = ref('');
const model = ref(defaultPreset.model);
const instruction = ref('');
const consent = ref(false);
const directApply = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const pendingDraft = ref<ResumeAiDraft | null>(null);
const canRequest = computed(() => !!baseUrl.value.trim() && !!apiKey.value.trim() && !!model.value.trim() && !!instruction.value.trim() && consent.value && !loading.value);

onMounted(() => {
  const settings = loadAiModelSettings();
  if (!settings) return;
  presetId.value = settings.presetId;
  baseUrl.value = settings.baseUrl;
  model.value = settings.model;
});

function applyProviderPreset(id: AiProviderPresetId) {
  presetId.value = id;
  if (id === 'custom') {
    baseUrl.value = '';
    model.value = '';
    return;
  }
  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === id);
  if (preset) {
    baseUrl.value = preset.baseUrl;
    model.value = preset.model;
  }
}

function rememberProviderSettings() {
  try {
    const settings: AiModelSettings = { presetId: presetId.value, baseUrl: baseUrl.value.trim(), model: model.value.trim() };
    saveAiModelSettings(settings);
    ElMessage.success('已记住服务地址和模型（不含 API Key）');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存 AI 配置失败。');
  }
}

function forgetProviderSettings() {
  clearAiModelSettings();
  applyProviderPreset('openai');
  ElMessage.success('已清除本地记忆的 AI 配置');
}


watch(() => props.visible, (visible) => {
  if (!visible) {
    apiKey.value = '';
    instruction.value = '';
    consent.value = false;
    directApply.value = false;
    pendingDraft.value = null;
    errorMessage.value = '';
  }
});
onUnmounted(() => { apiKey.value = ''; });

async function requestChanges() {
  if (!canRequest.value) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    pendingDraft.value = await requestResumeAiDraft({ baseUrl: baseUrl.value, apiKey: apiKey.value, model: model.value }, props.resume, instruction.value);
    if (directApply.value && pendingDraft.value) confirmApply();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'AI 请求失败。';
  } finally {
    loading.value = false;
  }
}

function confirmApply() {
  if (!pendingDraft.value) return;
  emit('apply', pendingDraft.value.operations);
  pendingDraft.value = null;
}

function findItem(operation: ResumeAiOperation): Record<string, unknown> | undefined {
  if (operation.type === 'update_experience') return props.resume.experiences.find((item) => item.id === operation.id) as unknown as Record<string, unknown> | undefined;
  if (operation.type === 'update_project') return props.resume.projects.find((item) => item.id === operation.id) as unknown as Record<string, unknown> | undefined;
  if (operation.type === 'update_education') return props.resume.education.find((item) => item.id === operation.id) as unknown as Record<string, unknown> | undefined;
  if (operation.type === 'update_skill') return props.resume.skills.find((item) => item.id === operation.id) as unknown as Record<string, unknown> | undefined;
  if (operation.type === 'update_custom_block') return props.resume.customBlocks.find((item) => item.id === operation.id) as unknown as Record<string, unknown> | undefined;
  return undefined;
}
function display(value: unknown): string {
  if (Array.isArray(value)) return value.join('、') || '（空）';
  if (value === undefined || value === null || value === '') return '（空）';
  return String(value).replace(/<[^>]*>/g, '').slice(0, 500);
}
function displayCurrent(operation: ResumeAiOperation): string {
  if (operation.type === 'set_basic') return display(props.resume.basic[operation.field]);
  if (operation.type === 'set_template') return props.resume.templateId;
  if (operation.type === 'reorder_sections') return props.resume.sectionOrder.join(' → ');
  return display(findItem(operation)?.[operation.field]);
}
function displayProposed(operation: ResumeAiOperation): string {
  if (operation.type === 'set_template') return operation.templateId;
  if (operation.type === 'reorder_sections') return operation.sectionOrder.join(' → ');
  return display(operation.type === 'set_basic' ? operation.value : operation.value);
}
function describeOperation(operation: ResumeAiOperation): string {
  const labels: Record<string, string> = { name: '姓名', title: '求职意向', email: '邮箱', phone: '电话', location: '所在地', website: '个人链接', summary: '个人简介', company: '公司', position: '职位', description: '描述', highlights: '工作亮点', school: '学校', degree: '学历', major: '专业', gpa: 'GPA', role: '角色', link: '项目链接', techStack: '技术栈', category: '技能分类', items: '技能条目', content: '模块内容' };
  if (operation.type === 'set_template') return '切换模板';
  if (operation.type === 'reorder_sections') return '调整章节顺序';
  return `修改${operation.type === 'set_basic' ? '基础信息' : '简历条目'} · ${labels[operation.field] || operation.field}`;
}
</script>

<style scoped>
.assistant-panel { display: flex; flex-direction: column; gap: 16px; }
.assistant-panel {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.assistant-panel :deep(.el-alert p) {
  margin: var(--ui-space-1) 0 0;
  line-height: var(--ui-line-height);
}

.provider-form :deep(.el-form-item) {
  margin-bottom: var(--ui-space-3);
}

.consent-check,
.direct-check {
  align-items: flex-start;
  white-space: normal;
  line-height: var(--ui-line-height);
}

.current-resume {
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg-subtle);
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-sm);
  overflow-wrap: anywhere;
}

.request-button {
  width: 100%;
}

.draft-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--ui-space-3);
}

.draft-heading p {
  margin: var(--ui-space-2) 0 0;
  line-height: var(--ui-line-height);
}

.eyebrow {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.change-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  margin: 0;
  padding-left: var(--ui-space-6);
}

.change-list li {
  min-width: 0;
  padding-left: var(--ui-space-1);
}

.diff-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-1);
  font-size: var(--ui-font-sm);
  overflow-wrap: anywhere;
}

.before,
.after {
  min-width: 0;
}

.before {
  color: var(--ui-danger);
  text-decoration: line-through;
}

.after {
  color: var(--ui-success);
}

.arrow {
  color: var(--ui-text-muted);
}

.draft-actions {
  gap: var(--ui-space-2);
}

.undo-callout,
.error-callout {
  margin-top: var(--ui-space-1);
}

@media (max-width: 768px) {
  .diff-row {
    grid-template-columns: 1fr;
  }

  .arrow {
    transform: rotate(90deg);
    justify-self: start;
  }
}
</style>
