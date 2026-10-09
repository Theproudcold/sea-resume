<template>
  <div class="editor-panel">
    <el-scrollbar height="100%">
      <div class="editor-content p-6">
        <SectionQuickNav :sections="quickNavSections" :active-id="resumeStore.activeSection" @navigate="jumpToSection" />
        <!-- 基础信息 (固定) -->
        <el-collapse v-model="fixedActiveNames" class="space-y-4 mb-4">
          <el-collapse-item name="theme">
            <template #title>
              <div class="flex items-center gap-2">
                <el-icon><Brush /></el-icon>
                <span class="font-semibold">主题设置</span>
              </div>
            </template>
            <ThemeEditor />
          </el-collapse-item>

          <el-collapse-item id="editor-section-basic" name="basic">
            <template #title>
              <div class="flex items-center gap-2">
                <el-icon><User /></el-icon>
                <span class="font-semibold">基础信息</span>
              </div>
            </template>
            <BasicInfoEditor />
          </el-collapse-item>
        </el-collapse>

        <el-divider content-position="center">模块排序与内容</el-divider>

        <!-- 可排序模块 -->
        <p v-if="isDraggingSections" class="reorder-status" role="status">正在调整顺序，松开后会自动保存。</p>
        <draggable
          v-model="sectionsList"
          item-key="id"
          handle=".drag-handle"
          :animation="200"
          group="sections"
          class="space-y-4"
          aria-label="拖动章节手柄调整顺序"
          :class="{ 'is-reordering': isDraggingSections }"
          @start="isDraggingSections = true"
          @end="isDraggingSections = false"
        >
          <template #item="{ element }">
            <EditorSection
              :id="`editor-section-${element.id}`"
              :title="getSectionTitle(element.id)"
              :is-open="isSectionOpen(element.id)"
              :visible="!isSectionHidden(element.id)"
              :icon="element.icon"
              :removable="true"
              @update:is-open="(val) => setSectionOpen(element.id, val)"
              @update:title="(val) => updateTitle(element.id, val)"
              @toggle-visibility="toggleVisibility(element.id)"
              @remove="removeBlock(element.id)"
            >
              <!-- 动态加载组件 -->
              <component 
                :is="element.component" 
                v-if="!isCustomBlock(element.id)"
              />
              <CustomBlockEditor
                v-else
                :id="element.id"
                :model-value="getCustomContent(element.id)"
                @update:model-value="(val) => updateCustomContent(element.id, val)"
                @delete="deleteBlock(element.id)"
              />
            </EditorSection>
          </template>
        </draggable>

        <!-- 添加模块按钮 -->
        <div class="mt-6 text-center">
          <el-dropdown trigger="click" class="w-full" @command="(cmd: string) => cmd === 'create_new' ? createCustomBlock() : addExistingSection(cmd)">
            <el-button :icon="Plus" dashed class="w-full">
              添加模块
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <!-- 可用的模块 (标准 + 隐藏的自定义) -->
                <el-dropdown-item 
                  v-for="section in availableSections" 
                  :key="section.id" 
                  :command="section.id"
                >
                  <div class="flex items-center justify-between w-full gap-2">
                    <span>添加 {{ section.name }}</span>
                    <el-tag v-if="section.isCustom" size="small" type="info" effect="plain">自定义</el-tag>
                  </div>
                </el-dropdown-item>
                
                <el-dropdown-item v-if="availableSections.length > 0" divided disabled />
                
                <!-- 创建新模块 -->
                <el-dropdown-item command="create_new">
                  <el-icon><Plus /></el-icon> 创建新模块
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, markRaw, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { User, Briefcase, School, Star, Folder, Rank, Brush, Plus, Tickets } from '@element-plus/icons-vue';
import draggable from 'vuedraggable';
import BasicInfoEditor from './BasicInfoEditor.vue';
import ThemeEditor from './ThemeEditor.vue';
import ExperienceEditor from './ExperienceEditor.vue';
import EducationEditor from './EducationEditor.vue';
import SkillEditor from './SkillEditor.vue';
import ProjectEditor from './ProjectEditor.vue';
import EditorSection from './EditorSection.vue';
import CustomBlockEditor from './CustomBlockEditor.vue';
import SectionQuickNav from './SectionQuickNav.vue';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

// 固定折叠面板状态
const fixedActiveNames = ref(['basic']);

// 独立管理每个模块的展开状态
const openSections = ref<Set<string>>(new Set(['experience']));
const isDraggingSections = ref(false);

const isSectionOpen = (id: string) => openSections.value.has(id);
const setSectionOpen = (id: string, isOpen: boolean) => {
  const newSet = new Set(openSections.value);
  if (isOpen) {
    newSet.add(id);
    resumeStore.setActiveSection(id); // 同步选中状态
  } else {
    newSet.delete(id);
    if (resumeStore.activeSection === id) {
      resumeStore.setActiveSection(null);
    }
  }
  openSections.value = newSet;
};

// 监听 store 中的 activeSection 变化，自动展开对应模块
watch(() => resumeStore.activeSection, (newId) => {
  if (newId) {
    // 如果是基础信息，展开 BasicInfo
    if (newId === 'basic') {
      fixedActiveNames.value = ['basic'];
      return;
    }
    if (['experience', 'projects', 'education', 'skills'].includes(newId)
      && !data.value.sectionOrder.includes(newId)) {
      resumeStore.updateSectionOrder([...data.value.sectionOrder, newId]);
    }
    const newSet = new Set(openSections.value);
    newSet.add(newId);
    openSections.value = newSet;
    
    // 滚动到对应位置 (可选优化)
    setTimeout(() => {
      const el = document.getElementById(`editor-section-${newId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }
});

const jumpToSection = async (id: string) => {
  resumeStore.setActiveSection(id);
  await nextTick();
  window.setTimeout(() => {
    document.getElementById(id === 'basic' ? 'editor-section-basic' : `editor-section-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 120);
};

// 模块配置映射 (标准模块)
const sectionConfig: Record<string, any> = {
  experience: { defaultTitle: '工作经历', icon: markRaw(Briefcase), component: markRaw(ExperienceEditor) },
  projects: { defaultTitle: '项目经验', icon: markRaw(Folder), component: markRaw(ProjectEditor) },
  education: { defaultTitle: '教育背景', icon: markRaw(School), component: markRaw(EducationEditor) },
  skills: { defaultTitle: '技能证书', icon: markRaw(Star), component: markRaw(SkillEditor) },
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
  const newOrder = data.value.sectionOrder.filter(lid => lid !== id);
  resumeStore.updateSectionOrder(newOrder);
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

// 添加模块 (标准或已存在的自定义)
const addExistingSection = (id: string) => {
  const newOrder = [...data.value.sectionOrder, id];
  resumeStore.updateSectionOrder(newOrder);
  
  // 自动展开
  const newSet = new Set(openSections.value);
  newSet.add(id);
  openSections.value = newSet;
  resumeStore.setActiveSection(id);
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
const quickNavSections = computed(() => [
  { id: 'basic', title: '基础信息' },
  ...sectionsList.value.map((section) => ({ id: section.id, title: getSectionTitle(section.id) })),
]);
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.editor-panel {
  width: 400px;
  min-width: 0;
  height: 100%;
  flex: 0 0 400px;
  background: $bg-white;
  border-right: 1px solid $border-color;
  overflow: hidden;

  @media (max-width: 1024px) {
    width: 100%;
    height: 100%;
    flex: 1 1 auto;
    border-right: none;
    border-bottom: 1px solid $border-color;
  }
}

.editor-content {
  max-width: 100%;
}

:deep(.el-collapse) {
  border: none;
}

:deep(.el-collapse-item__header) {
  height: auto;
  padding: $spacing-sm $spacing-md;
  background: var(--ui-bg-subtle);
  border-radius: $border-radius-md;
  border: none;
  margin-bottom: $spacing-sm;
}

:deep(.el-collapse-item__wrap) {
  border: none;
}

:deep(.el-collapse-item__content) {
  padding: $spacing-md;
  background: $bg-white;
  border-radius: $border-radius-md;
  border: 1px solid $border-color;
  margin-bottom: $spacing-md;
}
.reorder-status { margin: 0 0 10px; color: var(--ui-primary); font-size: var(--ui-font-sm); }
.is-reordering { outline: 2px dashed var(--ui-primary); outline-offset: 4px; }
</style>
