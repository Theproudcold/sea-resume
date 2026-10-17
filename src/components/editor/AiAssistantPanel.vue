<template>
  <el-drawer
    :model-value="visible"
    title="AI 简历助手"
    direction="rtl"
    size="min(560px, calc(100vw - 24px))"
    destroy-on-close
    :before-close="closeDrawer"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="assistant-panel">
      <el-radio-group :model-value="mode" aria-label="AI 工作模式" @update:model-value="changeMode">
        <el-radio-button value="optimize">简历优化</el-radio-button>
        <el-radio-button value="quick">快捷修改</el-radio-button>
        <el-radio-button value="greeting">打招呼语</el-radio-button>
      </el-radio-group>
      <ResumeOptimizationPanel v-if="visible && mode === 'optimize'" ref="optimizationPanel" :resume="resume" @configure="configureModel" @applied="handleOptimized" />
      <GreetingPanel v-if="visible && mode === 'greeting'" :resume="resume" @configure="configureModel" />
      <template v-if="mode === 'quick'">
      <el-alert type="warning" :closable="false" show-icon>
        <template #title>隐私说明</template>
        <p>只有点击生成并确认后，当前简历内容和你的指令才会发送到配置的 AI 服务；出生日期不会随请求发送。API Key 只保存在本次页面会话。</p>
      </el-alert>

      <template v-if="!pendingDraft">
        <div class="current-resume provider-summary">
          <div class="provider-summary__details">
            <span class="eyebrow">当前模型服务</span>
            <strong>{{ providerLabel }}</strong>
            <span>{{ modelSettings?.model || '尚未选择模型' }}</span>
            <span class="provider-key-status" :class="{ 'is-ready': sessionKeyAvailable }">{{ modelSettings?.authMode === 'none' ? '本机服务 · 无需 API Key' : (sessionKeyAvailable ? 'API Key 已配置' : '需要配置 API Key') }}</span>
          </div>
          <el-button text type="primary" @click="emit('configure')">配置模型</el-button>
        </div>
        <el-form label-position="top" class="provider-form">
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
          <el-button :disabled="applying" @click="pendingDraft = null">拒绝修改</el-button>
          <el-button type="primary" :loading="applying" @click="confirmApply">确认并应用</el-button>
        </div>
      </template>

      <el-alert v-if="undoAvailable" class="undo-callout" type="success" :closable="false" title="最近的 AI 修改可撤销。">
        <el-button text type="primary" @click="emit('undo')">撤销上一批 AI 修改</el-button>
      </el-alert>
      <el-alert v-if="errorMessage" class="error-callout" type="error" :closable="false" show-icon :title="errorMessage" />
      </template>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import type { ResumeData } from '@/types/resume';
import type { ResumeAiOperation } from '@/types/ai';
import { createChangeProposal, type ResumeChangeProposal } from '@/services/ai/changeProposal';
import { AI_PROVIDER_PRESETS, isAiProviderReady, toAiProviderConfig, loadAiModelSettings, type AiModelSettings } from '@/services/ai/AiSettings';
import { requestResumeAiDraft } from '@/services/ai/AiProvider';
import ResumeOptimizationPanel from '@/components/ai/ResumeOptimizationPanel.vue';
import GreetingPanel from '@/components/ai/GreetingPanel.vue';

const props = defineProps<{ visible: boolean; resume: ResumeData; undoAvailable: boolean }>();
const emit = defineEmits<{
  'update:visible': [visible: boolean];
  apply: [proposal: ResumeChangeProposal, done: (saved: boolean) => void];
  undo: [];
  configure: [];
  applied: [resumeId: string];
}>();
const modelSettings = ref<AiModelSettings | null>(loadAiModelSettings());
const sessionKeyAvailable = ref(isAiProviderReady(modelSettings.value));
const instruction = ref('');
const consent = ref(false);
const directApply = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const pendingDraft = ref<ResumeChangeProposal | null>(null);
const applying = ref(false);
const mode = ref<'quick' | 'optimize' | 'greeting'>('optimize');
const optimizationPanel = ref<InstanceType<typeof ResumeOptimizationPanel>>();
async function beforeClose(): Promise<boolean> { return !applying.value && (mode.value !== 'optimize' || await optimizationPanel.value?.beforeClose() !== false); }
async function closeDrawer(done: () => void) { if (await beforeClose()) done(); }
async function changeMode(value: string | number | boolean | undefined) { if ((value === 'quick' || value === 'optimize' || value === 'greeting') && await beforeClose()) mode.value = value; }
async function configureModel() { if (await beforeClose()) emit('configure'); }
defineExpose({ beforeClose });
let controller: AbortController | undefined;
let requestGeneration = 0;
function cancelQuickRequest() { requestGeneration++; controller?.abort(); loading.value = false; }
onBeforeUnmount(cancelQuickRequest);
watch(mode, cancelQuickRequest);
function handleOptimized(id: string) { emit('applied', id); emit('update:visible', false); }
const providerLabel = computed(() => modelSettings.value?.profileName || AI_PROVIDER_PRESETS.find((preset) => preset.id === modelSettings.value?.presetId)?.label || '未配置');
const canRequest = computed(() => !!modelSettings.value?.baseUrl.trim() && !!modelSettings.value?.model.trim() && sessionKeyAvailable.value && !!instruction.value.trim() && consent.value && !loading.value);

watch(() => props.visible, (visible) => {
  if (visible) {
    modelSettings.value = loadAiModelSettings();
    sessionKeyAvailable.value = isAiProviderReady(modelSettings.value);
    return;
  }
  cancelQuickRequest();
  instruction.value = '';
  consent.value = false;
  directApply.value = false;
  pendingDraft.value = null;
  errorMessage.value = '';
}, { immediate: true });

async function requestChanges() {
  if (!canRequest.value || !modelSettings.value) return;
  loading.value = true;
  const generation = ++requestGeneration;
  controller = new AbortController();
  errorMessage.value = '';
  try {
    const baseline = JSON.parse(JSON.stringify(props.resume)) as ResumeData;
    const draft = await requestResumeAiDraft(toAiProviderConfig(modelSettings.value), baseline, instruction.value, { signal: controller.signal });
    if (generation !== requestGeneration) return;
    const proposal = await createChangeProposal(baseline, draft);
    if (generation !== requestGeneration) return;
    pendingDraft.value = proposal;
    if (directApply.value && pendingDraft.value) confirmApply();
  } catch (error) {
    if (generation === requestGeneration) errorMessage.value = error instanceof Error ? error.message : 'AI 请求失败。';
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}
function confirmApply() {
  if (!pendingDraft.value || applying.value) return;
  applying.value = true;
  emit('apply', pendingDraft.value, saved => {
    applying.value = false;
    if (saved) pendingDraft.value = null;
  });
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

.provider-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.provider-summary__details {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.provider-summary__details strong { color: var(--ui-text-main); }
.provider-key-status { color: var(--ui-warning); font-size: var(--ui-font-xs); }
.provider-key-status.is-ready { color: var(--ui-success); }

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
