<template>
  <el-dialog
    :model-value="modelValue"
    title="全量备份与恢复"
    width="var(--ui-dialog-width-lg)"
    align-center
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-tabs>
      <el-tab-pane label="导出全部简历">
        <el-alert type="info" :closable="false" title="备份包含当前存储位置的全部简历及岗位版本。文件只在本地生成，不会上传。" />
        <div class="backup-export">
          <p>导出为带格式版本号的 JSON 文件。定期保存在安全位置；恢复时不会覆盖现有简历。</p>
          <el-button type="primary" :loading="exporting" :disabled="exporting" @click="exportAll">导出全量备份</el-button>
        </div>
      </el-tab-pane>
      <el-tab-pane label="校验并恢复">
        <div class="backup-import">
          <input ref="fileInput" class="visually-hidden" type="file" accept="application/json,.json" @change="handleFileChange" />
          <el-button :loading="reading" @click="fileInput?.click()">选择备份 JSON</el-button>
          <span v-if="fileName" class="file-name">{{ fileName }}</span>
        </div>
        <el-alert v-if="preview" class="restore-summary" type="warning" :closable="false">
          <template #title>校验通过：{{ preview.counts.total }} 份待恢复；ID 冲突 {{ preview.counts.idConflicts }} 份，名称冲突 {{ preview.counts.nameConflicts }} 份。</template>
          <p>恢复不会覆盖现有简历。冲突项将使用新 ID 和独立名称创建副本；其他简历保留原 ID。</p>
        </el-alert>
        <el-table v-if="preview?.items.length" :data="preview.items" size="small" max-height="300" class="conflict-table">
          <el-table-column prop="title" label="备份中的简历" min-width="180" show-overflow-tooltip />
          <el-table-column prop="id" label="原 ID" min-width="150" show-overflow-tooltip />
          <el-table-column label="冲突">
            <template #default="{ row }">
              <span v-if="row.idConflict || row.nameConflict" class="conflict-label">
                <el-tag v-if="row.idConflict" size="small" type="danger">ID 冲突</el-tag>
                <el-tag v-if="row.nameConflict" size="small" type="warning">名称冲突</el-tag>
              </span>
              <span v-else class="no-conflict">无</span>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else-if="preview" description="备份中没有简历可恢复。" />
        <el-alert v-if="errorMessage" class="backup-error" type="error" :closable="false" show-icon :title="errorMessage" />
        <el-button v-if="preview?.items.length" class="restore-button" type="primary" :loading="restoring" @click="restoreAll">按预览结果安全恢复</el-button>
      </el-tab-pane>
    </el-tabs>
    <template #footer><el-button @click="emit('update:modelValue', false)">关闭</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { ResumeData, ResumeMeta } from '@/types/resume';
import { storageManager } from '@/services/storage/StorageManager';
import { validateResumeData } from '@/utils/export-json';
import { useWorkbenchStore } from '@/stores/workbench';
import {
  parseFullBackup,
  planFullBackupRestore,
  previewFullBackup,
  recordFullBackupSuccess,
  serializeFullBackup,
  type FullBackupEnvelope,
  type FullBackupRestorePlan,
  type FullBackupPreview,
} from '@/utils/fullBackup';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; 'backup-success': []; restored: [count: number] }>();
const workbench = useWorkbenchStore();
const fileInput = ref<HTMLInputElement>();
const exporting = ref(false);
const reading = ref(false);
const restoring = ref(false);
const fileName = ref('');
const preview = ref<FullBackupPreview | null>(null);
const backup = ref<FullBackupEnvelope | null>(null);
const restorePlan = ref<FullBackupRestorePlan | null>(null);
const restoredIndexes = ref<Set<number>>(new Set());
const errorMessage = ref('');
const hasPreviewItems = computed(() => (preview.value?.items.length ?? 0) > 0);

watch(() => props.modelValue, (visible) => { if (!visible) resetImport(); });

async function readAllResumes(): Promise<ResumeData[]> {
  const metadata = await storageManager.list();
  const resumes = await Promise.all(metadata.map(async (meta) => {
    const resume = await storageManager.read(meta.id);
    if (!resume) throw new Error(`无法读取简历「${meta.title}」，请检查当前存储后重试。`);
    return validateResumeData(resume);
  }));
  return resumes;
}

async function exportAll() {
  exporting.value = true;
  errorMessage.value = '';
  try {
    const json = serializeFullBackup(await readAllResumes());
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sea-resume-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    recordFullBackupSuccess();
    ElMessage.success('全量备份已生成并下载。');
    emit('backup-success');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '全量备份失败。';
    ElMessage.error(errorMessage.value);
  } finally {
    exporting.value = false;
  }
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('无法读取备份文件。'));
    reader.readAsText(file);
  });
}

async function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  reading.value = true;
  errorMessage.value = '';
  preview.value = null;
  restorePlan.value = null;
  restoredIndexes.value = new Set();
  backup.value = null;
  fileName.value = file.name;
  try {
    const validated = parseFullBackup(await readTextFile(file));
    const existing = await readAllResumes();
    const conflictPreview = previewFullBackup(validated, existing);
    backup.value = validated;
    preview.value = conflictPreview;
  } catch (error) {
    fileName.value = '';
    restorePlan.value = null;
    restoredIndexes.value = new Set();
    errorMessage.value = error instanceof Error ? error.message : '备份文件校验失败。';
  } finally {
    reading.value = false;
  }
}

async function restoreAll() {
  if (!backup.value || !hasPreviewItems.value) return;
  restoring.value = true;
  errorMessage.value = '';
  let written = 0;
  try {
    const existing = await readAllResumes();
    const existingIds = new Set(existing.map((resume) => resume.id));
    if (!restorePlan.value) {
      const candidate = planFullBackupRestore(backup.value, existing);
      if (candidate.resumes.some((resume) => existingIds.has(resume.id))) {
        throw new Error('恢复计划与当前存储出现 ID 冲突，请重新选择文件并预览。');
      }
      restorePlan.value = candidate;
    }
    const plan = restorePlan.value!;
    for (const [index, resume] of plan.resumes.entries()) {
      if (restoredIndexes.value.has(index)) continue;
      if (existingIds.has(resume.id)) {
        throw new Error('当前存储已变化，恢复计划中的 ID 发生冲突；已完成项不会重复写入，请重新校验备份。');
      }
      const now = Date.now();
      const meta: ResumeMeta = {
        id: resume.id,
        title: resume.title,
        templateId: resume.templateId,
        createdAt: Number.isFinite(Date.parse(resume.createdAt)) ? Date.parse(resume.createdAt) : now,
        updatedAt: Number.isFinite(Date.parse(resume.updatedAt)) ? Date.parse(resume.updatedAt) : now,
      };
      await storageManager.save(resume, meta);
      written += 1;
      existingIds.add(resume.id);
      restoredIndexes.value = new Set([...restoredIndexes.value, index]);
    }
    await workbench.refresh();
    ElMessage.success(`恢复完成：新增 ${written} 份简历；现有简历未被覆盖。`);
    emit('restored', written);
    emit('update:modelValue', false);
    resetImport();
  } catch (error) {
    errorMessage.value = written
      ? `恢复中断：已安全新增 ${written} 份，未覆盖现有简历。${error instanceof Error ? error.message : ''}`
      : error instanceof Error ? error.message : '恢复失败。';
  } finally {
    restoring.value = false;
  }
}

function resetImport() {
  fileName.value = '';
  preview.value = null;
  backup.value = null;
  errorMessage.value = '';
  restorePlan.value = null;
  restoredIndexes.value = new Set();
  if (fileInput.value) fileInput.value.value = '';
}
</script>

<style scoped>
.backup-export { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; padding: 20px 0 8px; }
.backup-export p { max-width: 500px; margin: 0; color: var(--ui-text-secondary); }
.backup-import { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.file-name { max-width: 100%; overflow-wrap: anywhere; color: var(--ui-text-secondary); }
.restore-summary, .backup-error { margin-top: 14px; }
.restore-summary p { margin: 6px 0 0; }
.conflict-table { margin-top: 14px; }
.conflict-label { display: flex; flex-wrap: wrap; gap: 4px; }
.no-conflict { color: var(--ui-success); }
.restore-button { margin-top: 14px; }
@media (max-width: 560px) { .backup-export { align-items: stretch; flex-direction: column; } .backup-export :deep(.el-button) { width: 100%; } }
</style>
