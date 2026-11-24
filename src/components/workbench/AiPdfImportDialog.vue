<template>
  <el-dialog
    :model-value="modelValue"
    title="AI 导入 PDF 简历"
    width="var(--ui-dialog-width-md)"
    align-center
    destroy-on-close
    :close-on-click-modal="!loading"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ol class="import-steps" aria-label="导入步骤">
      <li :class="{ 'is-current': !hasSource }" :aria-current="!hasSource ? 'step' : undefined"><b>1</b>选择 PDF</li>
      <li :class="{ 'is-current': hasSource && !parsed }" :aria-current="hasSource && !parsed ? 'step' : undefined"><b>2</b>发送前确认</li>
      <li :class="{ 'is-current': !!parsed }" :aria-current="parsed ? 'step' : undefined"><b>3</b>确认内容</li>
    </ol>

    <div v-if="!hasSource" class="pdf-dropzone" :class="{ 'is-dragging': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <el-icon class="pdf-dropzone-icon" :size="38"><UploadFilled /></el-icon>
      <h3>{{ mode === 'vision' ? '导入扫描版 PDF' : '选择或拖入 PDF 简历' }}</h3>
      <el-radio-group v-model="mode" class="pdf-mode-group" :disabled="extracting" aria-label="识别方式">
        <el-radio-button value="text">文字版 PDF</el-radio-button>
        <el-radio-button value="vision">扫描版 / 图片</el-radio-button>
      </el-radio-group>
      <p>{{ modeDescription }}</p>
      <el-button type="primary" :loading="extracting" @click="fileInput?.click()">选择 PDF 文件</el-button>
      <input ref="fileInput" class="visually-hidden" type="file" aria-label="选择 PDF 文件" accept="application/pdf,.pdf" @change="handleFileChange" />
    </div>

    <template v-else-if="!parsed">
      <div class="pdf-file-summary">
        <strong>{{ fileName }}</strong>
        <span class="pdf-page-count">{{ pageCount }} 页</span>
        <el-tag :type="mode === 'text' ? 'success' : 'warning'" effect="plain">
          {{ mode === 'text' ? '本地提取完成' : '页面图片已在本机就绪' }}
        </el-tag>
        <el-button text size="small" :disabled="requesting || extracting" @click="toggleMode">
          改用{{ mode === 'text' ? '视觉识别' : '文本提取' }}
        </el-button>
      </div>
      <template v-if="mode === 'text'">
        <details class="text-preview">
          <summary>查看待发送文本（前 4,000 字）</summary>
          <pre>{{ extracted?.text.slice(0, 4000) }}<span v-if="(extracted?.text.length ?? 0) > 4000">…</span></pre>
        </details>
        <el-alert v-if="extracted?.columnPages" class="column-hint" type="info" :closable="false" show-icon
          :title="`检测到 ${extracted.columnPages} 页为分栏排版，已按栏还原阅读顺序；若结果仍错乱，可改用视觉识别。`" />
        <el-alert v-if="extracted?.truncated" class="column-hint" type="warning" :closable="false" show-icon
          title="提取文本超过 60,000 字符，只会发送前 60,000 字符。后文请拆分后单独导入。" />
      </template>
      <template v-else>
        <div class="page-thumbnails" aria-label="待发送的页面图片">
          <img v-for="(image, index) in rendered?.images ?? []" :key="index" :src="image" :alt="`第 ${index + 1} 页`" />
        </div>
        <p v-if="rendered && rendered.renderedPages < rendered.pageCount" class="pdf-model-note">
          视觉识别单次最多 {{ rendered.renderedPages }} 页，本次只发送前 {{ rendered.renderedPages }} 页；其余页请拆分后单独导入。
        </p>
      </template>
      <el-alert type="warning" :closable="false" show-icon>
        <template #title>发送前请确认</template>
        <p v-if="mode === 'text'">确认后，提取的文本和文件名将发送给下方 AI 服务。PDF 原文件和图片不会上传。</p>
        <p v-else>PDF 原文件不上传，但页面图片会随请求发送给下方 AI 服务，包含照片、证件号等全部可见内容。请确认没有不愿分享的信息。</p>
      </el-alert>
      <div class="pdf-provider-card">
        <div class="pdf-provider-summary">
          <span class="pdf-provider-label">{{ isMcpTextMode ? '当前执行通道' : '当前模型服务' }}</span>
          <span class="pdf-provider-name">
            <strong>{{ isMcpTextMode ? '外部 Agent（MCP · 免 API Key）' : providerLabel }}</strong>
            <span>{{ isMcpTextMode ? '委派外部 Agent 解析后创建简历' : (modelSettings?.model || '未配置模型') }}</span>
          </span>
          <span class="pdf-provider-state" :class="{ 'is-ready': isMcpTextMode || isModelReady }">
            {{ isMcpTextMode ? 'MCP 已连接 · 无需 API Key' : (isModelReady ? '模型服务已就绪' : '需要完成模型配置') }}
          </span>
        </div>
        <el-button :disabled="requesting" @click="showModelSettings = !showModelSettings">
          {{ showModelSettings ? '收起配置' : (isMcpTextMode ? '模型设置' : '配置模型') }}
        </el-button>
      </div>
      <AiProviderSettingsPanel v-if="showModelSettings" @saved="handleModelSettingsSaved" />
      <p v-if="mode === 'vision'" class="pdf-model-note">请选用支持图片的模型，例如 GPT-4o 或 Qwen-VL{{ mcpConnected && !isModelReady ? '；若使用外部 Agent 免 API Key，可直接把本地 PDF 交给 Agent 读取并调用 sea_resume_create 导入' : '' }}。</p>
      <el-checkbox v-model="consent" :disabled="requesting" class="consent-check">
        {{ isMcpTextMode ? '我确认将 PDF 提取文本派发给已连接的外部 Agent 用于解析并创建简历。' : (mode === 'text' ? '我确认将 PDF 提取文本发送给上方 AI 服务用于本次解析。' : '我确认将 PDF 页面图片发送给上方 AI 服务用于本次解析。') }}
      </el-checkbox>
      <p v-if="!isMcpTextMode && !isModelReady" class="pdf-model-note" role="status">请先配置 AI 服务，再确认发送。</p>
      <el-button :type="showModelSettings ? 'default' : 'primary'" class="parse-button" :loading="requesting" :disabled="!canRequest" @click="parseWithAi">
        {{ isMcpTextMode ? '派发给外部 Agent 导入（免 Key）' : (mode === 'text' ? '发送文本并解析简历' : '发送页面图片并解析简历') }}
      </el-button>
      <McpTaskStatusCard v-if="activeMcpTask" :task="activeMcpTask" :prompt="mcpPrompt" :initial-copied="mcpCopied" @cancel="cancelMcpTask" />
    </template>

    <template v-else-if="parsed && draftResume">
      <div class="pdf-result-heading">
        <div>
          <h3>{{ draftResume.basic.name || parsed.sourceTitle }}</h3>
          <p>{{ draftResume.basic.title || '未识别求职意向' }}</p>
        </div>
        <div class="pdf-result-meta">
          <span class="pdf-page-count">{{ pageCount }} 页 PDF</span>
          <el-tag type="success" effect="plain">确认后创建新简历</el-tag>
        </div>
      </div>
      <p class="pdf-model-note">识别方式：{{ mode === 'text' ? '文本提取（未上传图片）' : '视觉识别（上传了页面图片）' }}</p>
      <div class="summary-grid">
        <span>工作 {{ draftResume.experiences.length }} 项</span>
        <span>项目 {{ draftResume.projects.length }} 项</span>
        <span>教育 {{ draftResume.education.length }} 项</span>
        <span>技能 {{ draftResume.skills.reduce((count, skill) => count + skill.items.length, 0) }} 项</span>
      </div>
      <p class="contact-preview">
        <span
          v-for="(item, index) in [draftResume.basic.email, draftResume.basic.phone, draftResume.basic.location, draftResume.basic.website].filter(Boolean)"
          :key="index"
        >{{ item }}</span>
        <span v-if="![draftResume.basic.email, draftResume.basic.phone, draftResume.basic.location, draftResume.basic.website].some(Boolean)">未识别联系方式</span>
      </p>
      <p v-if="explanation" class="ai-explanation">{{ explanation }}</p>

      <el-alert v-if="parsed.warnings.length" class="parser-warnings" type="warning" :closable="false" show-icon title="请检查识别提示">
        <ul class="warning-list"><li v-for="(warning, index) in parsed.warnings" :key="`${warning.code}-${index}`">{{ warning.message }}</li></ul>
      </el-alert>
      <el-alert v-else class="parser-warnings" type="success" :closable="false" title="识别完成。请校对以下信息；确认后将创建一份新简历，原简历不会被覆盖。" />

      <details class="resume-review" open>
        <summary>检查与修改识别内容</summary>
        <section class="resume-editor" aria-label="简历内容校对">
          <div class="section-head"><h4>基本信息</h4></div>
          <el-form label-position="top" class="editor-fields basic-fields">
            <el-form-item label="姓名"><el-input v-model="draftResume.basic.name" /></el-form-item>
            <el-form-item label="求职意向"><el-input v-model="draftResume.basic.title" /></el-form-item>
            <el-form-item label="邮箱"><el-input v-model="draftResume.basic.email" /></el-form-item>
            <el-form-item label="电话"><el-input v-model="draftResume.basic.phone" /></el-form-item>
            <el-form-item label="所在地"><el-input v-model="draftResume.basic.location" /></el-form-item>
            <el-form-item label="个人网站"><el-input v-model="draftResume.basic.website" /></el-form-item>
            <el-form-item label="出生日期"><el-input v-model="draftResume.basic.birthDate" placeholder="可选" /></el-form-item>
            <el-form-item label="个人简介" class="wide-field"><el-input type="textarea" :rows="3" :model-value="richTextToEditorText(draftResume.basic.summary)" @update:model-value="draftResume.basic.summary = markdownToSafeHtml($event)" /></el-form-item>
          </el-form>

          <div class="section-head"><h4>工作经历</h4><span class="section-count">{{ draftResume.experiences.length }}</span></div>
          <div v-if="draftResume.experiences.length" class="entry-list">
            <div v-for="(experience, index) in draftResume.experiences" :key="experience.id || index" class="entry-editor">
              <strong>工作 {{ index + 1 }}</strong>
              <el-form label-position="top" class="editor-fields">
                <el-form-item label="公司"><el-input v-model="experience.company" /></el-form-item>
                <el-form-item label="职位"><el-input v-model="experience.position" /></el-form-item>
                <el-form-item label="开始日期"><el-input v-model="experience.startDate" placeholder="YYYY-MM" /></el-form-item>
                <el-form-item label="结束日期"><el-input v-model="experience.endDate" placeholder="YYYY-MM 或 present" /></el-form-item>
                <el-form-item label="工作描述" class="wide-field"><el-input type="textarea" :rows="3" :model-value="richTextToEditorText(experience.description)" @update:model-value="experience.description = markdownToSafeHtml($event)" /></el-form-item>
                <el-form-item label="成果亮点（每行一项）" class="wide-field"><el-input type="textarea" :rows="2" :model-value="(experience.highlights ?? []).join('\n')" @update:model-value="setExperienceHighlights(index, $event)" /></el-form-item>
              </el-form>
            </div>
          </div>
          <p v-else class="empty-section">未识别到工作经历。</p>

          <div class="section-head"><h4>项目经历</h4><span class="section-count">{{ draftResume.projects.length }}</span></div>
          <div v-if="draftResume.projects.length" class="entry-list">
            <div v-for="(project, index) in draftResume.projects" :key="project.id || index" class="entry-editor">
              <strong>项目 {{ index + 1 }}</strong>
              <el-form label-position="top" class="editor-fields">
                <el-form-item label="项目名称"><el-input v-model="project.name" /></el-form-item>
                <el-form-item label="角色"><el-input v-model="project.role" /></el-form-item>
                <el-form-item label="开始日期"><el-input v-model="project.startDate" placeholder="YYYY-MM" /></el-form-item>
                <el-form-item label="结束日期"><el-input v-model="project.endDate" placeholder="YYYY-MM 或 present" /></el-form-item>
                <el-form-item label="项目链接"><el-input v-model="project.link" /></el-form-item>
                <el-form-item label="技术栈（逗号分隔）"><el-input :model-value="(project.techStack ?? []).join(', ')" @update:model-value="setProjectTechStack(index, $event)" /></el-form-item>
                <el-form-item label="项目描述" class="wide-field"><el-input type="textarea" :rows="3" :model-value="richTextToEditorText(project.description)" @update:model-value="project.description = markdownToSafeHtml($event)" /></el-form-item>
              </el-form>
            </div>
          </div>
          <p v-else class="empty-section">未识别到项目经历。</p>

          <div class="section-head"><h4>教育背景</h4><span class="section-count">{{ draftResume.education.length }}</span></div>
          <div v-if="draftResume.education.length" class="entry-list">
            <div v-for="(education, index) in draftResume.education" :key="education.id || index" class="entry-editor">
              <strong>教育 {{ index + 1 }}</strong>
              <el-form label-position="top" class="editor-fields">
                <el-form-item label="学校"><el-input v-model="education.school" /></el-form-item>
                <el-form-item label="学历"><el-input v-model="education.degree" /></el-form-item>
                <el-form-item label="专业"><el-input v-model="education.major" /></el-form-item>
                <el-form-item label="开始日期"><el-input v-model="education.startDate" placeholder="YYYY-MM" /></el-form-item>
                <el-form-item label="结束日期"><el-input v-model="education.endDate" placeholder="YYYY-MM" /></el-form-item>
                <el-form-item label="GPA"><el-input v-model="education.gpa" /></el-form-item>
              </el-form>
            </div>
          </div>
          <p v-else class="empty-section">未识别到教育背景。</p>

          <div class="section-head"><h4>技能</h4><span class="section-count">{{ draftResume.skills.length }}</span></div>
          <div v-if="draftResume.skills.length" class="entry-list">
            <div v-for="(skill, index) in draftResume.skills" :key="skill.id || index" class="entry-editor">
              <strong>技能组 {{ index + 1 }}</strong>
              <el-form label-position="top" class="editor-fields">
                <el-form-item label="分类"><el-input v-model="skill.category" /></el-form-item>
                <el-form-item label="技能项（逗号分隔）"><el-input :model-value="skill.items.join(', ')" @update:model-value="setSkillItems(index, $event)" /></el-form-item>
              </el-form>
            </div>
          </div>
          <p v-else class="empty-section">未识别到技能。</p>
        </section>
      </details>

      <el-form label-position="top" class="result-options">
        <el-form-item label="新简历名称" required :error="title.trim() ? '' : '请填写简历名称'"><el-input v-model="title" maxlength="80" show-word-limit /></el-form-item>
        <el-form-item label="模板">
          <el-select v-model="templateId" class="w-full">
            <el-option label="现代简约" value="modern" />
            <el-option label="商务专业" value="professional" />
            <el-option label="创意设计" value="creative" />
            <el-option label="极简主义" value="minimal" />
            <el-option label="科技感" value="tech" />
            <el-option label="AI Agent 技术" value="ai-agent" />
          </el-select>
        </el-form-item>
      </el-form>
    </template>

    <el-alert v-if="errorMessage" class="error-alert" type="error" :closable="false" show-icon :title="errorMessage">
      <el-button v-if="mode === 'text' && selectedFile && !hasSource" size="small" :loading="extracting" @click="toggleMode">改用视觉识别</el-button>
    </el-alert>
    <template #footer>
      <div class="app-dialog-actions">
        <el-button v-if="hasSource" :disabled="requesting || extracting || loading" @click="reset">重选 PDF</el-button>
        <el-button :disabled="loading" @click="emit('update:modelValue', false)">取消</el-button>
        <el-button v-if="parsed" type="primary" :loading="loading" :disabled="!title.trim()" @click="confirmImport">创建简历</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { UploadFilled } from '@element-plus/icons-vue';
import type { ResumeData } from '@/types/resume';
import type { MarkdownImportResult } from '@/types/markdown-import';
import { AI_PROVIDER_PRESETS, isAiProviderReady, toAiProviderConfig, loadAiModelSettings, type AiModelSettings } from '@/services/ai/AiSettings';
import AiProviderSettingsPanel from '@/components/workbench/AiProviderSettingsPanel.vue';
import McpTaskStatusCard from '@/components/ai/McpTaskStatusCard.vue';
import { useMcpState } from '@/services/ai/useMcpBridge';
import { resolveAiDriver, useAiDriverPreference } from '@/services/ai/useAiExecutionMode';
import { cancelExternalTask, copyExternalTaskPrompt, enqueueExternalTask, useExternalTasks } from '@/services/ai/externalTaskQueue';
import { extractPdfText, renderPdfPagesToImages, requestAiPdfMarkdown, requestAiPdfMarkdownFromImages, buildVisionTruncationWarning, buildTextTruncationWarning, MAX_VISION_PAGES, type ExtractedPdfText, type PdfImportMode, type RenderedPdfPages } from '@/services/ai/pdfResumeImport';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { markdownToSafeHtml } from '@/utils/markdown/markdownSafety';
import { describeError } from '@/utils/globalErrorReporting';

const props = withDefaults(defineProps<{ modelValue: boolean; loading?: boolean }>(), { loading: false });
const emit = defineEmits<{
  'update:modelValue': [visible: boolean];
  confirm: [payload: { resume: ResumeData; title: string; templateId: string }];
}>();

const modelSettings = ref<AiModelSettings | null>(loadAiModelSettings());
const sessionKeyAvailable = ref(isAiProviderReady(modelSettings.value));
const showModelSettings = ref(false);
const fileName = ref('');
const fileInput = ref<HTMLInputElement>();
const mode = ref<PdfImportMode>('text');
const selectedFile = ref<File | null>(null);
const extracted = ref<ExtractedPdfText | null>(null);
const rendered = ref<RenderedPdfPages | null>(null);
const parsed = ref<MarkdownImportResult | null>(null);
const draftResume = ref<ResumeData | null>(null);
const title = ref('');
const templateId = ref('modern');
const explanation = ref('');
const consent = ref(false);
const extracting = ref(false);
const requesting = ref(false);
const isDragging = ref(false);
const errorMessage = ref('');
let sourceGeneration = 0;
let requestGeneration = 0;
const { linkState: mcpLinkState } = useMcpState();
const { driverPreference } = useAiDriverPreference();
const { findTask } = useExternalTasks();
const mcpTaskId = ref('');
const mcpPrompt = ref('');
const mcpCopied = ref(false);
const activeMcpTask = computed(() => findTask(mcpTaskId.value));
const mcpConnected = computed(() => mcpLinkState.value === 'connected');
const isModelReady = computed(() => sessionKeyAvailable.value);
const isMcpTextMode = computed(() => mode.value === 'text' && resolveAiDriver(mcpConnected.value, isModelReady.value, driverPreference.value) === 'mcp');
function cancelMcpTask() { if (mcpTaskId.value) cancelExternalTask(mcpTaskId.value); }
const hasSource = computed(() => extracted.value !== null || rendered.value !== null);
const pageCount = computed(() => extracted.value?.pageCount ?? rendered.value?.pageCount ?? 0);
const canRequest = computed(() => (isMcpTextMode.value || isModelReady.value) && consent.value && !requesting.value && !extracting.value
  && (mode.value === 'text' ? !!extracted.value : !!rendered.value?.images.length));
const modeDescription = computed(() => mode.value === 'text'
  ? '适合能复制文字的 PDF，最大 15 MB、30 页。发送给 AI 前会请你确认。'
  : `适合扫描件或图片排版。最大 15 MB、30 页；每次识别前 ${MAX_VISION_PAGES} 页，需支持图片的 AI 模型。`);
const providerLabel = computed(() => modelSettings.value?.profileName || AI_PROVIDER_PRESETS.find((preset) => preset.id === modelSettings.value?.presetId)?.label || '未配置');

function refreshAiConfiguration() {
  consent.value = false;
  modelSettings.value = loadAiModelSettings();
  sessionKeyAvailable.value = isAiProviderReady(modelSettings.value);
}

function handleModelSettingsSaved() {
  refreshAiConfiguration();
  if (isModelReady.value) showModelSettings.value = false;
}

onMounted(refreshAiConfiguration);
watch(() => props.modelValue, (visible) => {
  if (visible) refreshAiConfiguration();
  else reset();
});

function reset() {
  sourceGeneration += 1;
  requestGeneration += 1;
  extracting.value = false;
  requesting.value = false;
  isDragging.value = false;
  templateId.value = 'modern';
  extracted.value = null;
  rendered.value = null;
  selectedFile.value = null;
  parsed.value = null;
  draftResume.value = null;
  fileName.value = '';
  title.value = '';
  consent.value = false;
  explanation.value = '';
  errorMessage.value = '';
  showModelSettings.value = false;
  mcpTaskId.value = '';
  mcpPrompt.value = '';
  mcpCopied.value = false;
  if (fileInput.value) fileInput.value.value = '';
}

/** 按当前识别方式在本地准备输入：文本提取或页面图片渲染。 */
async function loadSource() {
  const file = selectedFile.value;
  if (!file) return;
  const generation = ++sourceGeneration;
  extracting.value = true;
  errorMessage.value = '';
  try {
    if (mode.value === 'text') {
      const result = await extractPdfText(file);
      if (generation !== sourceGeneration) return;
      extracted.value = result;
      rendered.value = null;
    } else {
      const result = await renderPdfPagesToImages(file);
      if (generation !== sourceGeneration) return;
      rendered.value = result;
      extracted.value = null;
    }
    fileName.value = file.name;
    parsed.value = null;
    draftResume.value = null;
    consent.value = false;
    refreshAiConfiguration();
    showModelSettings.value = !isModelReady.value && !isMcpTextMode.value;
  } catch (error) {
    if (generation !== sourceGeneration) return;
    extracted.value = null;
    rendered.value = null;
    errorMessage.value = describeError(error);
  } finally {
    if (generation === sourceGeneration) extracting.value = false;
  }
}

async function toggleMode() {
  if (extracting.value || requesting.value || props.loading) return;
  const previous = mode.value;
  mode.value = previous === 'text' ? 'vision' : 'text';
  await loadSource();
  if (errorMessage.value) mode.value = previous;
}

async function readFile(file?: File) {
  if (extracting.value || requesting.value || props.loading) return;
  errorMessage.value = '';
  if (!file) return;
  selectedFile.value = file;
  await loadSource();
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  void readFile(file);
}

function handleDrop(event: DragEvent) {
  isDragging.value = false;
  void readFile(event.dataTransfer?.files?.[0]);
}

async function parseWithAi() {
  if (!canRequest.value) return;
  if (isMcpTextMode.value) {
    errorMessage.value = '';
    try {
      const { task, prompt } = enqueueExternalTask({
        kind: 'pdf_import',
        summary: `解析 PDF 简历：${fileName.value || '未命名.pdf'}`,
        payload: {
          fileName: fileName.value,
          pageCount: pageCount.value,
          text: extracted.value?.text ?? '',
          preferredTools: ['sea_resume_create', 'sea_resume_open', 'sea_task_complete'],
        },
      });
      mcpTaskId.value = task.id;
      mcpPrompt.value = prompt;
      mcpCopied.value = await copyExternalTaskPrompt(prompt);
    } catch (error) {
      errorMessage.value = describeError(error);
    }
    return;
  }
  if (!modelSettings.value) return;
  const generation = ++requestGeneration;
  requesting.value = true;
  errorMessage.value = '';
  try {
    const config = toAiProviderConfig(modelSettings.value);
    const result = mode.value === 'text'
      ? await requestAiPdfMarkdown(config, fileName.value, extracted.value?.text ?? '')
      : await requestAiPdfMarkdownFromImages(config, fileName.value, rendered.value?.images ?? []);
    if (generation !== requestGeneration) return;
    const imported = parseResumeMarkdown(result.markdown, fileName.value.replace(/\.pdf$/i, '.md'));
    if (mode.value === 'vision' && rendered.value) {
      const truncation = buildVisionTruncationWarning(rendered.value.pageCount, rendered.value.renderedPages);
      if (truncation) imported.warnings.push(truncation);
    }
    if (mode.value === 'text') {
      const truncation = buildTextTruncationWarning(extracted.value?.truncated);
      if (truncation) imported.warnings.push(truncation);
    }
    parsed.value = imported;
    draftResume.value = structuredClone(imported.resume);
    explanation.value = result.explanation;
    title.value = imported.sourceTitle;
    templateId.value = imported.resume.templateId || 'modern';
  } catch (error) {
    if (generation === requestGeneration) errorMessage.value = describeError(error);
  } finally {
    if (generation === requestGeneration) requesting.value = false;
  }
}

function richTextToEditorText(value?: string): string {
  if (!value) return '';
  const htmlWithBreaks = value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|li|blockquote|ul|ol)>/gi, '\n');
  if (typeof DOMParser === 'undefined') return htmlWithBreaks.replace(/<[^>]*>/g, '').trim();
  return new DOMParser().parseFromString(htmlWithBreaks, 'text/html').body.textContent?.trim() ?? '';
}

function setExperienceHighlights(index: number, value: string) {
  const experience = draftResume.value?.experiences[index];
  if (experience) experience.highlights = value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function setProjectTechStack(index: number, value: string) {
  const project = draftResume.value?.projects[index];
  if (project) project.techStack = value.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean);
}

function setSkillItems(index: number, value: string) {
  const skill = draftResume.value?.skills[index];
  if (skill) skill.items = value.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean);
}

function confirmImport() {
  if (!draftResume.value || !title.value.trim() || props.loading) return;
  emit('confirm', { resume: draftResume.value, title: title.value.trim(), templateId: templateId.value });
}
</script>

<style scoped>
/* Steps: keys on a sunken tray; the current step is the raised key. */
.import-steps { display: flex; gap: var(--space-3xs); margin: 0 0 var(--space-lg); padding: var(--space-3xs); border-radius: var(--radius-input); background: var(--color-sunken); list-style: none; }
.import-steps li { display: flex; min-width: 0; flex: 1 1 0; align-items: center; gap: var(--space-xs); padding: var(--space-2xs) var(--space-sm); border-radius: var(--radius-s); color: var(--color-muted); font-family: var(--font-display); font-size: var(--text-sm); font-weight: 500; }
.import-steps b { font-weight: 600; font-variant-numeric: tabular-nums; }
.import-steps li.is-current { background: var(--color-paper-3); color: var(--color-ink); font-weight: 600; box-shadow: var(--shadow-card); }
.import-steps li.is-current b { color: var(--color-accent); }

.pdf-dropzone { display: flex; min-height: 230px; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-xs); padding: var(--space-lg); border: var(--rule-hair) dashed var(--color-rule-2); border-radius: var(--radius-card); background: var(--color-paper-2); text-align: center; transition: background-color var(--dur-micro) var(--ease-out), border-color var(--dur-micro) var(--ease-out); }
.pdf-dropzone.is-dragging { border-style: solid; border-color: var(--color-accent); background: var(--color-accent-wash); }
.pdf-dropzone-icon { color: var(--color-accent); }
.pdf-dropzone h3 { margin: var(--space-2xs) 0; color: var(--color-ink); font-family: var(--font-display); font-size: var(--text-lg); font-weight: 600; }
.pdf-dropzone p { max-width: 46ch; margin: 0 0 var(--space-xs); color: var(--color-muted); font-family: var(--font-body); font-size: var(--text-md); line-height: var(--ui-line-height); }
.pdf-mode-group { margin: var(--space-2xs) 0; }
.column-hint { margin-bottom: var(--space-sm); }
.page-thumbnails { display: flex; gap: var(--space-2xs); margin: var(--space-sm) 0; padding-bottom: var(--space-2xs); overflow-x: auto; }
.page-thumbnails img { flex: 0 0 auto; width: 96px; border: var(--rule-hair) solid var(--color-rule-2); border-radius: var(--radius-s); background: var(--color-paper); }
.visually-hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

.pdf-file-summary { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-xs) var(--space-sm); margin-bottom: var(--space-sm); padding-bottom: var(--space-sm); border-bottom: var(--rule-hair) solid var(--color-rule); }
.pdf-file-summary strong { min-width: 0; color: var(--color-ink); font-family: var(--font-outlier); font-size: var(--text-sm); font-weight: 500; overflow-wrap: anywhere; }
.pdf-page-count { color: var(--color-muted); font-family: var(--font-display); font-size: var(--text-sm); font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }

.text-preview { margin: var(--space-sm) 0 var(--space-md); padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-input); background: var(--color-paper-2); }
.text-preview summary { color: var(--color-ink); font-family: var(--font-display); font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
.text-preview pre { max-height: 220px; margin: var(--space-xs) 0 0; overflow: auto; color: var(--color-ink-2); font-family: var(--font-outlier); font-size: var(--text-xs); line-height: var(--ui-line-height); white-space: pre-wrap; overflow-wrap: anywhere; }

/* The current service as a row between hairlines, its state under the name. */
.pdf-provider-card { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); margin-top: var(--space-md); padding: var(--space-sm) 0; border-top: var(--rule-hair) solid var(--color-rule); border-bottom: var(--rule-hair) solid var(--color-rule); }
.pdf-provider-summary { display: flex; min-width: 0; flex-direction: column; gap: var(--space-2xs); }
.pdf-provider-label { color: var(--color-muted); font-family: var(--font-display); font-size: var(--text-xs); font-weight: 500; }
.pdf-provider-name { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2xs) var(--space-sm); min-width: 0; overflow-wrap: anywhere; }
.pdf-provider-name strong { color: var(--color-ink); font-family: var(--font-display); font-size: var(--text-sm); font-weight: 600; }
.pdf-provider-name span { color: var(--color-ink-2); font-family: var(--font-outlier); font-size: var(--text-xs); }
.pdf-provider-state { color: var(--color-warning); font-size: var(--text-xs); font-weight: 500; }
.pdf-provider-state.is-ready { color: var(--color-success); }
.pdf-model-note { margin: var(--space-xs) 0 var(--space-md); color: var(--color-muted); font-size: var(--text-xs); line-height: var(--ui-line-height); }
.consent-check { height: auto; margin: var(--space-sm) 0; white-space: normal; }
.consent-check :deep(.el-checkbox__label) { white-space: normal; line-height: 1.6; }
.resume-review { border-block: 1px solid var(--color-rule); }
.resume-review > summary { padding: var(--space-sm) 0; cursor: pointer; font-weight: 600; }
.parse-button { width: 100%; }

.pdf-result-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-sm); }
.pdf-result-heading h3 { margin: 0 0 var(--space-2xs); color: var(--color-ink); font-family: var(--font-display); font-size: var(--text-xl); font-weight: 600; letter-spacing: var(--tracking-display); line-height: 1.2; }
.pdf-result-heading p { margin: 0; }
.pdf-result-meta { display: flex; flex: 0 0 auto; align-items: center; gap: var(--space-sm); }
.pdf-result-heading p, .contact-preview, .ai-explanation { color: var(--color-ink-2); font-size: var(--text-sm); overflow-wrap: anywhere; }

/* Counts: one row of figures between hairlines. */
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: var(--space-md) 0; border-top: var(--rule-hair) solid var(--color-rule); border-bottom: var(--rule-hair) solid var(--color-rule); }
.summary-grid span { padding: var(--space-xs) var(--space-sm); border-left: var(--rule-hair) solid var(--color-rule); color: var(--color-ink); font-family: var(--font-display); font-size: var(--text-sm); font-weight: 500; font-variant-numeric: tabular-nums; }
.summary-grid span:first-child { padding-left: 0; border-left: 0; }
.contact-preview { display: flex; flex-wrap: wrap; gap: var(--space-2xs) var(--space-md); margin: 0 0 var(--space-sm); }
.ai-explanation { margin: 0 0 var(--space-sm); }
.warning-list { margin: var(--space-xs) 0 0; padding-left: var(--space-md); }
.warning-list li { margin: var(--space-2xs) 0; }
.error-alert { margin-top: var(--space-sm); }
.parser-warnings { margin-bottom: var(--space-md); }

/* Proofreading: each section under a hairline head, entries split by hairlines. */
.resume-editor { max-height: 55vh; overflow-y: auto; padding: 0 var(--space-2xs) var(--space-2xs) 0; }
.section-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-xs); margin: var(--space-lg) 0 var(--space-sm); padding-bottom: var(--space-xs); border-bottom: var(--rule-hair) solid var(--color-rule-2); }
.section-head:first-child { margin-top: var(--space-xs); }
.section-head h4 { margin: 0; color: var(--color-ink); font-family: var(--font-display); font-size: var(--text-md); font-weight: 600; }
.section-count { color: var(--color-muted); font-family: var(--font-display); font-size: var(--text-sm); font-weight: 500; font-variant-numeric: tabular-nums; }
.editor-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--space-sm); }
.editor-fields :deep(.el-form-item) { min-width: 0; margin-bottom: var(--space-xs); }
.wide-field { grid-column: 1 / -1; }
.entry-list { display: grid; }
.entry-editor { padding: var(--space-sm) 0; border-bottom: var(--rule-hair) solid var(--color-rule); }
.entry-editor:last-child { border-bottom: 0; }
.entry-editor > strong { display: block; margin-bottom: var(--space-xs); color: var(--color-ink); font-family: var(--font-display); font-size: var(--text-sm); font-weight: 600; }
.empty-section { margin: 0 0 var(--space-sm); color: var(--color-muted); font-size: var(--text-sm); }
.result-options { margin-top: var(--space-md); }
.result-options :deep(.el-form-item) { margin-bottom: var(--space-sm); }
.app-dialog-actions :deep(.el-button + .el-button) { margin-left: 0; }

@media (max-width: 560px) {
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .summary-grid span:nth-child(3) { padding-left: 0; border-left: 0; }
  .editor-fields { grid-template-columns: minmax(0, 1fr); }
  .wide-field { grid-column: auto; }
  .pdf-result-heading { flex-direction: column; }
  .import-steps li { gap: var(--space-2xs); padding-inline: var(--space-xs); font-size: var(--text-xs); }
  .app-dialog-actions { display: flex; flex-wrap: wrap; }
  .app-dialog-actions :deep(.el-button--primary) { width: 100%; }
}
</style>
