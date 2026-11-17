<template>
  <div class="preview-panel">
    <ResumeCanvas ref="canvasRef">
      <component :is="currentTemplate" v-if="currentTemplate" :data="previewData" />
      <div v-else class="preview-empty">
        <el-empty description="还没有可用的模板" />
      </div>
    </ResumeCanvas>
  </div>
</template>

<script setup lang="ts">
import { computed, provide, useTemplateRef } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { getTemplateComponent } from '@/components/preview/template-registry';
import ResumeCanvas from './ResumeCanvas.vue';
import { previewPageMetricsKey } from './previewPageMetrics';
import { createPrivacyMaskedResume } from '@/utils/privacyMask';

const props = withDefaults(defineProps<{ privacyMode?: boolean }>(), { privacyMode: false });
const resumeStore = useResumeStore();
const { data: resumeData } = storeToRefs(resumeStore);
const previewData = computed(() => props.privacyMode ? createPrivacyMaskedResume(resumeData.value) : resumeData.value);

const currentTemplate = computed(() => getTemplateComponent(previewData.value.templateId));

// 页数由画布的实测结果发布给主题面板；面板不再自己量一遍 DOM。
const canvasRef = useTemplateRef<InstanceType<typeof ResumeCanvas>>('canvasRef');
provide(previewPageMetricsKey, {
  pending: computed(() => canvasRef.value?.pending ?? true),
  pageCount: computed(() => canvasRef.value?.pageCount ?? null),
});
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
