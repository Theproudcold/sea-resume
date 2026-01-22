<template>
  <div class="editor-panel">
    <el-scrollbar height="100%">
      <div class="editor-content p-6">
        <el-collapse v-model="activeNames" class="space-y-4">
          <!-- 基础信息 -->
          <el-collapse-item name="basic">
            <template #title>
              <div class="flex items-center gap-2">
                <el-icon><User /></el-icon>
                <span class="font-semibold">基础信息</span>
              </div>
            </template>
            <BasicInfoEditor />
          </el-collapse-item>

          <!-- 工作经历 -->
          <el-collapse-item name="experience">
            <template #title>
              <div class="flex items-center gap-2">
                <el-icon><Briefcase /></el-icon>
                <span class="font-semibold">工作经历</span>
              </div>
            </template>
            <ExperienceEditor />
          </el-collapse-item>

          <!-- 项目经验 -->
          <el-collapse-item name="projects">
            <template #title>
              <div class="flex items-center gap-2">
                <el-icon><Folder /></el-icon>
                <span class="font-semibold">项目经验</span>
              </div>
            </template>
            <ProjectEditor />
          </el-collapse-item>

          <!-- 教育背景 -->
          <el-collapse-item name="education">
            <template #title>
              <div class="flex items-center gap-2">
                <el-icon><School /></el-icon>
                <span class="font-semibold">教育背景</span>
              </div>
            </template>
            <EducationEditor />
          </el-collapse-item>

          <!-- 技能证书 -->
          <el-collapse-item name="skills">
            <template #title>
              <div class="flex items-center gap-2">
                <el-icon><Star /></el-icon>
                <span class="font-semibold">技能证书</span>
              </div>
            </template>
            <SkillEditor />
          </el-collapse-item>
        </el-collapse>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { User, Briefcase, School, Star, Folder } from '@element-plus/icons-vue';
import BasicInfoEditor from './BasicInfoEditor.vue';
import ExperienceEditor from './ExperienceEditor.vue';
import EducationEditor from './EducationEditor.vue';
import SkillEditor from './SkillEditor.vue';
import ProjectEditor from './ProjectEditor.vue';

const activeNames = ref(['basic', 'experience', 'projects', 'education', 'skills']);
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
