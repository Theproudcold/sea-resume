<template>
  <div class="preview-panel">
    <ResumeCanvas>
      <component :is="currentTemplate" v-if="currentTemplate" :data="resumeData" />
      <div v-else class="p-8 text-center text-gray-500">
        <el-empty description="请选择一个模板开始制作简历" />
      </div>
    </ResumeCanvas>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import ResumeCanvas from './ResumeCanvas.vue';

const resumeStore = useResumeStore();
const { data: resumeData } = storeToRefs(resumeStore);

// 模板映射表（动态导入）
const templateComponents: Record<string, any> = {
  modern: defineAsyncComponent(() => import('./templates/ModernTemplate.vue')),
  professional: defineAsyncComponent(() => import('./templates/ProfessionalTemplate.vue')),
  creative: defineAsyncComponent(() => import('./templates/CreativeTemplate.vue')),
  minimal: defineAsyncComponent(() => import('./templates/MinimalTemplate.vue')),
  tech: defineAsyncComponent(() => import('./templates/TechTemplate.vue')),
};

const currentTemplate = computed(() => {
  return templateComponents[resumeData.value.templateId];
});
</script>

<style scoped>
.preview-panel {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  background: #f5f5f5;
}
</style>
