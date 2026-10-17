<template>
  <div class="editor-panel">
    <aside class="editor-sidebar" aria-label="简历模块导航">
      <div class="sidebar-brand">
        <span class="sidebar-eyebrow">编辑工作区</span>
        <span class="sidebar-title">简历内容</span>
      </div>

      <nav class="sidebar-fixed" aria-label="固定编辑设置">
        <button
          type="button"
          class="sidebar-fixed-item"
          :class="{ 'is-active': selectedSectionId === 'theme' }"
          @click="selectSection('theme')"
        >
          <el-icon><Brush /></el-icon>
          <span>主题设置</span>
        </button>
        <button
          type="button"
          class="sidebar-fixed-item"
          :class="{ 'is-active': selectedSectionId === 'basic' }"
          @click="selectSection('basic')"
        >
          <el-icon><User /></el-icon>
          <span>基础信息</span>
        </button>
      </nav>

      <div class="sidebar-divider"></div>
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
          <template #item="{ element }">
            <div class="sidebar-section-item" :class="{ 'is-active': selectedSectionId === element.id }">
              <el-icon class="drag-handle" title="拖动排序"><Rank /></el-icon>
              <button type="button" class="sidebar-section-button" @click="selectSection(element.id)">
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
                <el-button
                  link
                  type="danger"
                  :icon="Delete"
                  aria-label="移除模块"
                  title="移除模块"
                  @click.stop="removeBlock(element.id)"
                />
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

    <main class="editor-main">
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
import { User, Briefcase, School, Star, Folder, Rank, Brush, Plus, Tickets, Hide, View, Delete } from '@element-plus/icons-vue';
import draggable from 'vuedraggable';
import EditorContentHost from './EditorContentHost.vue';
import ExperienceEditor from './ExperienceEditor.vue';
import EducationEditor from './EducationEditor.vue';
import SkillEditor from './SkillEditor.vue';
import ProjectEditor from './ProjectEditor.vue';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const props = withDefaults(defineProps<{ previewNavigationKey?: number }>(), { previewNavigationKey: 0 });
type EditorScrollbar = { scrollTo: (options: ScrollToOptions) => void };
const editorScrollbar = ref<EditorScrollbar | null>(null);

const selectedSectionId = ref<string>(resumeStore.activeSection || data.value.sectionOrder[0] || 'basic');
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

// 移除模块 (仅从排序中移除，相当于隐藏)
const removeBlock = (id: string) => {
  const newOrder = data.value.sectionOrder.filter(sectionId => sectionId !== id);
  resumeStore.updateSectionOrder(newOrder);
  if (selectedSectionId.value === id) {
    const fallbackId = newOrder[0] || 'basic';
    selectSection(fallbackId);
  }
};

// 永久删除自定义模块
const deleteBlock = (id: string) => {
  removeBlock(id);
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

// Each visited section has its own component name so KeepAlive can prune just
// removed modules via include, without rebuilding the other rich-text editors.
const contentHosts = new Map<string, Component>();
// KeepAlive splits string include patterns on commas; use comma-free names.
const hostName = (id: string) => `EditorContent_${encodeURIComponent(JSON.stringify([data.value.id, id]))}`;
const validSectionIds = computed(() => [
  'theme', 'basic',
  ...data.value.sectionOrder.filter(id => sectionConfig[id] || data.value.customBlocks.some(block => block.id === id)),
]);
const cacheableHostNames = computed(() => validSectionIds.value.map(hostName));
const selectedContentHost = computed(() => {
  const name = hostName(selectedSectionId.value);
  let host = contentHosts.get(name);
  if (!host) {
    host = markRaw({ ...EditorContentHost, name });
    contentHosts.set(name, host);
  }
  return host;
});

watch(() => data.value.id, () => {
  contentHosts.clear();
  selectedEditorRef.value = null;
  transitionMinHeight.value = '';
  selectedSectionId.value = validSectionIds.value.includes(resumeStore.activeSection || '')
    ? resumeStore.activeSection!
    : data.value.sectionOrder.find(id => validSectionIds.value.includes(id)) || 'basic';
});
watch([validSectionIds, selectedSectionId], ([ids]) => {
  const names = new Set(cacheableHostNames.value);
  for (const name of contentHosts.keys()) {
    if (!names.has(name)) contentHosts.delete(name);
  }
  if (!ids.includes(selectedSectionId.value)) {
    selectSection(data.value.sectionOrder.find(id => ids.includes(id)) || 'basic');
  }
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
.editor-panel {
  display: grid;
  grid-template-columns: clamp(200px, 18vw, 272px) minmax(0, 1fr);
  width: min(62vw, 1080px);
  min-width: 620px;
  max-width: 1080px;
  height: 100%;
  flex: 0 1 62%;
  overflow: hidden;
  border-right: 1px solid var(--ui-border);
  background: var(--ui-bg-surface);
}

.editor-sidebar {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--ui-border);
  background: var(--ui-bg-subtle);
}

.sidebar-brand {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 20px 18px 14px;
}

.sidebar-eyebrow {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.sidebar-title {
  color: var(--ui-text-main);
  font-size: var(--ui-font-lg);
  font-weight: 650;
}

.sidebar-fixed {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 10px;
}

.sidebar-fixed-item {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-text-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.sidebar-fixed-item:hover,
.sidebar-fixed-item.is-active {
  border-color: color-mix(in srgb, var(--ui-primary) 20%, var(--ui-border));
  background: var(--ui-bg-surface);
  color: var(--ui-primary);
}

.sidebar-divider {
  height: 1px;
  margin: 14px 18px 10px;
  background: var(--ui-border);
}

.sidebar-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px 8px;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-xs);
  font-weight: 600;
}

.sidebar-count {
  color: var(--ui-text-faint);
  font-weight: 500;
}

.sidebar-list-scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 0 8px 12px;
}

.sidebar-section-list {
  display: flex;
  min-height: 8px;
  flex-direction: column;
  gap: 4px;
}

.sidebar-section-item {
  display: flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-md);
  color: var(--ui-text-secondary);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.sidebar-section-item:hover,
.sidebar-section-item.is-active {
  border-color: color-mix(in srgb, var(--ui-primary) 20%, var(--ui-border));
  background: var(--ui-bg-surface);
}

.sidebar-section-item.is-active {
  color: var(--ui-primary);
}

.sidebar-section-item .drag-handle {
  flex: 0 0 20px;
  justify-content: center;
  color: var(--ui-text-faint);
  cursor: grab;
}

.sidebar-section-button {
  display: flex;
  min-width: 0;
  min-height: 34px;
  flex: 1;
  align-items: center;
  gap: 8px;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
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
  width: 28px;
  height: 30px;
  margin: 0;
  padding: 0;
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--ui-border);
}

.sidebar-add-dropdown,
.sidebar-add-button {
  width: 100%;
}

.sidebar-add-button {
  border-style: dashed;
}

.editor-main {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-bg-page);
}

.editor-content {
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  padding: 24px;
}

.editor-section-transition-shell {
  position: relative;
}

.editor-section-switch-enter-active,
.editor-section-switch-leave-active {
  transition: opacity var(--ui-duration-normal, 180ms) ease, transform var(--ui-duration-normal, 180ms) ease;
}

.editor-section-switch-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.editor-section-switch-leave-active {
  position: absolute;
  inset: 0;
  width: 100%;
  z-index: 0;
  pointer-events: none;
}

.editor-section-switch-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}



.editor-main :deep(.editor-section) {
  margin-bottom: 0;
}

.is-reordering {
  outline: 2px dashed var(--ui-primary);
  outline-offset: 3px;
}


@media (prefers-reduced-motion: reduce) {
  .editor-section-switch-enter-active,
  .editor-section-switch-leave-active {
    transition: none;
  }

  .editor-section-switch-enter-from,
  .editor-section-switch-leave-to {
    transform: none;
  }
}
@media (max-width: 1024px) {
  .editor-panel {
    width: 100%;
    min-width: 0;
    max-width: none;
    flex: 1 1 auto;
    border-right: 0;
    border-bottom: 1px solid var(--ui-border);
  }
}

@media (max-width: 700px) {
  .editor-panel {
    display: flex;
    flex-direction: column;
  }

  .editor-sidebar {
    max-height: 176px;
    flex: 0 0 auto;
    border-right: 0;
    border-bottom: 1px solid var(--ui-border);
  }

  .sidebar-brand,
  .sidebar-divider,
  .sidebar-section-heading {
    display: none;
  }

  .sidebar-fixed {
    flex-direction: row;
    padding: 8px 8px 4px;
  }

  .sidebar-fixed-item {
    min-height: 36px;
    flex: 1;
    justify-content: center;
  }

  .sidebar-list-scroll {
    flex: 0 0 48px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 8px 6px;
  }

  .sidebar-section-list {
    width: max-content;
    min-height: 40px;
    flex-direction: row;
  }

  .sidebar-section-item {
    width: 156px;
    min-height: 38px;
    flex: 0 0 auto;
  }

  .sidebar-footer {
    padding: 6px 10px 10px;
    border-top: 0;
  }

  .editor-content {
    padding: 14px;
  }

}
</style>
