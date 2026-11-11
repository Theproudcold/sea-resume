<template>
  <el-dialog
    :model-value="modelValue"
    title="AI 导入 PDF 简历"
    width="var(--ui-dialog-width-md)"
    align-center
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ol class="import-steps" aria-label="导入步骤">
      <li :class="{ 'is-current': !extracted }" :aria-current="!extracted ? 'step' : undefined"><b>1</b>选择 PDF</li>
      <li :class="{ 'is-current': !!extracted && !parsed }" :aria-current="extracted && !parsed ? 'step' : undefined"><b>2</b>发送前确认</li>
      <li :class="{ 'is-current': !!parsed }" :aria-current="parsed ? 'step' : undefined"><b>3</b>AI 解析预览</li>
    </ol>

    <div v-if="!extracted" class="pdf-dropzone" :class="{ 'is-dragging': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
    >
      <el-icon class="pdf-dropzone-icon" :size="38"><UploadFilled /></el-icon>
      <h3>选择可复制文本的 PDF 简历</h3>
      <p>PDF 最大 15 MB、最多 30 页。文本会先在浏览器本地提取；扫描图片 PDF 暂不支持 OCR。</p>
      <el-button type="primary" :loading="extracting" @click="fileInput?.click()">选择 PDF 文件</el-button>
      <input ref="fileInput" class="visually-hidden" type="file" accept="application/pdf,.pdf" @change="handleFileChange" />
    </div>

    <template v-else-if="!parsed">
      <div class="pdf-file-summary">
        <strong>{{ fileName }}</strong>
        <span class="pdf-page-count">{{ extracted.pageCount }} 页</span>
        <el-tag type="success" effect="plain">本地提取完成</el-tag>
      </div>
      <details class="text-preview">
        <summary>查看本地提取的文本（仅预览前 4,000 字符）</summary>
        <pre>{{ extracted.text.slice(0, 4000) }}<span v-if="extracted.text.length > 4000">…</span></pre>
      </details>
      <el-alert type="warning" :closable="false" show-icon>
        <template #title>发送前请确认</template>
        <p>PDF 文件未上传；只有提取出的文本和文件名会在你点击解析并明确勾选后发送给配置的 AI 服务。API Key 仅保存在本次会话内存。</p>
      </el-alert>
      <div class="pdf-provider-card">
        <div class="pdf-provider-summary">
          <span class="pdf-provider-label">当前模型服务</span>
          <span class="pdf-provider-name"><strong>{{ providerLabel }}</strong><span>{{ modelSettings?.model || '未配置模型' }}</span></span>
          <span class="pdf-provider-state" :class="{ 'is-ready': isModelReady }">{{ isModelReady ? '模型服务已就绪' : '需要完成模型配置' }}</span>
        </div>
        <el-button @click="showModelSettings = !showModelSettings">
          {{ showModelSettings ? '收起配置' : '配置模型' }}
        </el-button>
      </div>
      <AiProviderSettingsPanel v-if="showModelSettings" @saved="refreshAiConfiguration" />
      <p class="pdf-model-note">服务商与模型设置会和 AI 助手共用；API Key 只保存在当前页面会话。</p>
      <el-checkbox v-model="consent" class="consent-check">我确认将 PDF 提取文本发送给上方 AI 服务用于本次解析。</el-checkbox>
      <el-button :type="showModelSettings ? 'default' : 'primary'" class="parse-button" :loading="requesting" :disabled="!canRequest" @click="parseWithAi">发送文本并解析简历</el-button>
    </template>

    <template v-else-if="parsed && draftResume">
      <div class="pdf-result-heading">
        <div>
          <h3>{{ draftResume.basic.name || parsed.sourceTitle }}</h3>
          <p>{{ draftResume.basic.title || '未识别求职意向' }}</p>
        </div>
        <div class="pdf-result-meta">
          <span class="pdf-page-count">{{ extracted?.pageCount }} 页 PDF</span>
          <el-tag type="success" effect="plain">确认后创建新简历</el-tag>
        </div>
      </div>
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

      <el-form label-position="top" class="result-options">
        <el-form-item label="新简历名称"><el-input v-model="title" maxlength="80" show-word-limit /></el-form-item>
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

    <el-alert v-if="errorMessage" class="error-alert" type="error" :closable="false" show-icon :title="errorMessage" />
    <template #footer>
      <div class="app-dialog-actions">
        <el-button v-if="extracted" @click="reset">重新选择 PDF</el-button>
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button v-if="parsed" type="primary" :loading="loading" :disabled="!title.trim()" @click="confirmImport">确认并创建新简历</el-button>
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
import { extractPdfText, requestAiPdfMarkdown, type ExtractedPdfText } from '@/services/ai/pdfResumeImport';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { markdownToSafeHtml } from '@/utils/markdown/markdownSafety';

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
const extracted = ref<ExtractedPdfText | null>(null);
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
const isModelReady = computed(() => sessionKeyAvailable.value);
const canRequest = computed(() => isModelReady.value && consent.value && !requesting.value);
const providerLabel = computed(() => modelSettings.value?.profileName || AI_PROVIDER_PRESETS.find((preset) => preset.id === modelSettings.value?.presetId)?.label || '未配置');

function refreshAiConfiguration() {
  modelSettings.value = loadAiModelSettings();
  sessionKeyAvailable.value = isAiProviderReady(modelSettings.value);
}

onMounted(refreshAiConfiguration);
watch(() => props.modelValue, (visible) => {
  if (visible) refreshAiConfiguration();
  else reset();
});

function reset() {
  extracted.value = null;
  parsed.value = null;
  draftResume.value = null;
  fileName.value = '';
  title.value = '';
  consent.value = false;
  explanation.value = '';
  errorMessage.value = '';
  showModelSettings.value = false;
  if (fileInput.value) fileInput.value.value = '';
}

async function readFile(file?: File) {
  errorMessage.value = '';
  if (!file) return;
  extracting.value = true;
  try {
    const result = await extractPdfText(file);
    extracted.value = result;
    fileName.value = file.name;
    parsed.value = null;
    draftResume.value = null;
    refreshAiConfiguration();
    showModelSettings.value = !isModelReady.value;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'PDF 读取失败。';
  } finally {
    extracting.value = false;
  }
}

function handleFileChange(event: Event) {
  void readFile((event.target as HTMLInputElement).files?.[0]);
}

function handleDrop(event: DragEvent) {
  isDragging.value = false;
  void readFile(event.dataTransfer?.files?.[0]);
}

async function parseWithAi() {
  if (!canRequest.value || !extracted.value || !modelSettings.value) return;
  requesting.value = true;
  errorMessage.value = '';
  try {
    const result = await requestAiPdfMarkdown(toAiProviderConfig(modelSettings.value), fileName.value, extracted.value.text);
    const imported = parseResumeMarkdown(result.markdown, fileName.value.replace(/\.pdf$/i, '.md'));
    parsed.value = imported;
    draftResume.value = JSON.parse(JSON.stringify(imported.resume)) as ResumeData;
    explanation.value = result.explanation;
    title.value = imported.sourceTitle;
    templateId.value = imported.resume.templateId || 'modern';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'AI PDF 解析失败。';
  } finally {
    requesting.value = false;
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
  if (!draftResume.value || !title.value.trim()) return;
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
.consent-check { margin: 0 0 var(--space-sm); white-space: normal; }
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
}
</style>
