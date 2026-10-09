<template>
  <div class="preview-panel">
    <ResumeCanvas>
      <component :is="currentTemplate" v-if="currentTemplate" :data="previewData" />
      <div v-else class="preview-empty">
        <el-empty description="请选择一个模板开始制作简历" />
      </div>
    </ResumeCanvas>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { getTemplateComponent } from '@/components/preview/template-registry';
import ResumeCanvas from './ResumeCanvas.vue';
import { createPrivacyMaskedResume } from '@/utils/privacyMask';

const props = withDefaults(defineProps<{ privacyMode?: boolean }>(), { privacyMode: false });
const resumeStore = useResumeStore();
const { data: resumeData } = storeToRefs(resumeStore);
const previewData = computed(() => props.privacyMode ? createPrivacyMaskedResume(resumeData.value) : resumeData.value);

const currentTemplate = computed(() => getTemplateComponent(previewData.value.templateId));
</script>

<style scoped>
.preview-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: auto;
  background: var(--ui-bg-page);
}

.preview-empty {
  min-height: var(--a4-height);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted);
}
</style>
