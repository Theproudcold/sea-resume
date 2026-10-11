<template>
  <el-dialog
    :model-value="modelValue"
    title="导入 Markdown 简历"
    width="var(--ui-dialog-width-md)"
    align-center
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <section v-if="!result" class="import-dropzone" :class="{ 'is-dragging': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <el-icon class="import-icon" :size="36"><UploadFilled /></el-icon>
      <h3>拖放 Markdown 文件到这里</h3>
      <p>支持 .md / .markdown，文件大小不超过 1 MB。原文件不会被修改。</p>
      <el-button type="primary" @click="fileInput?.click()">选择 Markdown 文件</el-button>
      <input ref="fileInput" class="visually-hidden" type="file" accept=".md,.markdown,text/markdown" @change="handleFileChange" />
    </section>

    <template v-else>
      <div class="import-summary">
        <div class="import-heading">
          <div>
            <span class="eyebrow">解析预览</span>
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
          {{ [result.resume.basic.email, result.resume.basic.phone, result.resume.basic.location, result.resume.basic.website].filter(Boolean).join(' · ') }}
        </p>
      </div>

      <el-form label-position="top" class="import-options">
        <el-form-item label="新简历名称">
          <el-input v-model="title" maxlength="80" show-word-limit />
        </el-form-item>
        <el-form-item label="模板">
          <el-select v-model="templateId" class="w-full">
            <el-option label="现代简约" value="modern" />
            <el-option label="商务专业" value="professional" />
            <el-option label="创意设计" value="creative" />
            <el-option label="极简主义" value="minimal" />
            <el-option label="科技感" value="tech" />
          </el-select>
        </el-form-item>
      </el-form>

      <el-alert v-if="result.warnings.length" type="warning" :closable="false" show-icon title="请检查导入提示">
        <ul class="warning-list">
          <li v-for="(warning, index) in result.warnings" :key="`${warning.code}-${index}`">{{ warning.message }}<span v-if="warning.detail"> {{ warning.detail }}</span></li>
        </ul>
      </el-alert>
      <el-alert v-else type="success" :closable="false" show-icon title="章节映射完成，确认后会创建一份新简历。" />

      <details v-if="result.unknownSections.length" class="unknown-details">
        <summary>已保留的自定义章节（{{ result.unknownSections.length }}）</summary>
        <p v-for="section in result.unknownSections" :key="section">{{ section }}</p>
      </details>
      <p class="privacy-note">解析在浏览器本地完成。导入内容中的 HTML 不会执行，未知章节会保留为自定义模块。</p>
    </template>

    <el-alert v-if="errorMessage" class="mt-3" type="error" :closable="false" show-icon :title="errorMessage" />

    <template #footer>
      <div class="app-dialog-actions markdown-import-actions">
        <el-button v-if="result" @click="reset">重新选择文件</el-button>
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button v-if="result" type="primary" :disabled="!title.trim()" :loading="loading" @click="confirmImport">确认并创建新简历</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
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

watch(() => props.modelValue, (visible) => { if (!visible) reset(); });

function reset() {
  result.value = null;
  title.value = '';
  templateId.value = 'modern';
  errorMessage.value = '';
  if (fileInput.value) fileInput.value.value = '';
}

async function readFile(file?: File) {
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
  try {
    const parsed = parseResumeMarkdown(await file.text(), file.name);
    result.value = parsed;
    title.value = parsed.sourceTitle;
    templateId.value = parsed.resume.templateId || 'modern';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '文件读取或解析失败，请检查文件后重试。';
  }
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  void readFile(target.files?.[0]);
}
function handleDrop(event: DragEvent) {
  isDragging.value = false;
  void readFile(event.dataTransfer?.files?.[0]);
}
function confirmImport() {
  if (!result.value || !title.value.trim()) return;
  emit('confirm', { resume: result.value.resume, title: title.value.trim(), templateId: templateId.value });
}
</script>

<style scoped>
.import-dropzone {
  min-height: 250px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-8);
  border: 1px dashed var(--ui-border);
  border-radius: var(--ui-radius-lg);
  text-align: center;
  background: var(--ui-bg-subtle);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.import-dropzone.is-dragging {
  border-color: var(--ui-primary);
  background: color-mix(in srgb, var(--ui-primary) 8%, white);
}

.import-icon {
  color: var(--ui-primary);
}

.import-dropzone h3 {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-text-main);
  font-size: var(--ui-font-lg);
}

.import-dropzone p,
.privacy-note {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-sm);
}

.import-dropzone p {
  margin: 0 0 var(--ui-space-2);
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
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--ui-space-3);
}

.import-heading h3 {
  margin: var(--ui-space-1) 0;
  font-size: var(--ui-font-xl);
}

.import-heading p {
  margin: 0;
  color: var(--ui-text-secondary);
}

.eyebrow {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-2);
  margin: var(--ui-space-4) 0 var(--ui-space-2);
}

.summary-grid span {
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg-subtle);
  color: var(--ui-text-secondary);
  text-align: center;
  font-size: var(--ui-font-sm);
}

.contact-preview {
  overflow-wrap: anywhere;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-sm);
}

.import-options {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: var(--ui-space-4);
  margin: var(--ui-space-4) 0;
}

.import-options :deep(.el-form-item) {
  margin-bottom: var(--ui-space-2);
}

.warning-list {
  margin: var(--ui-space-2) 0 0;
  padding-left: var(--ui-space-6);
}

.warning-list li {
  margin: var(--ui-space-1) 0;
}

.unknown-details {
  margin-top: var(--ui-space-4);
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg-subtle);
}

.unknown-details summary {
  cursor: pointer;
  color: var(--ui-text-main);
  font-size: var(--ui-font-sm);
  font-weight: 600;
}

.unknown-details p {
  margin: var(--ui-space-2) 0 0;
  font-size: var(--ui-font-sm);
}

.privacy-note {
  margin: var(--ui-space-4) 0 0;
}

@media (max-width: 768px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .import-options {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .import-heading {
    flex-direction: column;
  }
}
</style>
