<template>
  <div class="editor-view">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-wrapper">
      <el-icon class="is-loading" :size="48"><Loading /></el-icon>
      <p class="mt-4">加载简历中…</p>
    </div>

    <!-- 编辑器主体 -->
    <template v-else>
      <AppHeader
        :title="privacyMode ? '匿名简历' : (data.title || '简历编辑')"
        subtitle="编辑与预览"
        show-back
        back-label="简历工作台"
        inline-toolbar
        :editable-title="!privacyMode"
        @back="handleBack"
        @update:title="handleResumeTitleUpdate"
      >
        <template #context>
          <div class="editor-status" aria-live="polite">
            <el-tag v-if="saveStatus === 'saving'" effect="plain">保存中…</el-tag>
            <el-tag v-else-if="saveStatus === 'error'" type="danger" effect="plain" :title="saveError || ''">保存失败</el-tag>
            <el-tag v-else type="success" effect="plain">已保存</el-tag>
            <el-tag v-if="privacyMode" type="warning" effect="plain">预览及打印已脱敏</el-tag>
            <el-button v-if="saveStatus === 'error'" size="small" type="danger" plain @click="retrySave">重试</el-button>
          </div>
        </template>
        <template #toolbar>
          <div class="editor-toolbar">
            <div class="editor-toolbar__group" role="group" aria-label="编辑">
              <el-button link :disabled="!canUndo" aria-label="撤销" title="撤销 (Ctrl/⌘+Z)" @click="undoEdit">撤销</el-button>
              <el-button link :disabled="!canRedo" aria-label="重做" title="重做 (Ctrl/⌘+Shift+Z)" @click="redoEdit">重做</el-button>
            </div>
            <div class="editor-toolbar__group" role="group" aria-label="检查">
              <el-button v-if="qualityIssues.length" link @click="showQualityPanel = true">{{ qualityButtonLabel }}</el-button>
            </div>
            <div class="editor-toolbar__group" role="group" aria-label="去向">
              <el-button link :disabled="privacyMode" @click="showAiAssistant = true">AI 助手</el-button>
              <el-button link :disabled="privacyMode" @click="router.push({ path: '/interview/new', query: { resumeId: data.id } })">模拟面试</el-button>
              <el-button link @click="goToTemplates">模板</el-button>
            </div>
            <el-dropdown @command="handleHeaderMenuCommand">
              <el-button link>更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="privacy"><el-icon><Hide /></el-icon>{{ privacyMode ? '关闭隐私打码' : '隐私打码' }}</el-dropdown-item>
                  <el-dropdown-item command="quality"><el-icon><CircleCheck /></el-icon>质量检查</el-dropdown-item>
                  <el-dropdown-item command="external-ai" :disabled="privacyMode"><el-icon><Connection /></el-icon>外部 AI · Codex / Claude Code</el-dropdown-item>
                  <el-dropdown-item command="shortcuts"><el-icon><Key /></el-icon>快捷键</el-dropdown-item>
                  <el-dropdown-item command="fullscreen"><el-icon><FullScreen /></el-icon>全屏预览</el-dropdown-item>
                  <el-dropdown-item command="save-template" :disabled="privacyMode"><el-icon><Collection /></el-icon>存为模板</el-dropdown-item>
                  <el-dropdown-item v-if="aiUndoSnapshot" command="undo-ai"><el-icon><RefreshLeft /></el-icon>撤销 AI 修改</el-dropdown-item>
                  <el-dropdown-item command="import" divided><el-icon><Upload /></el-icon>导入 JSON 副本</el-dropdown-item>
                  <el-dropdown-item command="reset" divided class="danger-menu-item"><el-icon><RefreshRight /></el-icon>重置当前简历</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-dropdown @command="handleCommand">
              <el-button type="primary">导出<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="pdf"><el-icon><Document /></el-icon>导出为 PDF（与预览一致）</el-dropdown-item>
                  <el-dropdown-item command="searchable-pdf"><el-icon><Document /></el-icon>导出可搜索 PDF（独立排版）</el-dropdown-item>
                  <el-dropdown-item command="print"><el-icon><Printer /></el-icon>打印预览…</el-dropdown-item>
                  <el-dropdown-item command="image"><el-icon><Picture /></el-icon>导出为图片</el-dropdown-item>
                  <el-dropdown-item command="json"><el-icon><Folder /></el-icon>导出为 JSON</el-dropdown-item>
                  <el-dropdown-item command="markdown"><el-icon><Document /></el-icon>导出为 Markdown</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </AppHeader>


      <!-- 布局工具栏：明确标出三个栏目，并提供恢复到默认 -->
      <div v-if="!compact && !privacyMode" class="layout-bar no-print" role="group" aria-label="布局与栏宽">
        <span class="layout-bar__label" aria-hidden="true">布局</span>
        <div class="layout-bar__keys">
          <button
            v-for="pane in layoutPanes"
            :key="pane.id"
            type="button"
            class="layout-bar__key"
            :class="{ 'is-on': pane.visible }"
            :aria-pressed="pane.visible"
            :aria-label="pane.name"
            :title="pane.visible ? `隐藏${pane.name}` : `显示${pane.name}`"
            :disabled="!canToggle(pane.id)"
            @click="togglePane(pane.id)"
          >
            <el-icon aria-hidden="true"><component :is="pane.icon" /></el-icon>
            <span>{{ pane.name }}</span>
          </button>
        </div>
        <button type="button" class="layout-bar__reset" aria-label="恢复默认布局" title="恢复默认布局" @click="resetLayout">
          <el-icon aria-hidden="true"><RefreshRight /></el-icon>
          <span>恢复默认布局</span>
        </button>
      </div>

      <!-- 窄屏：编辑 / 预览切换；预览时仍能点模块名回到编辑 -->
      <div class="mobile-tabs">
        <el-radio-group v-model="activeTab" class="w-full">
          <el-radio-button value="edit" class="w-1/2">编辑</el-radio-button>
          <el-radio-button value="preview" class="w-1/2">预览</el-radio-button>
        </el-radio-group>
        <nav v-if="activeTab === 'preview' && !privacyMode" class="mobile-section-nav" aria-label="简历模块">
          <button
            v-for="section in mobileSections"
            :key="section.id"
            type="button"
            :aria-current="resumeStore.activeSection === section.id ? 'true' : undefined"
            @click="openMobileSection(section.id)"
          >
            {{ section.title }}
          </button>
        </nav>
      </div>

      <div ref="editorContainerRef" class="editor-container">
        <EditorPanel :key="String(route.params.id)" :preview-navigation-key="previewNavigationKey" class="no-print" :class="{ 'mobile-hidden': activeTab === 'preview', 'mobile-active': activeTab === 'edit', 'privacy-hidden': privacyMode }" />
        <PanelSplitter
          v-if="!compact && !privacyMode"
          label="调整编辑区宽度"
          :collapsed="!editorVisible"
          :resizable="previewVisible"
          :toggleable="canToggle('editor')"
          :align="previewVisible ? 'center' : 'end'"
          :value="resolved.editorWidth"
          :min="EDITOR_WIDTH_MIN"
          :max="maxEditorWidth"
          collapse-title="折叠编辑区"
          expand-title="展开编辑区"
          @resize="resizeEditor"
          @toggle="togglePane('editor')"
          @reset="resetLayout"
        />
        <PreviewPanel v-show="previewVisible || privacyMode" :privacy-mode="privacyMode" :class="{ 'mobile-hidden': activeTab === 'edit', 'mobile-active': activeTab === 'preview' }" />
      </div>

      <!-- 全屏预览对话框 -->
      <el-dialog
        v-model="showFullscreen"
        title="全屏预览"
        fullscreen
        destroy-on-close
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
        ref="aiAssistantRef"
        v-if="showAiAssistant"
        :visible="showAiAssistant"
        :resume="data"
        :undo-available="!!aiUndoSnapshot"
        @update:visible="showAiAssistant = $event"
        @apply="applyAiChanges"
        @undo="undoAiChanges"
        @configure="openAiSettings"
        @applied="router.push(`/editor/${$event}`)"
      />
      <ExternalAiPanel v-if="showExternalAi" :visible="showExternalAi" @update:visible="showExternalAi = $event" />
      <el-dialog v-model="showAiSettings" title="AI 模型配置" width="var(--ui-dialog-width-md)" align-center class="app-dialog ai-model-dialog">
        <AiProviderSettingsPanel @saved="handleAiSettingsSaved" />
      </el-dialog>
      <ResumeQualityPanel v-model="showQualityPanel" :issues="qualityIssues" @navigate="(section, target) => jumpToQualitySection(section, target)" />
      <SaveAsTemplateDialog
        :visible="showSaveTemplate"
        :default-name="data.title || '我的简历模板'"
        :saving="savingTemplate"
        @update:visible="showSaveTemplate = $event"
        @save="saveCurrentAsTemplate"
      />
      <el-dialog v-model="showShortcutHelp" title="编辑快捷键" width="var(--ui-dialog-width-sm)" align-center>
        <ul class="shortcut-list">
          <li><kbd>Ctrl / ⌘ + S</kbd><span>立即保存</span></li>
          <li><kbd>Ctrl / ⌘ + Z</kbd><span>撤销</span></li>
          <li><kbd>Ctrl + Y / ⌘ + Shift + Z</kbd><span>重做</span></li>
          <li><kbd>[</kbd><span>上一个模块</span></li>
          <li><kbd>]</kbd><span>下一个模块</span></li>
          <li><kbd>?</kbd><span>打开这份说明</span></li>
        </ul>
      </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick, watch, defineAsyncComponent, markRaw } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { ElMessage, ElLoading, ElMessageBox } from 'element-plus';
import { Loading, FullScreen, Grid, Collection, EditPen, ArrowDown, Document, Folder, Picture, Upload, RefreshRight, RefreshLeft, View, Hide, Printer, CircleCheck, Connection, Key } from '@element-plus/icons-vue';
import { useResumeStore } from '@/stores/resume';
import { useTemplateStore } from '@/stores/template';
import { useWorkbenchStore } from '@/stores/workbench';
import SaveAsTemplateDialog from '@/components/template-gallery/SaveAsTemplateDialog.vue';
import { getTemplateComponent } from '@/components/preview/template-registry';
import { exportToImage } from '@/utils/export-image';
import { exportPreviewToPDF, exportToPDF } from '@/utils/export-pdf';
import { exportToJSON, importFromJSON } from '@/utils/export-json';
import { resumeToMarkdown, downloadMarkdown } from '@/utils/markdown/exportResumeMarkdown';
import AppHeader from '@/components/common/AppHeader.vue';
import PanelSplitter from '@/components/common/PanelSplitter.vue';
import EditorPanel from '@/components/editor/EditorPanel.vue';
import PreviewPanel from '@/components/preview/PreviewPanel.vue';
import ResumeCanvas from '@/components/preview/ResumeCanvas.vue';
import { useEditorLayout } from '@/composables/useEditorLayout';
import { EDITOR_WIDTH_MIN } from '@/utils/editorLayout';
import type { ResumeData } from '@/types/resume';
import type { ResumeChangeProposal } from '@/services/ai/changeProposal';
import { lazyFeature } from '@/utils/lazyFeature';
const AiAssistantPanel = defineAsyncComponent(() => import('@/components/editor/AiAssistantPanel.vue'));
const AiProviderSettingsPanel = lazyFeature(() => import('@/components/workbench/AiProviderSettingsPanel.vue'));
const ExternalAiPanel = defineAsyncComponent(() => import('@/components/ai/ExternalAiPanel.vue'));
import { createPrivacyMaskedResume } from '@/utils/privacyMask';
import ResumeQualityPanel from '@/components/editor/ResumeQualityPanel.vue';
import { checkResumeQuality, type ResumeQualityIssue } from '@/utils/resumeQuality';
import { focusQualityTarget, waitForElement } from '@/utils/focusQualityTarget';
import { resolveEditorShortcut } from '@/utils/editorShortcuts';
import { describeError } from '@/utils/globalErrorReporting';

const route = useRoute();
const router = useRouter();
const resumeStore = useResumeStore();
const templateStore = useTemplateStore();
const workbenchStore = useWorkbenchStore();
const { data, saveStatus, saveError, canUndo, canRedo } = storeToRefs(resumeStore);

const loading = ref(true);
const showFullscreen = ref(false);
const activeTab = ref<'edit' | 'preview'>('edit');
const previewNavigationKey = ref(0);

// 三栏宽度、折叠与 A4 优先策略；容器宽度由 ResizeObserver 同步。
const {
  compact,
  resolved,
  maxEditorWidth,
  paneVisible,
  canToggle,
  togglePane,
  resizeEditor,
  resetLayout,
  setPreviewVisible,
  observeContainer,
} = useEditorLayout();
const editorContainerRef = ref<HTMLElement | null>(null);
const sidebarVisible = computed(() => paneVisible('sidebar'));
const editorVisible = computed(() => paneVisible('editor'));
const previewVisible = computed(() => paneVisible('preview'));
const layoutPanes = computed(() => [
  { id: 'sidebar' as const, name: '模块导航', visible: sidebarVisible.value, icon: markRaw(Grid) },
  { id: 'editor' as const, name: '编辑区', visible: editorVisible.value, icon: markRaw(EditPen) },
  { id: 'preview' as const, name: '预览区', visible: previewVisible.value, icon: markRaw(View) },
]);

const showAiAssistant = ref(false);
const showExternalAi = ref(false);
const aiAssistantRef = ref<{ beforeClose: () => Promise<boolean> }>();
const showAiSettings = ref(false);
const aiUndoSnapshot = ref<ResumeData | null>(null);
const privacyMode = ref(false);
const showQualityPanel = ref(false);
const showShortcutHelp = ref(false);
const showSaveTemplate = ref(false);
const savingTemplate = ref(false);

const unsubscribePreviewNavigation = resumeStore.$onAction(({ name }) => {
  if (name !== 'setActiveSection' || activeTab.value !== 'preview' || privacyMode.value) return;
  previewNavigationKey.value += 1;
  activeTab.value = 'edit';
});

const previewData = computed(() => privacyMode.value ? createPrivacyMaskedResume(data.value) : data.value);
const qualityIssues = computed(() => checkResumeQuality(data.value));
const qualityWarningCount = computed(() => qualityIssues.value.filter((issue) => issue.severity === 'warning').length);
/** Only real problems justify "质量问题"; suggestions alone must not look like errors. */
const qualityButtonLabel = computed(() => qualityWarningCount.value
  ? `质量问题 ${qualityIssues.value.length}`
  : `${qualityIssues.value.length} 项建议`);
// Bumped on every jump and on unmount so an outdated retry loop stops touching a stale page.
let qualityJumpToken = 0;
const togglePrivacyMode = () => {
  privacyMode.value = !privacyMode.value;
  if (privacyMode.value) {
    activeTab.value = 'preview';
    showAiAssistant.value = false;
    showExternalAi.value = false;
  }
};

function openAiSettings() {
  showAiAssistant.value = false;
  showAiSettings.value = true;
}

function handleAiSettingsSaved() {
  showAiSettings.value = false;
  showAiAssistant.value = true;
}


const currentTemplate = computed(() => {
  return getTemplateComponent(data.value.templateId);
});

// 三栏容器只在简历加载完成后挂载，因此用 ref 监听宽度变化。
let disconnectContainerObserver: (() => void) | null = null;
watch(editorContainerRef, (element) => {
  disconnectContainerObserver?.();
  disconnectContainerObserver = element ? observeContainer(element) : null;
}, { flush: 'post' });
onUnmounted(() => {
  disconnectContainerObserver?.();
  disconnectContainerObserver = null;
  qualityJumpToken++;
});

let routeLoadGeneration = 0;
watch(() => route.params.id, async (routeId) => {
  const generation = ++routeLoadGeneration;
  const id = typeof routeId === 'string' ? routeId : '';
  loading.value = true;
  showFullscreen.value = false;
  showAiAssistant.value = false;
  showExternalAi.value = false;
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
    ElMessage.error('加载简历失败: ' + (describeError(error)));
    router.push('/');
  } finally {
    if (generation === routeLoadGeneration) loading.value = false;
  }
}, { immediate: true });
const sectionNavOrder = computed(() => ['theme', 'basic', ...data.value.sectionOrder]);
const mobileSections = computed(() => sectionNavOrder.value.map((id) => ({
  id,
  title: id === 'theme' ? '主题设置' : id === 'basic' ? '基础信息' : (data.value.sectionTitles?.[id] || data.value.customBlocks.find((block) => block.id === id)?.title || '未命名模块'),
})));
function openMobileSection(id: string) {
  activeTab.value = 'edit';
  resumeStore.setActiveSection(id);
}
const onEditorKeydown = (event: KeyboardEvent) => {
  const action = resolveEditorShortcut(event);
  if (!action) return;
  const target = event.target as HTMLElement | null;
  const isEditingText = !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable || !!target.closest('.ql-editor'));
  if (isEditingText && action !== 'save') return;
  if (privacyMode.value && action !== 'save' && action !== 'undo' && action !== 'redo') return;
  event.preventDefault();
  if (action === 'save') void retrySave();
  else if (action === 'undo') void undoEdit();
  else if (action === 'redo') void redoEdit();
  else if (action === 'shortcut-help') showShortcutHelp.value = true;
  else stepSection(action === 'next-section' ? 1 : -1);
};
function stepSection(delta: number) {
  const order = sectionNavOrder.value;
  if (!order.length) return;
  const current = order.indexOf(resumeStore.activeSection || '');
  const next = order[(current < 0 ? 0 : current + delta + order.length) % order.length];
  if (next) resumeStore.setActiveSection(next);
}
onMounted(() => window.addEventListener('keydown', onEditorKeydown));
onUnmounted(() => window.removeEventListener('keydown', onEditorKeydown));
onUnmounted(unsubscribePreviewNavigation);

const flushBeforeNavigation = async () => {
  if (showAiAssistant.value && await aiAssistantRef.value?.beforeClose() === false) return false;
  try {
    await resumeStore.flushSave();
    return true;
  } catch (error) {
    ElMessage.error(`保存失败，已留在编辑页：${describeError(error)}`);
    return false;
  }
};
onBeforeRouteLeave(flushBeforeNavigation);
onBeforeRouteUpdate(async (to, from) => to.params.id === from.params.id || await flushBeforeNavigation());
const saveWhenHidden = () => {
  if (document.visibilityState === 'hidden') void resumeStore.flushSave().catch(() => undefined);
};
const warnBeforeUnload = (event: BeforeUnloadEvent) => {
  if (saveStatus.value === 'saved') return;
  void resumeStore.flushSave().catch(() => undefined);
  event.preventDefault();
  event.returnValue = '';
};
onMounted(() => {
  document.addEventListener('visibilitychange', saveWhenHidden);
  window.addEventListener('beforeunload', warnBeforeUnload);
});
onUnmounted(() => {
  document.removeEventListener('visibilitychange', saveWhenHidden);
  window.removeEventListener('beforeunload', warnBeforeUnload);
});

async function settlePreview() {
  await nextTick();
  const animations = document.querySelector('.editor-container')?.getAnimations?.({ subtree: true }) ?? [];
  await Promise.all(animations.filter((animation) =>
    Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)),
  ).map((animation) => animation.finished.catch(() => undefined)));
}


const handleBack = () => {
  router.push('/');
};

const goToTemplates = () => {
  router.push({ path: '/templates', query: { resumeId: String(route.params.id) } });
};

const applyAiChanges = async (proposal: ResumeChangeProposal, done: (saved: boolean) => void) => {
  const previous = resumeStore.exportData();
  try {
    await resumeStore.applyChangeProposal(proposal);
    aiUndoSnapshot.value = previous;
    ElMessage.success('AI 修改已应用；可从助手面板撤销。');
    done(true);
  } catch (error) {
    ElMessage.error('AI 修改未保存: ' + (describeError(error)));
    done(false);
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
    ElMessage.error('撤销失败: ' + (describeError(error)));
  }
};

async function retrySave() {
  try { await resumeStore.retrySave(); }
  catch (error) { ElMessage.error(`保存失败：${describeError(error)}`); }
}

async function undoEdit() {
  try { await resumeStore.undo(); }
  catch (error) { ElMessage.error(`撤销失败：${describeError(error)}`); }
}

async function redoEdit() {
  try { await resumeStore.redo(); }
  catch (error) { ElMessage.error(`重做失败：${describeError(error)}`); }
}

/** Closes the panel, opens the section and reveals the issue's field once the editor has mounted it. */
async function jumpToQualitySection(section: ResumeQualityIssue['section'], target: string | null) {
  const token = ++qualityJumpToken;
  showQualityPanel.value = false;
  activeTab.value = 'edit';
  resumeStore.setActiveSection(section);
  await nextTick();
  const root = await waitForElement(
    () => document.getElementById(`editor-section-${section}`),
    { timeoutMs: 300, isCancelled: () => token !== qualityJumpToken },
  );
  if (!root || token !== qualityJumpToken) return;
  await focusQualityTarget(root, target);
}

const handleResumeTitleUpdate = async (title: string) => {
  const nextTitle = title.trim();
  const resumeId = typeof route.params.id === 'string' ? route.params.id : '';
  if (!nextTitle || !resumeId || nextTitle === data.value.title) return;

  resumeStore.updateTitle(nextTitle);
  try {
    await resumeStore.flushSave();
    await workbenchStore.refresh();
  } catch (error) {
    ElMessage.error(`简历名称保存失败：${describeError(error)}`);
  }
};

const handleHeaderMenuCommand = (command: string) => {
  if (command === 'privacy') togglePrivacyMode();
  else if (command === 'quality') showQualityPanel.value = true;
  else if (command === 'external-ai' && !privacyMode.value) showExternalAi.value = true;
  else if (command === 'shortcuts') showShortcutHelp.value = true;
  else if (command === 'fullscreen') showFullscreen.value = true;
  else if (command === 'templates') goToTemplates();
  else if (command === 'save-template' && !privacyMode.value) showSaveTemplate.value = true;
  else if (command === 'undo-ai') void undoAiChanges();
  else if (command === 'import' || command === 'reset') void handleCommand(command);
};

const saveCurrentAsTemplate = async (payload: { name: string; description: string }) => {
  if (savingTemplate.value) return;
  savingTemplate.value = true;
  try {
    await resumeStore.flushSave();
    templateStore.saveCurrentResumeAsTemplate(data.value, payload);
    showSaveTemplate.value = false;
    ElMessage.success('已存为模板，可在模板库的「我的」分类中使用');
  } catch (error) {
    ElMessage.error(describeError(error));
  } finally {
    savingTemplate.value = false;
  }
};

const handleCommand = async (type: 'pdf' | 'searchable-pdf' | 'image' | 'json' | 'markdown' | 'print' | 'import' | 'reset') => {
  if (type === 'import') {
    try {
      const imported = await importFromJSON();
      const id = await workbenchStore.createResumeFromData(imported, `${imported.title || '导入的简历'} (副本)`, imported.templateId);
      ElMessage.success('已恢复为一份新简历副本');
      router.push(`/editor/${id}`);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== '未选择文件') {
        ElMessage.error('导入失败: ' + (describeError(error)));
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
  try {
    await resumeStore.flushSave();
  } catch (error) {
    ElMessage.error(`保存失败，未开始导出：${describeError(error)}`);
    return;
  }
  if (type === 'markdown') {
    downloadMarkdown(resumeToMarkdown(data.value), data.value.title || data.value.basic.name || 'resume');
    ElMessage.success('Markdown 已导出');
    return;
  }

  if (type === 'print') {
    ElMessage.info('请在打印面板确认 A4 纸张和页边距设置。');
    await settlePreview();
    window.print();
    return;
  }

  const loadingInstance = ElLoading.service({
    lock: true,
    text: type === 'pdf' || type === 'searchable-pdf' ? '正在生成 PDF…' : '正在处理...',
    background: 'rgba(0, 0, 0, 0.7)',
  });

  const filename = type === 'pdf' || type === 'searchable-pdf'
    ? previewData.value.title || previewData.value.basic.name || 'resume'
    : data.value.title || data.value.basic.name || 'resume';

  try {
    switch (type) {
      case 'pdf': {
        const restoreEditorTab = activeTab.value === 'edit';
        const restorePreviewPanel = !previewVisible.value;
        if (restorePreviewPanel) setPreviewVisible(true);
        if (restoreEditorTab) {
          activeTab.value = 'preview';
          await nextTick();
        }
        try {
          await settlePreview();
          const pageCount = await exportPreviewToPDF('.preview-panel .resume-canvas', filename);
          ElMessage.success(`PDF 已生成，共 ${pageCount} 页，版式与预览一致`);
        } finally {
          if (restoreEditorTab) {
            activeTab.value = 'edit';
            await nextTick();
          }
          if (restorePreviewPanel) setPreviewVisible(false);
        }
        break;
      }
      case 'searchable-pdf':
        await exportToPDF(previewData.value, filename);
        ElMessage.success('可搜索 PDF 已生成并下载');
        break;
      case 'image': {
        const restoreEditorTab = activeTab.value === 'edit';
        const restorePreviewPanel = !previewVisible.value;
        if (restorePreviewPanel) setPreviewVisible(true);
        activeTab.value = 'preview';
        try {
          await settlePreview();
          await exportToImage('.preview-panel .resume-canvas', filename, 'png');
          ElMessage.success('图片导出成功！');
        } finally {
          if (restoreEditorTab) activeTab.value = 'edit';
          if (restorePreviewPanel) setPreviewVisible(false);
        }
        break;
      }
      case 'json':
        exportToJSON(data.value, filename);
        ElMessage.success('JSON 导出成功！');
        break;
    }
  } catch (error) {
    console.error('操作失败:', error);
    ElMessage.error(type === 'pdf' || type === 'searchable-pdf' ? `PDF 导出失败：${describeError(error)}` : `操作失败：${describeError(error)}`);
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

@keyframes mobile-panel-enter { from { opacity: 0; } to { opacity: 1; } }
@media (max-width: 1024px) {
  .mobile-tabs {
    display: block;
  }

  .editor-container {
    flex-direction: column;
  }

  .mobile-active {
    animation: mobile-panel-enter var(--ui-duration-normal, 180ms) ease-out;
  }

  .mobile-hidden {
    display: none !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-active {
    animation: none;
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
.editor-toolbar {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-wrap: nowrap;
  gap: 4px;
}

.editor-toolbar__group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.editor-toolbar__group + .editor-toolbar__group {
  padding-left: 4px;
  border-left: var(--rule-hair) solid var(--color-rule);
}

.mobile-section-nav {
  display: flex;
  gap: var(--space-2xs);
  overflow-x: auto;
  padding-top: var(--space-xs);
}

.mobile-section-nav button {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 var(--space-sm);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-input);
  background: var(--color-paper-3);
  color: var(--color-ink-2);
  font: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
}

.mobile-section-nav button[aria-current='true'] {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.editor-toolbar :deep(.el-button) {
  margin-left: 0;
  white-space: nowrap;
}

/* 布局工具栏：把三个栏目与「恢复默认布局」从菜单里拿出来，直接标出名字。 */
.layout-bar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-2xs) var(--ui-page-gutter);
  border-bottom: var(--rule-hair) solid var(--color-rule);
  background: var(--color-paper-3);
}

.layout-bar__label {
  color: var(--color-muted);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 500;
}

.layout-bar__keys {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-input);
  background: var(--color-sunken);
}

.layout-bar__key {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: var(--space-3xs);
  padding: 0 var(--space-xs);
  border: var(--rule-hair) solid transparent;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--color-muted);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--dur-micro) var(--ease-out), color var(--dur-micro) var(--ease-out),
    border-color var(--dur-micro) var(--ease-out), box-shadow var(--dur-micro) var(--ease-out);
}

.layout-bar__key .el-icon {
  font-size: 14px;
}

.layout-bar__key:hover:not(:disabled) {
  background: var(--color-paper-2);
  color: var(--color-ink);
}

/* 正在显示的栏目是一枚抬起的按键，隐藏的栏目留在托盘底色上。 */
.layout-bar__key.is-on {
  border-color: var(--color-rule);
  background: var(--color-paper-3);
  color: var(--color-ink);
  box-shadow: var(--shadow-key);
}

.layout-bar__key:active:not(:disabled) {
  transform: translateY(1px);
  box-shadow: var(--shadow-key-press);
}

.layout-bar__key:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 1px;
}

.layout-bar__key:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.layout-bar__reset {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: var(--space-3xs);
  margin-left: auto;
  padding: 0 var(--space-xs);
  border: 0;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--color-ink-2);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--dur-micro) var(--ease-out), color var(--dur-micro) var(--ease-out);
}

.layout-bar__reset:hover {
  background: var(--color-paper-2);
  color: var(--color-accent);
}

.layout-bar__reset:active {
  background: var(--color-sunken);
}

.layout-bar__reset:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 1px;
}

@media (max-width: 768px) {
  .editor-toolbar {
    width: 100%;
    flex-wrap: wrap;
  }
}
.shortcut-list { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
.shortcut-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.shortcut-list kbd { padding: var(--space-2xs) var(--space-xs); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-sm); background: var(--ui-bg-subtle); font-size: var(--ui-font-sm); }
</style>
