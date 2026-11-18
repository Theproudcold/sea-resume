<template>
  <div class="editor-panel" :style="panelStyle">
    <aside v-show="sidebarVisible" class="editor-sidebar" aria-label="简历模块导航">
      <div class="sidebar-brand">
        <span class="sidebar-title">简历内容</span>
      </div>

      <nav class="sidebar-fixed" aria-label="固定编辑设置">
        <button
          type="button"
          class="sidebar-fixed-item"
          :class="{ 'is-active': selectedSectionId === 'theme' }"
          :aria-current="selectedSectionId === 'theme' ? 'true' : undefined"
          @click="selectSection('theme')"
        >
          <el-icon><Brush /></el-icon>
          <span>主题设置</span>
        </button>
        <button
          type="button"
          class="sidebar-fixed-item"
          :class="{ 'is-active': selectedSectionId === 'basic' }"
          :aria-current="selectedSectionId === 'basic' ? 'true' : undefined"
          @click="selectSection('basic')"
        >
          <el-icon><User /></el-icon>
          <span>基础信息</span>
        </button>
      </nav>

      <div class="sidebar-section-heading">
        <span>简历模块</span>
        <span class="sidebar-count">{{ sectionsList.length }}</span>
      </div>

      <div class="sidebar-list-scroll">
        <draggable
          v-model="sectionsList"
          item-key="id"
          handle=".drag-handle"
          :animation="180"
          group="sections"
          class="sidebar-section-list"
          aria-label="拖动模块调整顺序"
          :class="{ 'is-reordering': isDraggingSections }"
          @start="isDraggingSections = true"
          @end="isDraggingSections = false"
        >
          <template #item="{ element, index }">
            <div class="sidebar-section-item" :class="{ 'is-active': selectedSectionId === element.id, 'is-hidden': isSectionHidden(element.id) }">
              <el-icon class="drag-handle" title="拖动排序"><Rank /></el-icon>
              <button
                type="button"
                class="sidebar-section-button"
                :aria-current="selectedSectionId === element.id ? 'true' : undefined"
                @click="selectSection(element.id)"
              >
                <el-icon><component :is="element.icon" /></el-icon>
                <span>{{ getSectionTitle(element.id) }}</span>
              </button>
              <div class="sidebar-section-actions">
                <el-button
                  link
                  :type="isSectionHidden(element.id) ? 'info' : ''"
                  :icon="isSectionHidden(element.id) ? Hide : View"
                  :aria-label="isSectionHidden(element.id) ? '显示模块' : '隐藏模块'"
                  :title="isSectionHidden(element.id) ? '显示模块' : '隐藏模块'"
                  @click.stop="toggleVisibility(element.id)"
                />
                <el-dropdown trigger="click" @command="(command: string) => handleSectionCommand(element.id, command)">
                  <el-button link :icon="MoreFilled" :aria-label="`${getSectionTitle(element.id)}的模块操作`" title="模块操作" @click.stop />
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="up" :disabled="index === 0"><el-icon><ArrowUp /></el-icon>上移</el-dropdown-item>
                      <el-dropdown-item command="down" :disabled="index === sectionsList.length - 1"><el-icon><ArrowDown /></el-icon>下移</el-dropdown-item>
                      <el-dropdown-item command="remove"><el-icon><Remove /></el-icon>从简历中移出</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
          </template>
        </draggable>
      </div>

      <div class="sidebar-footer">
        <el-dropdown trigger="click" class="sidebar-add-dropdown" @command="(cmd: string) => cmd === 'create_new' ? createCustomBlock() : addExistingSection(cmd)">
          <el-button class="sidebar-add-button" :icon="Plus">添加模块</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="section in availableSections" :key="section.id" :command="section.id">
                <div class="flex items-center justify-between w-full gap-2">
                  <span>添加 {{ section.name }}</span>
                  <el-tag v-if="section.isCustom" size="small" type="info" effect="plain">自定义</el-tag>
                </div>
              </el-dropdown-item>
              <el-dropdown-item v-if="availableSections.length > 0" divided disabled />
              <el-dropdown-item command="create_new"><el-icon><Plus /></el-icon>创建新模块</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </aside>

    <PanelSplitter
      v-if="!compact"
      label="调整模块导航宽度"
      :collapsed="!sidebarVisible"
      :toggleable="canToggle('sidebar')"
      :align="sidebarVisible ? 'center' : 'start'"
      :value="resolved.sidebarWidth"
      :min="SIDEBAR_WIDTH_MIN"
      :max="SIDEBAR_WIDTH_MAX"
      collapse-title="折叠模块导航"
      expand-title="展开模块导航"
      @resize="resizeSidebar"
      @toggle="togglePane('sidebar')"
      @reset="resetLayout"
    />

    <main v-show="editorVisible" class="editor-main">
      <el-scrollbar ref="editorScrollbar" height="100%">
        <div class="editor-content">
          <div ref="transitionShell" class="editor-section-transition-shell" :style="{ minHeight: transitionMinHeight }">
            <Transition
              name="editor-section-switch"
              @before-leave="prepareLeave"
              @before-enter="prepareEnter"
              @after-enter="finishEnter"
            >
              <KeepAlive :key="data.id" :max="6" :include="cacheableHostNames">
                <component
                  :is="selectedContentHost"
                  :key="JSON.stringify([data.id, selectedSectionId])"
                  ref="selectedEditorRef"
                  :section-id="selectedSectionId"
                  :section="selectedSection"
                  :title="getSectionTitle(selectedSectionId)"
                  :visible="!isSectionHidden(selectedSectionId)"
                  :custom="isCustomBlock(selectedSectionId)"
                  :content="getCustomContent(selectedSectionId)"
                  :add-action-label="addActionLabel"
                  @update-title="updateTitle"
                  @update-content="updateCustomContent"
                  @delete="deleteBlock"
                  @add="addSelectedEntry"
                />
              </KeepAlive>
            </Transition>
          </div>
        </div>
      </el-scrollbar>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, markRaw, watch, nextTick, type Component } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { User, Briefcase, School, Star, Folder, Rank, Brush, Plus, Tickets, Hide, View, ArrowUp, ArrowDown, Remove, MoreFilled } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import draggable from 'vuedraggable';
import EditorContentHost from './EditorContentHost.vue';
import ExperienceEditor from './ExperienceEditor.vue';
import EducationEditor from './EducationEditor.vue';
import SkillEditor from './SkillEditor.vue';
import ProjectEditor from './ProjectEditor.vue';
import PanelSplitter from '@/components/common/PanelSplitter.vue';
import { useEditorLayout } from '@/composables/useEditorLayout';
import { SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN } from '@/utils/editorLayout';
import { useSectionKeepAlive, useValidSectionFallback } from '@/composables/useSectionKeepAlive';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const { compact, resolved, paneVisible, canToggle, togglePane, resizeSidebar, resetLayout } = useEditorLayout();
const sidebarVisible = computed(() => paneVisible('sidebar'));
const editorVisible = computed(() => paneVisible('editor'));
/** 三栏宽度由布局状态驱动：模块导航固定，编辑区占满剩余宽度。 */
const panelStyle = computed(() => ({
  '--editor-panel-width': `${resolved.value.editorPanelWidth}px`,
  '--sidebar-width': `${resolved.value.sidebarWidth}px`,
}));

const props = withDefaults(defineProps<{ previewNavigationKey?: number }>(), { previewNavigationKey: 0 });
type EditorScrollbar = { scrollTo: (options: ScrollToOptions) => void };
const editorScrollbar = ref<EditorScrollbar | null>(null);

const selectedSectionId = ref<string>(resumeStore.activeSection || 'basic');
const isDraggingSections = ref(false);

const selectSection = (id: string) => {
  selectedSectionId.value = id;
  resumeStore.setActiveSection(id);
};

watch(
  [() => resumeStore.activeSection, () => props.previewNavigationKey],
  async ([newId]) => {
    if (!newId) return;
    selectedSectionId.value = newId;
    if (newId !== 'theme' && newId !== 'basic'
      && ['experience', 'projects', 'education', 'skills'].includes(newId)
      && !data.value.sectionOrder.includes(newId)) {
      resumeStore.updateSectionOrder([...data.value.sectionOrder, newId]);
    }
    await nextTick();
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    editorScrollbar.value?.scrollTo({ top: 0, behavior });
  },
);


// 模块配置映射 (标准模块)
const sectionConfig: Record<string, any> = {
  experience: { defaultTitle: '工作经历', addLabel: '添加工作经历', icon: markRaw(Briefcase), component: markRaw(ExperienceEditor) },
  projects: { defaultTitle: '项目经验', addLabel: '添加项目经验', icon: markRaw(Folder), component: markRaw(ProjectEditor) },
  education: { defaultTitle: '教育背景', addLabel: '添加教育背景', icon: markRaw(School), component: markRaw(EducationEditor) },
  skills: { defaultTitle: '技能证书', addLabel: '添加技能分类', icon: markRaw(Star), component: markRaw(SkillEditor) },
};
const selectedEditorRef = ref<any>(null);

const addActionLabel = computed(() => {
  const standardSection = sectionConfig[selectedSectionId.value];
  if (standardSection) return standardSection.addLabel;
  return Array.isArray(getCustomContent(selectedSectionId.value)) ? '添加条目' : '';
});

const addSelectedEntry = (id = selectedSectionId.value) => {
  if (id !== selectedSectionId.value) return;
  const editor = selectedEditorRef.value;
  if (sectionConfig[selectedSectionId.value]) {
    editor?.addNew?.();
    return;
  }
  editor?.addItem?.();
};

// 判断是否为自定义模块
const isCustomBlock = (id: string) => !sectionConfig[id];

// 获取模块标题
const getSectionTitle = (id: string) => {
  if (sectionConfig[id]) {
    // 标准模块：优先使用自定义标题，否则使用默认标题
    return data.value.sectionTitles?.[id] || sectionConfig[id].defaultTitle;
  } else {
    // 自定义模块：查找 customBlocks 中的标题
    const block = data.value.customBlocks.find(b => b.id === id);
    return block ? block.title : '未命名模块';
  }
};

// 更新标题
const updateTitle = (id: string, newTitle: string) => {
  if (sectionConfig[id]) {
    // 标准模块
    resumeStore.updateSectionTitle(id, newTitle);
  } else {
    // 自定义模块
    resumeStore.updateCustomBlock(id, { title: newTitle });
  }
};

// 获取自定义内容
const getCustomContent = (id: string) => {
  const block = data.value.customBlocks.find(b => b.id === id);
  return block ? block.content : '';
};

// 更新自定义内容
const updateCustomContent = (id: string, content: any) => {
  resumeStore.updateCustomBlock(id, { content });
};

// 判断模块是否隐藏
const isSectionHidden = (id: string) => {
  return data.value.hiddenSections?.includes(id) || false;
};

// 切换模块可见性
const toggleVisibility = (id: string) => {
  resumeStore.toggleSectionVisibility(id);
};

// 移出模块：只从当前简历顺序拿掉，内容和自定义模块都还在，可再添加回来。
const removeBlock = (id: string) => {
  const newOrder = data.value.sectionOrder.filter(sectionId => sectionId !== id);
  resumeStore.updateSectionOrder(newOrder);
  if (selectedSectionId.value === id) {
    const fallbackId = newOrder[0] || 'basic';
    selectSection(fallbackId);
  }
  ElMessage.success('已移出，可在添加模块中恢复');
};

const moveSection = (id: string, delta: number) => {
  const order = [...data.value.sectionOrder];
  const index = order.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= order.length) return;
  const [item] = order.splice(index, 1);
  if (!item) return;
  order.splice(target, 0, item);
  resumeStore.updateSectionOrder(order);
};

const handleSectionCommand = (id: string, command: string) => {
  if (command === 'up') moveSection(id, -1);
  else if (command === 'down') moveSection(id, 1);
  else if (command === 'remove') removeBlock(id);
};

// 永久删除自定义模块
const deleteBlock = (id: string) => {
  const newOrder = data.value.sectionOrder.filter(sectionId => sectionId !== id);
  resumeStore.updateSectionOrder(newOrder);
  if (selectedSectionId.value === id) selectSection(newOrder[0] || 'basic');
  resumeStore.removeCustomBlock(id);
};

// 计算可用的模块（包括标准模块和已隐藏的自定义模块）
const availableSections = computed(() => {
  const currentIds = new Set(data.value.sectionOrder);
  
  // 标准模块
  const standard = Object.keys(sectionConfig)
    .filter(id => !currentIds.has(id))
    .map(id => ({ 
      id, 
      name: sectionConfig[id].defaultTitle, 
      isCustom: false 
    }));

  // 已隐藏的自定义模块
  const custom = data.value.customBlocks
    .filter(b => !currentIds.has(b.id))
    .map(b => ({ 
      id: b.id, 
      name: b.title || '自定义模块', 
      isCustom: true 
    }));

  return [...standard, ...custom];
});

const addExistingSection = (id: string) => {
  resumeStore.updateSectionOrder([...data.value.sectionOrder, id]);
  selectSection(id);
};

// 创建新的自定义模块
const createCustomBlock = () => {
  const id = resumeStore.addCustomBlock({
    title: '自定义模块',
    type: 'text',
    content: '',
    order: data.value.sectionOrder.length
  });
  
  addExistingSection(id);
};

// 计算属性：将 store 中的 order 转换为对象列表
const sectionsList = computed({
  get() {
    return (data.value.sectionOrder || []).map(id => {
      // 标准模块
      if (sectionConfig[id]) {
        return { id, ...sectionConfig[id] };
      } 
      // 自定义模块 - 只要不在 sectionConfig 中，即视为自定义模块
      // 移除对 customBlocks 的访问，确保 content 更新时列表不重算，解决焦点丢失问题
      return { id, icon: markRaw(Tickets), component: null, isCustom: true };
    });
    // 注意：不再过滤，假设 sectionOrder 中的 ID 都是有效的。
    // 如果需要过滤失效 ID，应在 store 层面保证一致性，而不是在此处依赖 customBlocks
  },
  set(newVal) {
    const newOrder = newVal.map(item => item.id);
    resumeStore.updateSectionOrder(newOrder);
  }
});
const selectedSection = computed(() => sectionsList.value.find(section => section.id === selectedSectionId.value));

// 有效分区：顺序里的模块，且要么是内置模块、要么自定义模块确实存在。
const validSectionIds = computed(() => [
  'theme', 'basic',
  ...data.value.sectionOrder.filter(id => sectionConfig[id] || data.value.customBlocks.some(block => block.id === id)),
]);

// 分区宿主按 (简历, 分区) 复用，规则与约束见 useSectionKeepAlive。
const { host: selectedContentHost, cacheableHostNames } = useSectionKeepAlive({
  hostComponent: EditorContentHost,
  resumeId: computed(() => data.value.id),
  sectionId: selectedSectionId,
  validSectionIds,
});

// 顺序变化或当前分区被移出时，回落到仍然有效的分区。
useValidSectionFallback({
  sectionId: selectedSectionId,
  validSectionIds,
  sectionOrder: computed(() => data.value.sectionOrder),
  select: selectSection,
});

// 换简历时除了作废宿主，还要清掉与上一份简历绑定的视图状态。
watch(() => data.value.id, () => {
  selectedEditorRef.value = null;
  transitionMinHeight.value = '';
  selectedSectionId.value = validSectionIds.value.includes(resumeStore.activeSection || '')
    ? resumeStore.activeSection!
    : 'basic';
});

const transitionShell = ref<HTMLElement | null>(null);
const transitionMinHeight = ref('');
const prepareLeave = (element: Element) => {
  const stage = element as HTMLElement;
  transitionMinHeight.value = `${Math.max(transitionShell.value?.offsetHeight || 0, stage.offsetHeight)}px`;
  stage.inert = true;
  stage.setAttribute('aria-hidden', 'true');
  if (stage.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur();
};
const prepareEnter = (element: Element) => {
  const stage = element as HTMLElement;
  stage.inert = false;
  stage.removeAttribute('aria-hidden');
};
const finishEnter = () => { transitionMinHeight.value = ''; };
</script>

<style scoped>
/* The editor pane: a nav rail on the raised surface beside the form host, hairline seams. */
.editor-panel {
  display: flex;
  width: var(--editor-panel-width, min(62vw, 1080px));
  min-width: 0;
  height: 100%;
  flex: 0 0 auto;
  /* 分隔条的折叠按钮悬浮在栏缝上，需要溢出到相邻栏之上。 */
  overflow: visible;
  border-right: var(--rule-hair) solid var(--color-rule);
  background: var(--color-paper);
}

.editor-sidebar {
  display: flex;
  min-width: 0;
  max-width: 100%;
  min-height: 0;
  flex: 0 0 var(--sidebar-width, 232px);
  width: var(--sidebar-width, 232px);
  flex-direction: column;
  overflow: hidden;
  border-right: var(--rule-hair) solid var(--color-rule);
  background: var(--color-paper-3);
}

.sidebar-brand {
  display: flex;
  min-height: 52px;
  align-items: center;
  padding: var(--space-sm) var(--space-md);
}

.sidebar-title {
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 600;
  letter-spacing: var(--tracking-display);
}

.sidebar-fixed {
  display: flex;
  flex-direction: column;
  gap: var(--space-3xs);
  padding: 0 var(--space-xs);
}

.sidebar-fixed-item,
.sidebar-section-item {
  border-radius: var(--radius-input);
  background: transparent;
  color: var(--color-ink-2);
  transition: background-color var(--dur-micro) var(--ease-out), color var(--dur-micro) var(--ease-out);
}

.sidebar-fixed-item {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: var(--space-xs);
  padding: 0 var(--space-sm);
  border: 0;
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

/* The current module: an accent wash with cobalt text. */
.sidebar-fixed-item.is-active,
.sidebar-section-item.is-active {
  background: var(--color-accent-wash);
  color: var(--color-accent);
}

.sidebar-fixed-item.is-active,
.sidebar-section-item.is-active .sidebar-section-button {
  font-weight: 600;
}

.sidebar-section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-xs);
  margin-top: var(--space-sm);
  padding: var(--space-sm) var(--space-md) var(--space-xs);
  border-top: var(--rule-hair) solid var(--color-rule);
  color: var(--color-muted);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 500;
}

.sidebar-count {
  color: var(--color-ink-2);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.sidebar-list-scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 0 var(--space-xs) var(--space-sm);
}

.sidebar-section-list {
  display: flex;
  min-height: var(--space-xs);
  flex-direction: column;
  gap: var(--space-3xs);
}

.sidebar-section-item {
  display: flex;
  min-width: 0;
  min-height: 40px;
  align-items: center;
  gap: var(--space-3xs);
  padding: 0 var(--space-3xs);
}

.sidebar-section-item.is-hidden:not(.is-active) .sidebar-section-button {
  color: var(--color-muted);
  text-decoration: line-through;
  text-decoration-thickness: var(--rule-hair);
}

.sidebar-section-item .drag-handle {
  display: inline-flex;
  flex: 0 0 24px;
  height: 32px;
  justify-content: center;
  color: var(--color-muted);
  cursor: grab;
}

.sidebar-section-item .drag-handle:active {
  cursor: grabbing;
}

.sidebar-section-button {
  display: flex;
  min-width: 0;
  min-height: 36px;
  flex: 1;
  align-items: center;
  gap: var(--space-xs);
  padding: 0 var(--space-3xs);
  border: 0;
  border-radius: var(--radius-s);
  background: transparent;
  color: inherit;
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.sidebar-section-button > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-section-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
}

.sidebar-section-actions :deep(.el-button) {
  --el-button-text-color: var(--color-muted);
  --el-button-hover-text-color: var(--color-ink);
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
  border-radius: var(--radius-s);
  transition: opacity var(--dur-micro) var(--ease-out), background-color var(--dur-micro) var(--ease-out), color var(--dur-micro) var(--ease-out);
}



.sidebar-section-actions :deep(.el-button.is-link:not(.is-disabled):hover) {
  background: var(--color-paper-2);
  text-decoration: none;
}

.sidebar-section-actions :deep(.el-button.is-link:not(.is-disabled):active) {
  background: var(--color-sunken);
}

.sidebar-section-item.is-active .drag-handle,
.sidebar-section-item.is-active .sidebar-section-actions :deep(.el-button) {
  --el-button-text-color: var(--color-accent);
  color: var(--color-accent);
}

.sidebar-section-item.is-active .sidebar-section-actions :deep(.el-button.is-link:not(.is-disabled):hover) {
  background: var(--color-paper-3);
}

/* Row controls stay quiet until the row is pointed at or holds focus; a hidden module keeps its eye. */
@media (hover: hover) {
  .sidebar-fixed-item:not(.is-active):hover,
  .sidebar-section-item:not(.is-active):hover {
    background: var(--color-paper-2);
    color: var(--color-ink);
  }

  .sidebar-section-item:not(.is-active):not(:hover):not(:focus-within) .drag-handle,
  .sidebar-section-item:not(.is-active):not(:hover):not(:focus-within) .sidebar-section-actions :deep(.el-button:not(.el-button--info)) {
    opacity: 0;
  }
}

.sidebar-fixed-item:not(.is-active):active,
.sidebar-section-item:not(.is-active):has(> .sidebar-section-button:active) {
  background: var(--color-sunken);
  color: var(--color-ink);
}

.sidebar-footer {
  padding: var(--space-sm) var(--space-md);
  border-top: var(--rule-hair) solid var(--color-rule);
}

.sidebar-add-dropdown,
.sidebar-add-button {
  width: 100%;
}

.editor-main {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  background: var(--color-paper);
}

.editor-content {
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  padding: var(--space-lg) var(--space-lg) var(--space-2xl);
}

.editor-section-transition-shell {
  position: relative;
}

/* Modules swap in place: the outgoing stage leaves the flow at once, nothing fades. */
.editor-section-switch-leave-active {
  position: absolute;
  inset: 0;
  width: 100%;
  z-index: 0;
  visibility: hidden;
  pointer-events: none;
}

.editor-main :deep(.editor-section) {
  margin-bottom: 0;
}

.is-reordering {
  border-radius: var(--radius-input);
  outline: var(--rule-hair) dashed var(--color-accent);
  outline-offset: var(--space-3xs);
}

@media (max-width: 1024px) {
  .editor-panel {
    width: 100%;
    min-width: 0;
    max-width: none;
    flex: 1 1 auto;
    border-right: 0;
  }
}

/* Narrow: the rail turns into two scrolling strips of rows. */
@media (max-width: 700px) {
  .editor-panel {
    display: flex;
    flex-direction: column;
  }

  .editor-sidebar {
    width: auto;
    max-height: 184px;
    flex: 0 0 auto;
    border-right: 0;
    border-bottom: var(--rule-hair) solid var(--color-rule);
  }

  .sidebar-brand,
  .sidebar-section-heading {
    display: none;
  }

  .sidebar-fixed {
    flex-direction: row;
    padding: var(--space-xs) var(--space-xs) var(--space-2xs);
  }

  .sidebar-fixed-item {
    min-height: 36px;
    flex: 1;
    justify-content: center;
  }

  .sidebar-list-scroll {
    flex: 0 0 auto;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 var(--space-xs) var(--space-2xs);
  }

  .sidebar-section-list {
    width: max-content;
    min-height: 40px;
    flex-direction: row;
  }

  .sidebar-section-item {
    width: 168px;
    flex: 0 0 auto;
  }

  .sidebar-footer {
    padding: var(--space-xs) var(--space-sm);
  }

  .editor-content {
    padding: var(--space-md) var(--space-md) var(--space-xl);
  }
}
</style>
