<template>
  <div class="workbench-view">
    <AppHeader title="简历工作台" subtitle="Sea Resume 简历管理">
      <template #actions>
        <el-button class="ai-settings-trigger" @click="openSettings('ai')">AI 模型配置</el-button>
        <el-button @click="router.push('/interviews')">模拟面试与记录</el-button>
        <el-dropdown @command="handleManageCommand">
          <el-button>管理<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="versions">岗位版本与比较</el-dropdown-item>
              <el-dropdown-item command="backup">全量备份</el-dropdown-item>
              <el-dropdown-item command="settings">数据与存储设置</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown @command="handleImportCommand">
          <el-button>导入<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="markdown">导入 Markdown</el-dropdown-item>
              <el-dropdown-item command="pdf">AI 导入 PDF</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="primary" :icon="Plus" @click="goToTemplates">新建简历</el-button>
      </template>
    </AppHeader>

    <!-- 主内容 -->
    <div class="workbench-content">
      <div v-if="storageStore.initializationWarning" class="backup-reminder" role="alert">
        <span>{{ storageStore.initializationWarning }}</span>
        <el-button v-if="storageStore.hasFileSystemConfig" type="primary" size="small" @click="handleReauthorizeStorageDirectory">重新授权本地目录</el-button>
      </div>
      <div v-if="!loading && hasResumes && backupReminderDue && !backupReminderDismissed" class="backup-reminder" role="status">
        <span v-if="storageStore.currentType === 'file_system'">保存到本地目录并不等于备份：目录误删或磁盘故障仍可能导致数据丢失，授权失效时也可能暂时无法访问。建议定期导出全量 JSON，并保存到其他安全位置。</span>
        <span v-else>简历保存在当前浏览器，清理浏览器数据可能导致丢失。建议定期导出全量 JSON，并保存到安全位置。</span>
        <el-button type="primary" size="small" @click="showFullBackupManager = true">立即备份</el-button>
        <el-button text size="small" aria-label="关闭备份提醒" @click="backupReminderDismissed = true">稍后</el-button>
      </div>
        <div v-if="loading" class="loading-state" role="status" aria-label="加载中…">
          <div v-for="row in 3" :key="row" class="skeleton-row" aria-hidden="true">
            <span class="skeleton-sheet"></span>
            <span class="skeleton-line"></span>
          </div>
        </div>

        <section v-else-if="!hasResumes" class="empty-board" aria-labelledby="empty-board-title">
          <div class="empty-sheet" aria-hidden="true"></div>
          <div class="empty-copy">
            <h2 id="empty-board-title">还没有简历，浏览模板或导入现有内容开始。</h2>
            <div class="empty-actions">
              <el-button type="primary" :icon="Plus" @click="goToTemplates">浏览模板</el-button>
              <el-button :icon="Upload" @click="showMarkdownImport = true">导入 Markdown</el-button>
              <el-button :icon="Document" @click="showPdfImport = true">AI 导入 PDF</el-button>
            </div>
          </div>
        </section>

        <section v-else class="resume-board" aria-labelledby="resume-board-title">
          <header class="board-head">
            <h2 id="resume-board-title">我的简历</h2>
            <span class="board-count"><strong>{{ resumeList.length }}</strong> 份</span>
          </header>
          <div v-if="resumeList.length > 8" class="board-tools">
            <el-input v-model="resumeQuery" clearable placeholder="按名称筛选" aria-label="按名称筛选简历" />
            <el-select v-model="resumeSort" aria-label="简历排序">
              <el-option label="最近编辑" value="recent" />
              <el-option label="标题" value="title" />
            </el-select>
          </div>
          <div class="board-columns" role="row">
            <span role="columnheader">简历</span>
            <span role="columnheader">模板</span>
            <span role="columnheader">最近编辑</span>
          </div>
          <p v-if="!visibleResumes.length" class="board-empty-filter">没有名称包含「{{ resumeQuery.trim() }}」的简历。</p>
          <div
            v-else
            class="resume-grid"
            @keydown="onBoardKeydown"
            @focusin="boardFocused = true"
            @focusout="onBoardFocusOut"
          >
            <ResumeCard
              v-for="resume in visibleResumes"
              :key="resume.id"
              :resume="resume"
              :selected="boardFocused && resume.id === activeResumeId"
              @click="handleCardClick(resume.id)"
              @focusin="activeResumeId = resume.id"
              @edit="handleEdit(resume.id)"
              @interview="router.push({ path: '/interview/new', query: { resumeId: resume.id } })"
              @rename="handleRename(resume)"
              @duplicate="handleDuplicate(resume.id)"
              @delete="handleDelete(resume)"
            />
          </div>
        </section>
    </div>


    <!-- 重命名对话框 -->
    <el-dialog v-model="showRenameDialog" title="重命名简历" width="var(--ui-dialog-width-sm)" align-center class="app-dialog">
      <el-input
        v-model="renameForm.title"
        placeholder="输入新名称"
        maxlength="50"
        show-word-limit
        @keydown.enter="onRenameEnter"
      />
      <template #footer>
        <el-button @click="showRenameDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmRename" :loading="renaming">
          确定
        </el-button>
      </template>
    </el-dialog>
    <SettingsCenter
      v-model="showSettings"
      :resumes="resumeList"
      :initial-section="settingsSection"
      @choose-directory="handleChooseStorageDirectory"
      @reauthorize-directory="handleReauthorizeStorageDirectory"
      @switch-to-browser="handleSwitchToBrowserStorage"
      @export-backup="handleExportBackup"
      @import-backup="handleImportData"
      @reset-all="handleResetData"
    />

    <MarkdownImportDialog :active="showMarkdownImport" v-model="showMarkdownImport" :loading="creating" @confirm="handleMarkdownImport" />
    <AiPdfImportDialog :active="showPdfImport" v-model="showPdfImport" :loading="creating" @confirm="handlePdfImport" />
    <ResumeVersionManager :active="showVersionManager" v-model="showVersionManager" :resumes="resumeList" @created="handleVersionCreated" />
    <FullBackupManager :active="showFullBackupManager" v-model="showFullBackupManager" @backup-success="handleFullBackupSuccess" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown, Plus, Upload, Document } from '@element-plus/icons-vue';
import AppHeader from '@/components/common/AppHeader.vue';
import { useWorkbenchStore } from '@/stores/workbench';
import { useStorageStore } from '@/stores/storage';
import { storageManager } from '@/services/storage/StorageManager';
import { exportToJSON, importFromJSON } from '@/utils/export-json';
import { imeSafeKeyHandler } from '@/utils/imeSafeKeys';
import ResumeCard from '@/components/workbench/ResumeCard.vue';
import SettingsCenter, { type SettingsSection } from '@/components/workbench/SettingsCenter.vue';
import { lazyFeature } from '@/utils/lazyFeature';
const MarkdownImportDialog = lazyFeature(() => import('@/components/workbench/MarkdownImportDialog.vue'));
const AiPdfImportDialog = lazyFeature(() => import('@/components/workbench/AiPdfImportDialog.vue'));
const ResumeVersionManager = lazyFeature(() => import('@/components/workbench/ResumeVersionManager.vue'));
const FullBackupManager = lazyFeature(() => import('@/components/workbench/FullBackupManager.vue'));
import { getFullBackupReminderStatus } from '@/utils/fullBackup';
import type { ResumeMeta } from '@/types/resume';
import { describeError } from '@/utils/globalErrorReporting';

const router = useRouter();
const route = useRoute();
const workbenchStore = useWorkbenchStore();
const storageStore = useStorageStore();

const loading = ref(false);
const showRenameDialog = ref(false);
const showSettings = ref(false);
const settingsSection = ref<SettingsSection>('ai');
const showMarkdownImport = ref(false);
const showPdfImport = ref(false);
const showVersionManager = ref(false);
const showFullBackupManager = ref(false);
const backupReminderDue = ref(false);
const backupReminderDismissed = ref(false);
const creating = ref(false);
const renaming = ref(false);


const renameForm = ref({
  id: '',
  title: '',
});

const resumeList = computed(() => workbenchStore.resumeList);
const hasResumes = computed(() => workbenchStore.hasResumes);
const resumeQuery = ref('');
const resumeSort = ref<'recent' | 'title'>('recent');
const activeResumeId = ref('');
const boardFocused = ref(false);
const visibleResumes = computed(() => {
  const query = resumeQuery.value.trim().toLocaleLowerCase();
  const matched = resumeList.value.filter((resume) => !query || resume.title.toLocaleLowerCase().includes(query));
  return [...matched].sort((left, right) => resumeSort.value === 'title'
    ? left.title.localeCompare(right.title, 'zh-CN')
    : right.updatedAt - left.updatedAt);
});

watch(visibleResumes, (list) => {
  if (!list.some((resume) => resume.id === activeResumeId.value)) activeResumeId.value = list[0]?.id || '';
}, { immediate: true });

function onBoardFocusOut(event: FocusEvent) {
  const next = event.relatedTarget;
  if (!(next instanceof Node) || !(event.currentTarget as HTMLElement).contains(next)) boardFocused.value = false;
}

function onBoardKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const cards = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.card-content')];
  const index = cards.findIndex((card) => card === document.activeElement);
  if (index < 0) return;
  const next = cards[index + (event.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

onMounted(async () => {
  if (route.query.aiSettings === '1') openSettings('ai');
  loading.value = true;
  try {
    // 初始化存储
    await storageStore.init();
    // 加载简历列表
    await workbenchStore.init();
  } catch (error) {
    ElMessage.error('加载失败: ' + (describeError(error)));
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

function openSettings(section: SettingsSection = 'ai') {
  settingsSection.value = section;
  showSettings.value = true;
}

function handleManageCommand(command: string) {
  if (command === 'versions') showVersionManager.value = true;
  else if (command === 'backup') showFullBackupManager.value = true;
  else if (command === 'settings') openSettings('storage');
}

function handleImportCommand(command: string) {
  if (command === 'markdown') showMarkdownImport.value = true;
  else if (command === 'pdf') showPdfImport.value = true;
}

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
    ElMessage.error('导入失败: ' + (describeError(error)));
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
    ElMessage.error('重命名失败: ' + (describeError(error)));
  } finally {
    renaming.value = false;
  }
};

// 输入法用 Enter 确认候选词（中文简历名很常见），不能当成「确定重命名」。
const onRenameEnter = imeSafeKeyHandler(() => { void confirmRename(); });

const handleDuplicate = async (id: string) => {
  try {
    const newId = await workbenchStore.duplicateResume(id);
    ElMessage.success('复制成功');
    router.push(`/editor/${newId}`);
  } catch (error) {
    ElMessage.error('复制失败: ' + (describeError(error)));
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
      ElMessage.error('删除失败: ' + (describeError(error)));
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
      ElMessage.error('导入失败: ' + (describeError(error)));
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
    ElMessage.error('PDF 导入失败: ' + (describeError(error)));
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

const handleExportBackup = async (resumeId: string) => {
  try {
    const data = await storageManager.read(resumeId);
    if (!data) throw new Error('所选简历不存在。');
    exportToJSON(data, `${data.title || 'resume'}-backup`);
    ElMessage.success('简历 JSON 备份已导出');
  } catch (error) {
    ElMessage.error('备份失败: ' + (describeError(error)));
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
    ElMessage.error('切换本地目录失败: ' + (describeError(error)));
  }
};

const handleReauthorizeStorageDirectory = async () => {
  try {
    const directoryName = await storageStore.reauthorizeFileSystem();
    await workbenchStore.init();
    ElMessage.success(`已重新授权本地目录（${directoryName}）并切换为该存储位置`);
  } catch (error) {
    ElMessage.error('重新授权失败: ' + (describeError(error)));
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
    if (error !== 'cancel') ElMessage.error('切换失败: ' + (describeError(error)));
  }
};
</script>

<style scoped>
.workbench-view {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--color-paper);
}

.workbench-content {
  width: 100%;
  max-width: var(--ui-content-max-width);
  margin: 0 auto;
  padding: var(--space-xl) var(--ui-page-gutter) var(--space-2xl);
}

/* The board: one row per resume, a 2px ink head rule. */
.board-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-md);
  padding-bottom: var(--space-sm);
}

.board-head h2,
.empty-copy h2,
.settings-page-heading h2 {
  text-wrap: balance;
}

.board-head h2 {
  font-size: var(--text-2xl);
  font-weight: 600;
}

.board-count {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  font-weight: 500;
}

.board-count strong {
  margin-right: var(--space-2xs);
  color: var(--color-ink);
  font-size: var(--text-2xl);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.board-tools {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  margin-bottom: var(--space-sm);
}

.board-tools :deep(.el-input) {
  max-width: 280px;
}

.board-empty-filter {
  margin: var(--space-lg) 0;
  color: var(--color-muted);
}

.board-columns {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) 10rem 8rem 48px;
  column-gap: var(--space-lg);
  padding: var(--space-xs) 0 var(--space-xs) var(--space-md);
  border-top: var(--rule-bar) solid var(--color-rule);
  border-bottom: var(--rule-bar) solid var(--color-rule);
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.board-columns span:first-child {
  grid-column: 1 / span 2;
}

.board-columns span:last-child {
  text-align: right;
}

.resume-grid {
  display: flex;
  flex-direction: column;
}

/* Loading: rows in the shape of what is coming. */
.loading-state {
  display: flex;
  flex-direction: column;
  border-top: var(--rule-bar) solid var(--color-rule);
}

.skeleton-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-md);
  border-bottom: var(--rule-hair) solid var(--color-rule);
}

.skeleton-sheet {
  aspect-ratio: 210 / 297;
  background: var(--color-paper-2);
}

.skeleton-line {
  width: min(320px, 60%);
  height: var(--space-md);
  background: var(--color-paper-2);
}

/* Empty: what is empty and the actions that fill it. */
.empty-board {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-xl);
  padding: var(--space-xl) 0;
  border-top: var(--rule-bar) solid var(--color-rule);
  border-bottom: var(--rule-hair) solid var(--color-rule);
}

.empty-sheet {
  aspect-ratio: 210 / 297;
  border: var(--rule-bar) dashed var(--color-muted);
  background: var(--color-paper-3);
}

.empty-copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  min-width: 0;
}

.empty-copy h2 {
  max-width: 24ch;
  font-size: var(--text-xl);
  font-weight: 600;
  line-height: 1.25;
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.empty-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.backup-reminder {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-md);
  margin-bottom: var(--space-xl);
  padding: var(--space-sm) var(--space-md);
  border: var(--rule-hair) solid color-mix(in oklab, var(--color-warning) 40%, transparent);
  border-radius: var(--radius-card);
  background: var(--color-warning-wash);
  color: var(--color-ink);
}

.backup-reminder span {
  flex: 1 1 240px;
  font-size: var(--text-sm);
  font-weight: 500;
}

.backup-reminder :deep(.el-button + .el-button) {
  margin-left: 0;
}

@media (max-width: 768px) {
  .workbench-content {
    padding: var(--space-lg) var(--ui-page-gutter);
  }

  .board-columns {
    display: none;
  }

  .resume-grid {
    border-top: var(--rule-bar) solid var(--color-rule);
  }

  .empty-board {
    grid-template-columns: 88px minmax(0, 1fr);
    gap: var(--space-md);
  }


}

@media (max-width: 420px) {
  .empty-board {
    grid-template-columns: minmax(0, 1fr);
  }

  .empty-sheet {
    display: none;
  }
}
</style>
