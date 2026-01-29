<template>
  <div class="editor-panel">
    <el-scrollbar height="100%">
      <div class="editor-content p-6">
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

          <el-collapse-item name="basic">
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
        <draggable
          v-model="sectionsList"
          item-key="id"
          handle=".drag-handle"
          :animation="200"
          group="sections"
          class="space-y-4"
        >
          <template #item="{ element }">
            <EditorSection
              :id="`editor-section-${element.id}`"
              :title="getSectionTitle(element.id)"
              :is-open="isSectionOpen(element.id)"
              :icon="element.icon"
              :removable="isCustomBlock(element.id)"
              @update:is-open="(val) => setSectionOpen(element.id, val)"
              @update:title="(val) => updateTitle(element.id, val)"
              @remove="removeBlock(element.id)"
            >
              <!-- 动态加载组件 -->
              <component 
                :is="element.component" 
                v-if="!isCustomBlock(element.id)"
              />
              <CustomBlockEditor
                v-else
                :model-value="getCustomContent(element.id)"
                @update:model-value="(val) => updateCustomContent(element.id, val)"
              />
            </EditorSection>
          </template>
        </draggable>

        <!-- 添加自定义模块按钮 -->
        <div class="mt-6 text-center">
          <el-button @click="addCustomBlock" :icon="Plus" dashed class="w-full">
            添加自定义模块
          </el-button>
        </div>
        
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, markRaw, watch } from 'vue';
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

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

// 固定折叠面板状态
const fixedActiveNames = ref(['basic']);

// 独立管理每个模块的展开状态
const openSections = ref<Set<string>>(new Set(['experience']));

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
    // 其他模块，展开对应的 Accordion
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
const updateCustomContent = (id: string, content: string) => {
  resumeStore.updateCustomBlock(id, { content });
};

// 添加自定义模块
const addCustomBlock = () => {
  const id = resumeStore.addCustomBlock({
    title: '自定义模块',
    type: 'text',
    content: '',
    order: data.value.sectionOrder.length
  });
  
  // 添加到排序列表
  const newOrder = [...data.value.sectionOrder, id];
  resumeStore.updateSectionOrder(newOrder);
  
  // 自动展开
  openSections.value.add(id);
};

// 删除模块
const removeBlock = (id: string) => {
  // 只允许删除自定义模块
  if (isCustomBlock(id)) {
    resumeStore.removeCustomBlock(id);
    const newOrder = data.value.sectionOrder.filter(lid => lid !== id);
    resumeStore.updateSectionOrder(newOrder);
  }
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
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.editor-panel {
  width: 400px;
  height: 100%;
  background: $bg-white;
  border-right: 1px solid $border-color;
  overflow: hidden;

  @media (max-width: 1024px) {
    width: 100%;
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
  background: #f9fafb; // Keep explicit for specific UI element or added to variables
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
</style>
