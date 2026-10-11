<template>
  <div ref="previewRef" class="resume-cover-preview" aria-hidden="true">
    <div class="resume-cover-preview__paper" :style="paperStyle">
      <component :is="templateComponent" :data="data" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { CSSProperties } from 'vue';
import type { ResumeData } from '@/types/resume';
import { getTemplateComponent } from '@/components/preview/template-registry';

const previewRef = ref<HTMLDivElement | null>(null);
const coverScale = ref(0.3);
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const updateScale = () => {
    const width = previewRef.value?.clientWidth || 0;
    if (!width) return;
    coverScale.value = Math.min(0.65, Math.max(0.18, (width - 12) / 794));
  };

  updateScale();
  if (previewRef.value) {
    resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(previewRef.value);
  }
});

onBeforeUnmount(() => resizeObserver?.disconnect());

const props = defineProps<{
  data: ResumeData;
}>();

const templateComponent = computed(() => getTemplateComponent(props.data.templateId) || getTemplateComponent('modern'));
const paperStyle = computed(() => ({
  '--font-size': `${props.data.theme?.fontSize || 14}px`,
  '--line-height': props.data.theme?.lineHeight || 1.5,
  '--spacing': `${props.data.theme?.moduleMargins?.bottom ?? 24}px`,
  '--resume-cover-scale': coverScale.value,
} as CSSProperties));
</script>

<style scoped>
.resume-cover-preview {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--ui-bg-subtle);
  pointer-events: none;
}

.resume-cover-preview__paper {
  position: absolute;
  top: 0;
  left: 50%;
  width: 210mm;
  min-height: 297mm;
  margin-left: -105mm;
  overflow: hidden;
  transform: scale(var(--resume-cover-scale));
  transform-origin: top center;
  background: #fff;
  box-shadow: 0 1px 5px rgb(15 23 42 / 14%);
}

</style>
