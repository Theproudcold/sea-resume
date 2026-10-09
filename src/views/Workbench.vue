<template>
  <div class="workbench-view">
    <AppHeader title="简历工作台" subtitle="Sea Resume · 简历管理">
      <template #actions>
        <el-button @click="showVersionManager = true">岗位版本与比较</el-button>
        <el-button @click="showFullBackupManager = true">全量备份</el-button>
        <el-button :icon="Setting" @click="showSettings = true">设置</el-button>
        <el-button :icon="Upload" @click="showMarkdownImport = true">导入 Markdown</el-button>
        <el-button :icon="Document" @click="showPdfImport = true">AI 导入 PDF</el-button>
        <el-button type="primary" :icon="Plus" @click="goToTemplates">新建简历</el-button>
      </template>
    </AppHeader>

    <!-- 主内容 -->
    <div class="workbench-content">
      <div v-if="!loading && hasResumes && backupReminderDue && !backupReminderDismissed" class="backup-reminder" role="status">
        <span>建议创建全量备份，避免浏览器数据或本地目录异常时丢失简历。</span>
        <el-button type="primary" size="small" @click="showFullBackupManager = true">立即备份</el-button>
        <el-button text size="small" aria-label="关闭备份提醒" @click="backupReminderDismissed = true">稍后</el-button>
      </div>
        <div v-if="loading" class="loading-state">
          <el-icon class="is-loading" :size="48"><Loading /></el-icon>
          <p>加载中...</p>
        </div>

        <el-empty v-else-if="!hasResumes" description="还没有简历，浏览模板或导入现有内容开始。">
          <div class="empty-actions">
            <el-button type="primary" :icon="Plus" @click="goToTemplates">浏览模板</el-button>
            <el-button :icon="Upload" @click="showMarkdownImport = true">导入 Markdown</el-button>
            <el-button :icon="Document" @click="showPdfImport = true">AI 导入 PDF</el-button>
          </div>
        </el-empty>

        <div v-else class="resume-grid">
          <ResumeCard
            v-for="resume in resumeList"
            :key="resume.id"
            :resume="resume"
            @click="handleCardClick(resume.id)"
            @edit="handleEdit(resume.id)"
            @rename="handleRename(resume)"
            @duplicate="handleDuplicate(resume.id)"
            @delete="handleDelete(resume)"
          />
        </div>
    </div>


    <!-- 重命名对话框 -->
    <el-dialog v-model="showRenameDialog" title="重命名简历" width="min(420px, calc(100vw - 32px))" class="app-dialog">
      <el-input
        v-model="renameForm.title"
        placeholder="输入新名称"
        maxlength="50"
        show-word-limit
        @keyup.enter="confirmRename"
      />
      <template #footer>
        <el-button @click="showRenameDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmRename" :loading="renaming">
          确定
        </el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="showSettings" title="设置" width="min(760px, calc(100vw - 32px))" class="app-settings-dialog">
      <div class="settings-content">
        <section class="settings-section">
          <div class="settings-section__heading">
            <h3>存储位置</h3>
            <p>选择简历保存在本地目录还是当前浏览器。</p>
          </div>
          <p class="storage-status">当前存储：<strong>{{ storageStore.storageTypeName }}</strong><span v-if="storageStore.currentType === 'file_system' && storageStore.config?.fileSystem?.directoryPath">（{{ storageStore.config.fileSystem.directoryPath }}）</span></p>
          <el-alert v-if="storageStore.initializationWarning" class="settings-alert" type="warning" :closable="false" :title="storageStore.initializationWarning" />
          <el-alert v-if="storageStore.currentType === 'local_storage'" class="settings-alert" type="warning" :closable="false" show-icon title="简历保存在当前浏览器缓存。清理浏览器数据可能导致丢失，请定期导出 JSON 备份。" />
          <p v-else class="settings-help">简历保存在你授权的本地目录；浏览器可能在后续访问时要求重新授权。</p>
          <div class="settings-actions">
            <el-button :loading="storageStore.isMigrating" @click="handleChooseStorageDirectory">选择本地目录并迁移</el-button>
            <el-button v-if="storageStore.currentType === 'file_system'" :loading="storageStore.isMigrating" @click="handleSwitchToBrowserStorage">迁回浏览器缓存</el-button>
          </div>
          <p class="settings-help">空目录会复制当前简历；目录已有简历时可增量合并，仅补入缺失简历，同 ID 冲突保留目录中的版本。旧目录升级时保留原文件。</p>
        </section>

        <section class="settings-section">
          <div class="settings-section__heading">
            <h3>单份简历备份</h3>
            <p>JSON 恢复会创建副本，不覆盖已有简历，也不等同于目录同步。</p>
          </div>
          <div class="settings-actions">
            <el-select v-model="backupResumeId" placeholder="选择简历" class="backup-select">
              <el-option v-for="resume in resumeList" :key="resume.id" :label="resume.title" :value="resume.id" />
            </el-select>
            <el-button :disabled="!backupResumeId" @click="handleExportBackup">导出 JSON 备份</el-button>
            <el-button @click="handleImportData">从 JSON 恢复为副本</el-button>
          </div>
        </section>

        <section class="ui-danger-zone">
          <h3 class="ui-danger-zone__title">清空所有简历</h3>
          <p class="ui-danger-zone__description">删除当前存储位置中的全部简历，且无法撤销。</p>
          <el-button type="danger" plain @click="handleResetData">
            <el-icon class="mr-1"><Delete /></el-icon>
            清空全部简历
          </el-button>
        </section>

        <section class="settings-about">
          <h3>关于 Sea Resume</h3>
          <p>Sea Resume v1.0.0 · 简洁、灵活的简历制作工具。</p>
        </section>
      </div>
      <template #footer>
        <div class="app-dialog-actions">
          <el-button @click="showSettings = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <MarkdownImportDialog v-model="showMarkdownImport" :loading="creating" @confirm="handleMarkdownImport" />
    <AiPdfImportDialog v-model="showPdfImport" :loading="creating" @confirm="handlePdfImport" />
    <ResumeVersionManager v-model="showVersionManager" :resumes="resumeList" @created="handleVersionCreated" />
    <FullBackupManager v-model="showFullBackupManager" @backup-success="handleFullBackupSuccess" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Setting, Loading, Upload, Delete, Document } from '@element-plus/icons-vue';
import AppHeader from '@/components/common/AppHeader.vue';
import { useWorkbenchStore } from '@/stores/workbench';
import { useStorageStore } from '@/stores/storage';
import { storageManager } from '@/services/storage/StorageManager';
import { exportToJSON, importFromJSON } from '@/utils/export-json';
import ResumeCard from '@/components/workbench/ResumeCard.vue';
import MarkdownImportDialog from '@/components/workbench/MarkdownImportDialog.vue';
import AiPdfImportDialog from '@/components/workbench/AiPdfImportDialog.vue';
import ResumeVersionManager from '@/components/workbench/ResumeVersionManager.vue';
import FullBackupManager from '@/components/workbench/FullBackupManager.vue';
import { getFullBackupReminderStatus } from '@/utils/fullBackup';
import type { ResumeMeta } from '@/types/resume';

const router = useRouter();
const workbenchStore = useWorkbenchStore();
const storageStore = useStorageStore();

const loading = ref(false);
const showRenameDialog = ref(false);
const showSettings = ref(false);
const showMarkdownImport = ref(false);
const showPdfImport = ref(false);
const showVersionManager = ref(false);
const showFullBackupManager = ref(false);
const backupReminderDue = ref(false);
const backupReminderDismissed = ref(false);
const backupResumeId = ref('');
const creating = ref(false);
const renaming = ref(false);


const renameForm = ref({
  id: '',
  title: '',
});

const resumeList = computed(() => workbenchStore.resumeList);
const hasResumes = computed(() => workbenchStore.hasResumes);

watch(resumeList, (list) => {
  if (!list.some((resume) => resume.id === backupResumeId.value)) backupResumeId.value = list[0]?.id || '';
}, { immediate: true });

onMounted(async () => {
  loading.value = true;
  try {
    // 初始化存储
    await storageStore.init();
    // 加载简历列表
    await workbenchStore.init();
  } catch (error) {
    ElMessage.error('加载失败: ' + (error instanceof Error ? error.message : '未知错误'));
  } finally {
    const reminder = getFullBackupReminderStatus();
    backupReminderDue.value = reminder.available && reminder.due;
    loading.value = false;
  }
});

const handleCardClick = (id: string) => {
  router.push(`/editor/${id}`);
};

const handleEdit = (id: string) => {
  router.push(`/editor/${id}`);
};

const goToTemplates = () => {
  router.push('/templates');
};

const handleVersionCreated = (id: string) => {
  showVersionManager.value = false;
  router.push(`/editor/${id}`);
};

const handleFullBackupSuccess = () => {
  backupReminderDue.value = false;
  backupReminderDismissed.value = false;
};


const handleMarkdownImport = async ({ resume, title, templateId }: { resume: import('@/types/resume').ResumeData; title: string; templateId: string }) => {
  creating.value = true;
  try {
    const id = await workbenchStore.createResumeFromData(resume, title, templateId);
    showMarkdownImport.value = false;
    ElMessage.success('Markdown 已导入为新简历');
    router.push(`/editor/${id}`);
  } catch (error) {
    ElMessage.error('导入失败: ' + (error instanceof Error ? error.message : '未知错误'));
  } finally {
    creating.value = false;
  }
};

const handleRename = (resume: ResumeMeta) => {
  renameForm.value = {
    id: resume.id,
    title: resume.title,
  };
  showRenameDialog.value = true;
};

const confirmRename = async () => {
  if (!renameForm.value.title.trim()) {
    ElMessage.warning('请输入新名称');
    return;
  }

  renaming.value = true;
  try {
    await workbenchStore.renameResume(renameForm.value.id, renameForm.value.title);
    ElMessage.success('重命名成功');
    showRenameDialog.value = false;
  } catch (error) {
    ElMessage.error('重命名失败: ' + (error instanceof Error ? error.message : '未知错误'));
  } finally {
    renaming.value = false;
  }
};

const handleDuplicate = async (id: string) => {
  try {
    const newId = await workbenchStore.duplicateResume(id);
    ElMessage.success('复制成功');
    router.push(`/editor/${newId}`);
  } catch (error) {
    ElMessage.error('复制失败: ' + (error instanceof Error ? error.message : '未知错误'));
  }
};

const handleDelete = async (resume: ResumeMeta) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除「${resume.title}」吗？此操作无法撤销。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    );

    await workbenchStore.deleteResume(resume.id);
    ElMessage.success('删除成功');
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }
};

const handleImportData = async () => {
  try {
    const data = await importFromJSON();
    const id = await workbenchStore.createResumeFromData(data, `${data.title || '导入的简历'} (副本)`, data.templateId || 'modern');
    ElMessage.success('已作为新简历导入');
    showSettings.value = false;
    router.push(`/editor/${id}`);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== '未选择文件') {
      ElMessage.error('导入失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }
};

const handlePdfImport = async ({ resume, title, templateId }: { resume: import('@/types/resume').ResumeData; title: string; templateId: string }) => {
  creating.value = true;
  try {
    const id = await workbenchStore.createResumeFromData(resume, title, templateId);
    showPdfImport.value = false;
    ElMessage.success('PDF 简历已导入为新简历');
    router.push(`/editor/${id}`);
  } catch (error) {
    ElMessage.error('PDF 导入失败: ' + (error instanceof Error ? error.message : '未知错误'));
  } finally {
    creating.value = false;
  }
};

const handleResetData = async () => {
  try {
    await ElMessageBox.confirm(
      `确定清空当前存储位置中的全部简历吗？此操作无法撤销。`,
      '清空所有简历',
      {
        confirmButtonText: '清空全部简历',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    );
    
    await storageStore.clearAll();
    await workbenchStore.init();
    ElMessage.success('已清空当前存储位置中的全部简历');
    showSettings.value = false;
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败');
    }
  }
};

const handleExportBackup = async () => {
  try {
    const data = await storageManager.read(backupResumeId.value);
    if (!data) throw new Error('所选简历不存在。');
    exportToJSON(data, `${data.title || 'resume'}-backup`);
    ElMessage.success('简历 JSON 备份已导出');
  } catch (error) {
    ElMessage.error('备份失败: ' + (error instanceof Error ? error.message : '未知错误'));
  }
};

const handleChooseStorageDirectory = async () => {
  const picker = (window as unknown as { showDirectoryPicker?: (options?: { mode?: 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (!picker) {
    ElMessage.error('当前浏览器不支持本地目录访问；仍可使用浏览器存储和 JSON 备份。');
    return;
  }
  try {
    const directoryHandle = await picker.call(window, { mode: 'readwrite', startIn: 'documents' });
    try {
      const result = await storageStore.switchToFileSystem(directoryHandle);
      await workbenchStore.init();
      ElMessage.success(`已复制 ${result.addedCount} 份简历到本地目录并切换存储`);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'DirectoryContainsResumeDataError') throw error;
      await ElMessageBox.confirm(
        '所选目录已有简历。确认后将把浏览器缓存中缺少的简历增量复制到该目录；同 ID 简历保留目录中的版本，不会覆盖。',
        '增量合并简历？',
        { confirmButtonText: '合并并切换', cancelButtonText: '取消', type: 'warning' },
      );
      const result = await storageStore.switchToFileSystem(directoryHandle, true);
      await workbenchStore.init();
      ElMessage.success(`增量合并完成：新增 ${result.addedCount} 份，ID 冲突保留目录版本 ${result.conflictCount} 份`);
    }
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'cancel')) return;
    ElMessage.error('切换本地目录失败: ' + (error instanceof Error ? error.message : '未知错误'));
  }
};

const handleSwitchToBrowserStorage = async () => {
  try {
    await ElMessageBox.confirm('将把当前目录中的简历复制回浏览器缓存。目录中的文件会保留，但切换后浏览器缓存将成为当前存储。', '切换存储位置', {
      confirmButtonText: '复制并切换', cancelButtonText: '取消', type: 'warning',
    });
    await storageStore.switchToBrowserStorage();
    await workbenchStore.init();
    ElMessage.success('简历已复制回浏览器缓存');
  } catch (error) {
    if (error !== 'cancel') ElMessage.error('切换失败: ' + (error instanceof Error ? error.message : '未知错误'));
  }
};
</script>

<style scoped>
.workbench-view {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--ui-bg-page);
}

.workbench-content {
  width: 100%;
  max-width: var(--ui-content-max-width);
  margin: 0 auto;
  padding: var(--ui-space-8) var(--ui-page-gutter);
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--ui-space-3);
}

.resume-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 320px));
  justify-content: start;
  gap: var(--ui-space-6);
}

.loading-state {
  text-align: center;
  padding: var(--ui-space-8) var(--ui-space-4);
  color: var(--ui-text-secondary);
}

.loading-state p {
  margin-top: var(--ui-space-4);
  font-size: var(--ui-font-md);
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-6);
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding-bottom: var(--ui-space-6);
  border-bottom: 1px solid var(--ui-border);
}

.settings-section__heading h3,
.settings-about h3 {
  margin: 0;
  color: var(--ui-text-main);
  font-size: var(--ui-font-md);
  font-weight: 650;
}

.settings-section__heading p,
.settings-about p {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-sm);
}

.storage-status {
  margin: 0;
  color: var(--ui-text-secondary);
  overflow-wrap: anywhere;
}

.settings-help {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-sm);
  line-height: var(--ui-line-height);
}

.settings-alert {
  margin: 0;
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
}

.backup-select {
  flex: 1 1 220px;
  min-width: min(220px, 100%);
  max-width: 100%;
}

.settings-about {
  padding-top: var(--ui-space-1);
}

.backup-reminder { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ui-space-2); margin-bottom: var(--ui-space-6); padding: var(--ui-space-3) var(--ui-space-4); border: 1px solid color-mix(in srgb, var(--ui-warning) 35%, white); border-radius: var(--ui-radius-md); background: color-mix(in srgb, var(--ui-warning) 7%, white); color: var(--ui-text-main); }
.backup-reminder span { flex: 1 1 240px; font-size: var(--ui-font-sm); }
@media (max-width: 768px) {
  .workbench-content {
    padding: var(--ui-space-6) var(--ui-page-gutter);
  }

  .resume-grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
    gap: var(--ui-space-4);
  }

  .empty-actions,
  .settings-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .empty-actions :deep(.el-button),
  .settings-actions :deep(.el-button),
  .backup-select {
    width: 100%;
  }
}
</style>
