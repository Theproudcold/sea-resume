<template>
  <el-dialog
    :model-value="modelValue"
    title="备份与恢复全部简历"
    width="var(--ui-dialog-width-lg)"
    align-center
    destroy-on-close
    :close-on-click-modal="!busy"
    :close-on-press-escape="!busy"
    :show-close="!busy"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-tabs>
      <el-tab-pane label="导出全部简历">
        <el-alert type="info" :closable="false" title="备份包含当前存储位置的全部简历及岗位版本。文件只在本地生成，不会上传。" />
        <div class="backup-export">
          <p>请将备份文件保存在安全位置。文件包含简历中的个人信息，不包含 AI 密钥。</p>
          <el-button type="primary" :loading="exporting" :disabled="busy" @click="exportAll">下载全部简历备份</el-button>
        </div>
      </el-tab-pane>
      <el-tab-pane label="恢复备份">
        <div class="backup-import">
          <input ref="fileInput" class="visually-hidden" type="file" aria-label="选择备份文件" accept="application/json,.json" @change="handleFileChange" />
          <el-button :type="preview ? 'default' : 'primary'" :loading="reading" :disabled="busy" @click="fileInput?.click()">{{ preview ? '重选备份文件' : '选择备份文件' }}</el-button>
          <span v-if="fileName" class="file-name">{{ fileName }}</span>
        </div>
        <p v-if="!preview" class="restore-help">选择之前导出的全部简历备份（JSON），确认内容后再恢复。不会覆盖现有简历。</p>
        <el-alert v-if="preview" class="restore-summary" :type="preview.counts.idConflicts || preview.counts.nameConflicts ? 'warning' : 'success'" :closable="false">
          <template #title>找到 {{ preview.counts.total }} 份简历；{{ preview.counts.idConflicts }} 份已存在，{{ preview.counts.nameConflicts }} 份同名。</template>
          <p>现有简历不会被覆盖。已存在或同名的简历会另存为副本。</p>
        </el-alert>
        <el-table v-if="preview?.items.length" :data="preview.items" size="small" max-height="300" class="conflict-table">
          <el-table-column prop="title" label="备份中的简历" min-width="180" show-overflow-tooltip />
          <el-table-column label="恢复方式" min-width="150">
            <template #default="{ row }">
              <span v-if="row.idConflict || row.nameConflict" class="conflict-label">
                <el-tag v-if="row.idConflict" size="small" type="info">已存在，创建副本</el-tag>
                <el-tag v-if="row.nameConflict" size="small" type="warning">同名，自动重命名</el-tag>
              </span>
              <span v-else class="no-conflict">直接恢复</span>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else-if="preview" description="备份中没有简历可恢复。" />
        <el-button v-if="preview?.items.length" class="restore-button" type="primary" :loading="restoring" :disabled="busy" @click="restoreAll">{{ restoredIndexes.size === preview.items.length ? '完成恢复' : restoredIndexes.size ? `继续恢复剩余 ${preview.items.length - restoredIndexes.size} 份` : `恢复 ${preview.items.length} 份简历` }}</el-button>
      </el-tab-pane>
    </el-tabs>
    <el-alert v-if="errorMessage" class="backup-error" type="error" :closable="false" show-icon :title="errorMessage" />
    <template #footer><el-button :disabled="busy" @click="emit('update:modelValue', false)">关闭</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { ResumeData } from '@/types/resume';
import { storageManager } from '@/services/storage/StorageManager';
import { resumeHistoryRepository } from '@/services/history/repository';
import type { ResumeHistoryArchive } from '@/types/history';
import { MAX_JSON_IMPORT_FILE_SIZE, validateJsonImportFileSize, validateResumeData } from '@/utils/export-json';
import { useWorkbenchStore } from '@/stores/workbench';
import { describeError } from '@/utils/globalErrorReporting';
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
const busy = computed(() => exporting.value || reading.value || restoring.value);
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

async function readAllHistories(resumes: readonly ResumeData[]): Promise<ResumeHistoryArchive[]> {
  const histories: ResumeHistoryArchive[] = [];
  for (const resume of resumes) {
    try {
      const archive = await resumeHistoryRepository.exportArchive(resume.id, { limit: 50 });
      if (archive) histories.push(archive);
    } catch (error) {
      console.warn(`读取「${resume.title}」的版本历史失败，备份将继续:`, error);
    }
  }
  return histories;
}

async function exportAll() {
  if (busy.value) return;
  exporting.value = true;
  errorMessage.value = '';
  try {
    const resumes = await readAllResumes();
    const json = serializeFullBackup(resumes, await readAllHistories(resumes));
    if (json.length > MAX_JSON_IMPORT_FILE_SIZE) {
      throw new Error('备份超过 20 MB 的导入上限。请减少简历数量，或关闭版本历史后再导出。');
    }
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
    errorMessage.value = describeError(error);
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
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (busy.value) return;
  if (!file) return;
  reading.value = true;
  errorMessage.value = '';
  preview.value = null;
  restorePlan.value = null;
  restoredIndexes.value = new Set();
  backup.value = null;
  fileName.value = file.name;
  try {
    validateJsonImportFileSize(file.size, '备份文件');
    const validated = parseFullBackup(await readTextFile(file));
    const existing = await readAllResumes();
    const conflictPreview = previewFullBackup(validated, existing);
    backup.value = validated;
    preview.value = conflictPreview;
  } catch (error) {
    fileName.value = '';
    restorePlan.value = null;
    restoredIndexes.value = new Set();
    errorMessage.value = describeError(error);
  } finally {
    reading.value = false;
  }
}

async function restoreAll() {
  if (!backup.value || !hasPreviewItems.value || busy.value) return;
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
    const historyByResume = new Map((backup.value.histories ?? []).map((archive) => [archive.resumeId, archive]));
    for (const [index, resume] of plan.resumes.entries()) {
      if (restoredIndexes.value.has(index)) continue;
      if (existingIds.has(resume.id)) {
        throw new Error('当前存储已变化，恢复计划中的 ID 发生冲突；已完成项不会重复写入，请重新校验备份。');
      }
      await storageManager.saveResume(resume);
      const originalId = plan.items[index]?.id;
      const archive = originalId ? historyByResume.get(originalId) : undefined;
      if (archive) {
        try {
          await resumeHistoryRepository.importArchive(archive, resume.id);
        } catch (error) {
          console.warn(`恢复「${resume.title}」的版本历史失败，简历正文已恢复:`, error);
        }
      }
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
      ? `恢复中断：已安全新增 ${written} 份，未覆盖现有简历。${describeError(error)}`
      : describeError(error);
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
.restore-help { color: var(--ui-text-secondary); line-height: 1.6; }
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
