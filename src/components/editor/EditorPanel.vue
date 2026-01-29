<template>
  <div class="editor-panel">
    <el-scrollbar height="100%">
      <div class="editor-content p-6">
        <!-- 基础信息 (固定) -->
        <el-collapse v-model="activeNames" class="space-y-4 mb-4">
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

        <!-- 可排序模块 -->
        <draggable
          v-model="sectionsList"
          item-key="id"
          handle=".drag-handle"
          :animation="200"
          component="el-collapse"
          :component-data="{ modelValue: activeNames, 'onUpdate:modelValue': (val: any) => activeNames = val }"
          class="space-y-4"
        >
          <template #item="{ element }">
            <el-collapse-item :name="element.id">
              <template #title>
                <div class="flex items-center justify-between w-full pr-4 group">
                  <div class="flex items-center gap-2">
                    <el-icon><component :is="element.icon" /></el-icon>
                    <span class="font-semibold">{{ element.label }}</span>
                  </div>
                  <el-icon class="drag-handle cursor-move text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
                    <Rank />
                  </el-icon>
                </div>
              </template>
              <component :is="element.component" />
            </el-collapse-item>
          </template>
        </draggable>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, markRaw } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { User, Briefcase, School, Star, Folder, Rank, Brush } from '@element-plus/icons-vue';
import draggable from 'vuedraggable';
import BasicInfoEditor from './BasicInfoEditor.vue';
import ThemeEditor from './ThemeEditor.vue';
import ExperienceEditor from './ExperienceEditor.vue';
import EducationEditor from './EducationEditor.vue';
import SkillEditor from './SkillEditor.vue';
import ProjectEditor from './ProjectEditor.vue';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const activeNames = ref(['basic', 'experience', 'projects', 'education', 'skills']);

// 模块配置映射
const sectionConfig: Record<string, any> = {
  experience: { label: '工作经历', icon: markRaw(Briefcase), component: markRaw(ExperienceEditor) },
  projects: { label: '项目经验', icon: markRaw(Folder), component: markRaw(ProjectEditor) },
  education: { label: '教育背景', icon: markRaw(School), component: markRaw(EducationEditor) },
  skills: { label: '技能证书', icon: markRaw(Star), component: markRaw(SkillEditor) },
};

// 计算属性：将 store 中的 order 转换为对象列表
const sectionsList = computed({
  get() {
    return (data.value.sectionOrder || []).map(id => ({
      id,
      ...sectionConfig[id]
    })).filter(item => item.label); // 过滤掉未知的 ID
  },
  set(newVal) {
    const newOrder = newVal.map(item => item.id);
    resumeStore.updateSectionOrder(newOrder);
  }
});
</script>

<style scoped>
.editor-panel {
  width: 400px;
  height: 100%;
  background: white;
  border-right: 1px solid #e5e7eb;
  overflow: hidden;
}

.editor-content {
  max-width: 100%;
}

:deep(.el-collapse) {
  border: none;
}

:deep(.el-collapse-item__header) {
  height: auto;
  padding: 12px 16px;
  background: #f9fafb;
  border-radius: 8px;
  border: none;
  margin-bottom: 8px;
}

:deep(.el-collapse-item__wrap) {
  border: none;
}

:deep(.el-collapse-item__content) {
  padding: 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  margin-bottom: 16px;
}

@media (max-width: 1024px) {
  .editor-panel {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
  }
}
</style>
