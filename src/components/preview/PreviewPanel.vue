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
import { computed, useTemplateRef } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { resolveTemplateView } from '@/components/preview/template-registry';
import ResumeCanvas from './ResumeCanvas.vue';
import { createPrivacyMaskedResume } from '@/utils/privacyMask';

const props = withDefaults(defineProps<{ privacyMode?: boolean }>(), { privacyMode: false });
const resumeStore = useResumeStore();
const { data: resumeData } = storeToRefs(resumeStore);
const previewData = computed(() => props.privacyMode ? createPrivacyMaskedResume(resumeData.value) : resumeData.value);

const currentTemplate = computed(() => resolveTemplateView(previewData.value));

// Expose measurements to the common editor parent; sibling panels cannot inject from here.
const canvasRef = useTemplateRef<InstanceType<typeof ResumeCanvas>>('canvasRef');
defineExpose({
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
