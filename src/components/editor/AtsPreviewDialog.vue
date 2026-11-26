<template>
  <el-dialog
    :model-value="modelValue"
    title="官网一键解析 / ATS 视角预检"
    width="var(--ui-dialog-width-lg)"
    align-center
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="ats-preview">
      <p class="ats-preview__intro">
        在浏览器本地生成「可搜索 PDF」并调用文本提取引擎回读，模拟大厂网申/招聘系统读到的纯文本顺序。全程离线，不上传任何数据。
      </p>

      <div v-if="loading" class="ats-preview__loading" role="status">
        正在本地生成可搜索 PDF 并解析文本层…
      </div>

      <el-alert v-else-if="error" type="error" :closable="false" show-icon :title="error">
        <el-button text type="primary" @click="runAudit">重试预检</el-button>
      </el-alert>

      <template v-else-if="report">
        <div class="ats-preview__summary">
          <span>可搜索 PDF 共 <strong>{{ report.pageCount }}</strong> 页</span>
          <div class="ats-preview__actions">
            <el-button size="small" @click="copyText">复制纯文本</el-button>
            <el-button size="small" type="primary" @click="emit('export-searchable-pdf')">下载可复制文字的 PDF</el-button>
          </div>
        </div>

        <ul class="ats-check-list" aria-label="ATS 解析检查结果">
          <li v-for="item in report.checks" :key="item.id" class="ats-check-item">
            <el-tag :type="tagType(item.status)" size="small" effect="plain">{{ statusLabel(item.status) }}</el-tag>
            <div class="ats-check-item__body">
              <strong>{{ item.label }}</strong>
              <p>{{ item.detail }}</p>
            </div>
          </li>
        </ul>

        <div class="ats-raw">
          <div class="ats-raw__head">
            <strong>机器提取的纯文本顺序</strong>
            <small>可用于核对网申自动填表是否错行，或直接粘贴到纯文本表单</small>
          </div>
          <pre class="ats-raw__content">{{ report.extractedText }}</pre>
        </div>
      </template>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { ResumeData } from '@/types/resume';
import { runLocalAtsPdfPreview, type AtsAuditReport, type AtsCheckItem } from '@/utils/atsPreview';
import { describeError } from '@/utils/globalErrorReporting';

const props = defineProps<{ modelValue: boolean; resume: ResumeData }>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'export-searchable-pdf': [];
}>();

const loading = ref(false);
const error = ref('');
const report = ref<AtsAuditReport | null>(null);
let runToken = 0;

function tagType(status: AtsCheckItem['status']) {
  if (status === 'pass') return 'success';
  if (status === 'warning') return 'warning';
  return 'info';
}

function statusLabel(status: AtsCheckItem['status']) {
  if (status === 'pass') return '通过';
  if (status === 'warning') return '需留意';
  return '提示';
}

async function runAudit() {
  const token = ++runToken;
  loading.value = true;
  error.value = '';
  report.value = null;
  try {
    const result = await runLocalAtsPdfPreview(props.resume);
    if (token === runToken) report.value = result;
  } catch (cause) {
    if (token === runToken) error.value = describeError(cause);
  } finally {
    if (token === runToken) loading.value = false;
  }
}

watch(() => props.modelValue, (visible) => {
  if (visible) void runAudit();
  else runToken += 1;
}, { immediate: true });

async function copyText() {
  if (!report.value?.extractedText) return;
  try {
    await navigator.clipboard.writeText(report.value.extractedText);
    ElMessage.success('已复制提取后的纯文本');
  } catch {
    ElMessage.warning('无法自动复制，请手动选择下方文本复制');
  }
}
</script>

<style scoped>
.ats-preview {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ats-preview__intro {
  margin: 0;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-sm);
  line-height: 1.6;
}

.ats-preview__loading {
  padding: 28px 16px;
  border: 1px dashed var(--ui-border);
  border-radius: var(--ui-radius-md);
  color: var(--ui-text-secondary);
  text-align: center;
}

.ats-preview__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg-subtle);
  font-size: var(--ui-font-sm);
}

.ats-preview__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ats-check-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ats-check-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
}

.ats-check-item__body strong {
  display: block;
  font-size: var(--ui-font-sm);
  color: var(--ui-text-main);
}

.ats-check-item__body p {
  margin: 4px 0 0;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-xs);
  line-height: 1.55;
}

.ats-raw__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.ats-raw__head small {
  color: var(--ui-text-muted);
}

.ats-raw__content {
  max-height: 260px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg-subtle);
  color: var(--ui-text-main);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
