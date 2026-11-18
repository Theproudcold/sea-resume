<template>
  <el-dialog
    :model-value="modelValue"
    title="导入 Markdown 简历"
    width="var(--ui-dialog-width-md)"
    align-center
    destroy-on-close
    :close-on-click-modal="!loading"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ol class="import-steps" aria-label="导入步骤">
      <li :class="{ 'is-current': !result }" :aria-current="!result ? 'step' : undefined"><b>1</b>选择文件</li>
      <li :class="{ 'is-current': !!result }" :aria-current="result ? 'step' : undefined"><b>2</b>确认内容</li>
    </ol>

    <section v-if="!result" class="import-dropzone" :class="{ 'is-dragging': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <el-icon class="import-icon" :size="36"><UploadFilled /></el-icon>
      <h3>选择或拖入 Markdown 文件</h3>
      <p>支持 .md / .markdown，最大 1 MB。仅在本机读取，不上传文件。</p>
      <el-button type="primary" :loading="reading" @click="fileInput?.click()">选择 Markdown 文件</el-button>
      <input ref="fileInput" class="visually-hidden" type="file" aria-label="选择 Markdown 文件" accept=".md,.markdown,text/markdown" @change="handleFileChange" />
    </section>

    <template v-else>
      <div class="import-summary">
        <div class="import-heading">
          <div>
            <h3>{{ result.resume.basic.name || result.sourceTitle }}</h3>
            <p>{{ result.resume.basic.title || '未识别求职意向' }}</p>
          </div>
          <el-tag type="success" effect="plain">将创建新简历</el-tag>
        </div>
        <div class="summary-grid">
          <span>工作 {{ result.resume.experiences.length }} 项</span>
          <span>项目 {{ result.resume.projects.length }} 项</span>
          <span>教育 {{ result.resume.education.length }} 项</span>
          <span>技能 {{ result.resume.skills.reduce((count, skill) => count + skill.items.length, 0) }} 项</span>
        </div>
        <p v-if="result.resume.basic.email || result.resume.basic.phone || result.resume.basic.website" class="contact-preview">
          <span
            v-for="(item, index) in [result.resume.basic.email, result.resume.basic.phone, result.resume.basic.location, result.resume.basic.website].filter(Boolean)"
            :key="index"
          >{{ item }}</span>
        </p>
      </div>

      <el-form label-position="top" class="import-options">
        <el-form-item label="新简历名称" required :error="title.trim() ? '' : '请填写简历名称'">
          <el-input v-model="title" maxlength="80" show-word-limit />
        </el-form-item>
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

      <el-alert v-if="result.warnings.length" type="warning" :closable="false" show-icon title="请检查导入提示">
        <ul class="warning-list">
          <li v-for="(warning, index) in result.warnings" :key="`${warning.code}-${index}`">{{ warning.message }}<span v-if="warning.detail"> {{ warning.detail }}</span></li>
        </ul>
      </el-alert>
      <el-alert v-else type="success" :closable="false" show-icon title="已读取简历内容，导入不会覆盖已有简历。" />

      <details v-if="result.unknownSections.length" class="unknown-details">
        <summary>已保留的自定义章节（{{ result.unknownSections.length }}）</summary>
        <p v-for="section in result.unknownSections" :key="section">{{ section }}</p>
      </details>
      <p class="privacy-note">导入后可继续编辑；未识别的章节已保留。</p>
    </template>

    <el-alert v-if="errorMessage" class="import-error" type="error" :closable="false" show-icon :title="errorMessage" />

    <template #footer>
      <div class="app-dialog-actions markdown-import-actions">
        <el-button v-if="result" :disabled="loading" @click="reset">重选文件</el-button>
        <el-button :disabled="loading" @click="emit('update:modelValue', false)">取消</el-button>
        <el-button v-if="result" type="primary" :disabled="!title.trim()" :loading="loading" @click="confirmImport">创建简历</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { UploadFilled } from '@element-plus/icons-vue';
import type { ResumeData } from '@/types/resume';
import type { MarkdownImportResult } from '@/types/markdown-import';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';

const props = withDefaults(defineProps<{ modelValue: boolean; loading?: boolean }>(), { loading: false });
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [payload: { resume: ResumeData; title: string; templateId: string }];
}>();

const MAX_FILE_SIZE = 1024 * 1024;
const fileInput = ref<HTMLInputElement>();
const result = ref<MarkdownImportResult | null>(null);
const title = ref('');
const templateId = ref('modern');
const errorMessage = ref('');
const isDragging = ref(false);
const reading = ref(false);
let readGeneration = 0;

watch(() => props.modelValue, (visible) => { if (!visible) reset(); });

function reset() {
  readGeneration += 1;
  reading.value = false;
  isDragging.value = false;
  result.value = null;
  title.value = '';
  templateId.value = 'modern';
  errorMessage.value = '';
  if (fileInput.value) fileInput.value.value = '';
}

async function readFile(file?: File) {
  if (reading.value || props.loading) return;
  errorMessage.value = '';
  if (!file) return;
  if (!/\.(md|markdown)$/i.test(file.name)) {
    errorMessage.value = '请选择 .md 或 .markdown 文件。';
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    errorMessage.value = '文件不能超过 1 MB。';
    return;
  }
  if (!file.size) {
    errorMessage.value = 'Markdown 文件为空。';
    return;
  }
  const generation = ++readGeneration;
  reading.value = true;
  try {
    const content = await file.text();
    if (generation !== readGeneration) return;
    const parsed = parseResumeMarkdown(content, file.name);
    result.value = parsed;
    title.value = parsed.sourceTitle;
    templateId.value = parsed.resume.templateId || 'modern';
  } catch (error) {
    if (generation === readGeneration) errorMessage.value = error instanceof Error ? error.message : '读取失败，请重新选择文件。';
  } finally {
    if (generation === readGeneration) reading.value = false;
  }
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  void readFile(file);
}
function handleDrop(event: DragEvent) {
  isDragging.value = false;
  void readFile(event.dataTransfer?.files?.[0]);
}
function confirmImport() {
  if (!result.value || !title.value.trim() || props.loading) return;
  emit('confirm', { resume: result.value.resume, title: title.value.trim(), templateId: templateId.value });
}
</script>

<style scoped>
/* Steps: keys on a sunken tray; the current step is the raised key. */
.import-steps {
  display: flex;
  gap: var(--space-3xs);
  margin: 0 0 var(--space-lg);
  padding: var(--space-3xs);
  border-radius: var(--radius-input);
  background: var(--color-sunken);
  list-style: none;
}

.import-steps li {
  display: flex;
  min-width: 0;
  flex: 1 1 0;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-2xs) var(--space-sm);
  border-radius: var(--radius-s);
  color: var(--color-muted);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 500;
}

.import-steps b {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.import-steps li.is-current {
  background: var(--color-paper-3);
  color: var(--color-ink);
  font-weight: 600;
  box-shadow: var(--shadow-card);
}

.import-steps li.is-current b {
  color: var(--color-accent);
}

.import-dropzone {
  display: flex;
  min-height: 250px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-xl);
  border: var(--rule-hair) dashed var(--color-rule-2);
  border-radius: var(--radius-card);
  background: var(--color-paper-2);
  text-align: center;
  transition: background-color var(--dur-micro) var(--ease-out), border-color var(--dur-micro) var(--ease-out);
}

.import-dropzone.is-dragging {
  border-style: solid;
  border-color: var(--color-accent);
  background: var(--color-accent-wash);
}

.import-icon {
  color: var(--color-accent);
}

.import-dropzone h3 {
  margin: var(--space-2xs) 0 0;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
}

.import-dropzone p,
.privacy-note {
  color: var(--color-muted);
  font-size: var(--text-sm);
}

.import-dropzone p {
  max-width: 46ch;
  margin: 0 0 var(--space-xs);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  clip-path: inset(50%);
}

.import-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-sm);
}

.import-heading h3 {
  margin: 0 0 var(--space-2xs);
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
  letter-spacing: var(--tracking-display);
  line-height: 1.2;
}

.import-heading p {
  margin: 0;
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}

/* Counts: one row of figures between hairlines. */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: var(--space-md) 0 var(--space-xs);
  border-top: var(--rule-hair) solid var(--color-rule);
  border-bottom: var(--rule-hair) solid var(--color-rule);
}

.summary-grid span {
  padding: var(--space-xs) var(--space-sm);
  border-left: var(--rule-hair) solid var(--color-rule);
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.summary-grid span:first-child {
  padding-left: 0;
  border-left: 0;
}

.contact-preview {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs) var(--space-md);
  margin: 0;
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.import-options {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 11rem;
  gap: var(--space-md);
  margin: var(--space-md) 0;
}

.import-options :deep(.el-form-item) {
  margin-bottom: var(--space-xs);
}

.warning-list {
  margin: var(--space-xs) 0 0;
  padding-left: var(--space-lg);
}

.warning-list li {
  margin: var(--space-2xs) 0;
}

.unknown-details {
  margin-top: var(--space-md);
  padding: var(--space-sm) 0;
  border-top: var(--rule-hair) solid var(--color-rule);
  border-bottom: var(--rule-hair) solid var(--color-rule);
}

.unknown-details summary {
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}

.unknown-details p {
  margin: var(--space-xs) 0 0;
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}

.privacy-note {
  margin: var(--space-md) 0 0;
}

.import-error {
  margin-top: var(--space-sm);
}

.markdown-import-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

@media (max-width: 768px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-grid span:nth-child(3) {
    padding-left: 0;
    border-left: 0;
  }

  .import-options {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .import-dropzone { min-height: 200px; padding: var(--space-md); }
  .markdown-import-actions { display: flex; flex-wrap: wrap; }
  .markdown-import-actions :deep(.el-button--primary) { width: 100%; }

  .import-heading {
    flex-direction: column;
  }
}
</style>
