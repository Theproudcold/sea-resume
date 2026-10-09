<template>
  <div class="editor-view">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-wrapper">
      <el-icon class="is-loading" :size="48"><Loading /></el-icon>
      <p class="mt-4">加载简历中...</p>
    </div>

    <!-- 编辑器主体 -->
    <template v-else>
      <AppHeader
        :title="privacyMode ? '匿名简历' : (data.title || '简历编辑')"
        subtitle="编辑与预览"
        show-back
        @back="handleBack"
      >
        <template #context>
          <div class="editor-status" aria-live="polite">
            <el-tag v-if="saveStatus === 'saving'" effect="plain">保存中…</el-tag>
            <el-tag v-else-if="saveStatus === 'error'" type="danger" effect="plain" :title="saveError || ''">保存失败</el-tag>
            <el-tag v-else type="success" effect="plain">已保存</el-tag>
            <el-button v-if="saveStatus === 'error'" size="small" type="danger" plain @click="retrySave">重试保存</el-button>
            <el-tag v-if="privacyMode" type="warning" effect="plain">预览及打印已脱敏</el-tag>
          </div>
        </template>
        <template #actions>
          <el-button type="primary" plain :disabled="privacyMode" @click="showAiAssistant = true">AI 助手</el-button>
          <el-button :type="privacyMode ? 'warning' : 'default'" plain @click="togglePrivacyMode">{{ privacyMode ? '关闭隐私打码' : '隐私打码' }}</el-button>
          <el-button text :disabled="!canUndo" aria-label="撤销" title="撤销 (Ctrl/⌘+Z)" @click="undoEdit">撤销</el-button>
          <el-button text :disabled="!canRedo" aria-label="重做" title="重做 (Ctrl/⌘+Shift+Z)" @click="redoEdit">重做</el-button>
          <el-button plain @click="showQualityPanel = true">质量检查 {{ qualityIssues.length }}</el-button>
          <el-button plain @click="showShortcutHelp = true">快捷键</el-button>
          <el-button v-if="aiUndoSnapshot" text type="primary" @click="undoAiChanges">撤销 AI 修改</el-button>
          <el-button @click="showFullscreen = true" :icon="FullScreen">全屏预览</el-button>
          <el-button @click="goToTemplates" :icon="Grid">模板选择</el-button>
          <el-dropdown @command="handleCommand">
            <el-button type="primary">
              导入与导出<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="import"><el-icon><Upload /></el-icon>从 JSON 恢复为副本</el-dropdown-item>
                <el-dropdown-item command="pdf"><el-icon><Document /></el-icon>导出为 PDF</el-dropdown-item>
                <el-dropdown-item command="image"><el-icon><Picture /></el-icon>导出为图片</el-dropdown-item>
                <el-dropdown-item command="json"><el-icon><Folder /></el-icon>导出为 JSON</el-dropdown-item>
                <el-dropdown-item command="markdown"><el-icon><Document /></el-icon>导出为 Markdown</el-dropdown-item>
                <el-dropdown-item command="reset" divided class="danger-menu-item"><el-icon><RefreshRight /></el-icon>重置当前简历</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </AppHeader>


      <!-- 移动端 Tab 切换 -->
      <div class="mobile-tabs">
        <el-radio-group v-model="activeTab" class="w-full">
          <el-radio-button value="edit" class="w-1/2">编辑</el-radio-button>
          <el-radio-button value="preview" class="w-1/2">预览</el-radio-button>
        </el-radio-group>
      </div>

      <div class="editor-container">
        <EditorPanel class="no-print" :class="{ 'mobile-hidden': activeTab === 'preview', 'privacy-hidden': privacyMode }" />
        <PreviewPanel :privacy-mode="privacyMode" :class="{ 'mobile-hidden': activeTab === 'edit' }" />
      </div>

      <!-- 全屏预览对话框 -->
      <el-dialog
        v-model="showFullscreen"
        title="全屏预览"
        fullscreen
        :show-close="true"
        class="fullscreen-dialog no-print"
      >
        <div class="fullscreen-preview">
          <ResumeCanvas>
            <component :is="currentTemplate" v-if="currentTemplate" :data="previewData" />
          </ResumeCanvas>
        </div>
      </el-dialog>
      <AiAssistantPanel
        :visible="showAiAssistant"
        :resume="data"
        :undo-available="!!aiUndoSnapshot"
        @update:visible="showAiAssistant = $event"
        @apply="applyAiChanges"
        @undo="undoAiChanges"
      />
      <ResumeQualityPanel v-model="showQualityPanel" :issues="qualityIssues" @navigate="jumpToQualitySection" />
      <el-dialog v-model="showShortcutHelp" title="编辑快捷键" width="min(420px, calc(100vw - 32px))">
        <ul class="shortcut-list">
          <li><kbd>Ctrl / ⌘ + S</kbd><span>立即保存</span></li>
          <li><kbd>Ctrl / ⌘ + Z</kbd><span>撤销</span></li>
          <li><kbd>Ctrl + Y / ⌘ + Shift + Z</kbd><span>重做</span></li>
        </ul>
      </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElLoading, ElMessageBox } from 'element-plus';
import { Loading, FullScreen, Grid, ArrowDown, Document, Folder, Picture, Upload, RefreshRight } from '@element-plus/icons-vue';
import { useResumeStore } from '@/stores/resume';
import { useWorkbenchStore } from '@/stores/workbench';
import { getTemplateComponent } from '@/components/preview/template-registry';
import { exportToImage } from '@/utils/export-image';
import { exportToJSON, importFromJSON } from '@/utils/export-json';
import { resumeToMarkdown, downloadMarkdown } from '@/utils/markdown/exportResumeMarkdown';
import AppHeader from '@/components/common/AppHeader.vue';
import EditorPanel from '@/components/editor/EditorPanel.vue';
import PreviewPanel from '@/components/preview/PreviewPanel.vue';
import ResumeCanvas from '@/components/preview/ResumeCanvas.vue';
import type { ResumeData } from '@/types/resume';
import type { ResumeAiOperation } from '@/types/ai';
import { applyResumeAiOperations } from '@/services/ai/resumeTools';
import AiAssistantPanel from '@/components/editor/AiAssistantPanel.vue';
import { createPrivacyMaskedResume } from '@/utils/privacyMask';
import ResumeQualityPanel from '@/components/editor/ResumeQualityPanel.vue';
import { checkResumeQuality } from '@/utils/resumeQuality';
import { resolveEditorShortcut } from '@/utils/editorShortcuts';

const route = useRoute();
const router = useRouter();
const resumeStore = useResumeStore();
const workbenchStore = useWorkbenchStore();
const { data, saveStatus, saveError, canUndo, canRedo } = storeToRefs(resumeStore);

const loading = ref(true);
const showFullscreen = ref(false);
const activeTab = ref<'edit' | 'preview'>('edit');
const showAiAssistant = ref(false);
const aiUndoSnapshot = ref<ResumeData | null>(null);
const privacyMode = ref(false);
const showQualityPanel = ref(false);
const showShortcutHelp = ref(false);

const previewData = computed(() => privacyMode.value ? createPrivacyMaskedResume(data.value) : data.value);
const qualityIssues = computed(() => checkResumeQuality(data.value));
const togglePrivacyMode = () => {
  privacyMode.value = !privacyMode.value;
  if (privacyMode.value) {
    activeTab.value = 'preview';
    showAiAssistant.value = false;
  }
};


const currentTemplate = computed(() => {
  return getTemplateComponent(data.value.templateId);
});

let routeLoadGeneration = 0;
watch(() => route.params.id, async (routeId) => {
  const generation = ++routeLoadGeneration;
  const id = typeof routeId === 'string' ? routeId : '';
  loading.value = true;
  showFullscreen.value = false;
  showAiAssistant.value = false;
  aiUndoSnapshot.value = null;
  showQualityPanel.value = false;
  privacyMode.value = false;
  activeTab.value = 'edit';

  if (!id) {
    ElMessage.error('简历 ID 不存在');
    router.push('/');
    return;
  }

  try {
    await resumeStore.loadResume(id);
  } catch (error) {
    if (generation !== routeLoadGeneration) return;
    ElMessage.error('加载简历失败: ' + (error instanceof Error ? error.message : '未知错误'));
    router.push('/');
  } finally {
    if (generation === routeLoadGeneration) loading.value = false;
  }
}, { immediate: true });
const onEditorKeydown = (event: KeyboardEvent) => {
  const action = resolveEditorShortcut(event);
  if (!action) return;
  const target = event.target as HTMLElement | null;
  const isEditingText = !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable || !!target.closest('.ql-editor'));
  if (isEditingText && action !== 'save') return;
  event.preventDefault();
  if (action === 'save') void retrySave();
  else if (action === 'undo') void undoEdit();
  else void redoEdit();
};
onMounted(() => window.addEventListener('keydown', onEditorKeydown));
onUnmounted(() => window.removeEventListener('keydown', onEditorKeydown));

const handleBack = () => {
  router.push('/');
};

const goToTemplates = () => {
  router.push({ path: '/templates', query: { resumeId: String(route.params.id) } });
};

const applyAiChanges = async (operations: ResumeAiOperation[]) => {
  const previous = resumeStore.exportData();
  try {
    const updated = applyResumeAiOperations(previous, operations);
    await resumeStore.importData(updated);
    aiUndoSnapshot.value = previous;
    ElMessage.success('AI 修改已应用；可从助手面板撤销。');
  } catch (error) {
    ElMessage.error('AI 修改未保存: ' + (error instanceof Error ? error.message : '未知错误'));
  }
};

const undoAiChanges = async () => {
  const snapshot = aiUndoSnapshot.value;
  if (!snapshot) return;
  try {
    await resumeStore.importData(snapshot);
    aiUndoSnapshot.value = null;
    ElMessage.success('已撤销上一批 AI 修改');
  } catch (error) {
    ElMessage.error('撤销失败: ' + (error instanceof Error ? error.message : '未知错误'));
  }
};

async function retrySave() {
  try { await resumeStore.retrySave(); }
  catch (error) { ElMessage.error(`保存失败：${error instanceof Error ? error.message : '未知错误'}`); }
}

async function undoEdit() {
  try { await resumeStore.undo(); }
  catch (error) { ElMessage.error(`撤销失败：${error instanceof Error ? error.message : '未知错误'}`); }
}

async function redoEdit() {
  try { await resumeStore.redo(); }
  catch (error) { ElMessage.error(`重做失败：${error instanceof Error ? error.message : '未知错误'}`); }
}

async function jumpToQualitySection(section: 'basic' | 'experience' | 'projects' | 'education') {
  showQualityPanel.value = false;
  activeTab.value = 'edit';
  resumeStore.setActiveSection(section);
  await nextTick();
  window.setTimeout(() => document.getElementById(section === 'basic' ? 'editor-section-basic' : `editor-section-${section}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
}

const handleCommand = async (type: 'pdf' | 'image' | 'json' | 'markdown' | 'print' | 'import' | 'reset') => {
  if (type === 'import') {
    try {
      const imported = await importFromJSON();
      const id = await workbenchStore.createResumeFromData(imported, `${imported.title || '导入的简历'} (副本)`, imported.templateId);
      ElMessage.success('已恢复为一份新简历副本');
      router.push(`/editor/${id}`);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== '未选择文件') {
        ElMessage.error('导入失败: ' + (error instanceof Error ? error.message : '未知错误'));
      }
    }
    return;
  }

  if (type === 'reset') {
    try {
      await ElMessageBox.confirm(
        `确定将「${data.value.title || data.value.basic.name || '当前简历'}」恢复为默认内容吗？其他简历不会受影响。`,
        '重置当前简历',
        { confirmButtonText: '恢复默认内容', cancelButtonText: '取消', type: 'warning' },
      );
      resumeStore.reset();
      ElMessage.success('当前简历已恢复默认内容');
    } catch {
      // Cancelled
    }
    return;
  }
  if (type === 'markdown') {
    downloadMarkdown(resumeToMarkdown(data.value), data.value.title || data.value.basic.name || 'resume');
    ElMessage.success('Markdown 已导出');
    return;
  }

  if (type === 'pdf' || type === 'print') {
    ElMessage.info('请在打印面板选择“存储为 PDF”，并确认纸张为 A4。');
    window.print();
    return;
  }

  const loadingInstance = ElLoading.service({
    lock: true,
    text: '正在处理...',
    background: 'rgba(0, 0, 0, 0.7)',
  });

  const filename = data.value.title || data.value.basic.name || 'resume';

  try {
    switch (type) {
      case 'image':
        await exportToImage('.resume-canvas', filename, 'png');
        ElMessage.success('图片导出成功！');
        break;
      case 'json':
        exportToJSON(data.value, filename);
        ElMessage.success('JSON 导出成功！');
        break;
    }
  } catch (error) {
    console.error('操作失败:', error);
    ElMessage.error('操作失败，请重试');
  } finally {
    loadingInstance.close();
  }
};
</script>

<style scoped>
.editor-view {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.loading-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  height: 100dvh;
  color: var(--ui-text-secondary);
}

.editor-container {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.mobile-tabs {
  display: none;
  flex-shrink: 0;
  background: var(--ui-bg-surface);
  padding: var(--ui-space-3) var(--ui-page-gutter);
  border-bottom: 1px solid var(--ui-border);
}

.mobile-tabs :deep(.el-radio-group) {
  display: flex;
  width: 100%;
}

.mobile-tabs :deep(.el-radio-button) {
  flex: 1;
}

.mobile-tabs :deep(.el-radio-button__inner) {
  width: 100%;
}

@media (max-width: 1024px) {
  .mobile-tabs {
    display: block;
  }

  .editor-container {
    flex-direction: column;
  }

  .mobile-hidden {
    display: none !important;
  }
}

.privacy-hidden {
  display: none !important;
}


@media print {
  .editor-view {
    height: auto;
  }

  .editor-container {
    display: block;
  }
}

.fullscreen-preview {
  height: 100%;
  overflow-y: auto;
  background: var(--ui-bg-page);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: var(--ui-space-4);
}

:deep(.fullscreen-dialog .el-dialog__body) {
  padding: 0;
  height: calc(100dvh - 54px);
}
.editor-status { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.shortcut-list { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
.shortcut-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.shortcut-list kbd { padding: 3px 7px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-sm); background: var(--ui-bg-subtle); font-size: var(--ui-font-sm); }
</style>
