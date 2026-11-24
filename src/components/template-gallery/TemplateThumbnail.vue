<template>
  <div ref="thumbnailRef" class="thumbnail">
    <div v-if="templateComponent && visible" class="thumbnail__viewport">
      <div class="thumbnail__stage resume-document" :style="{ '--scale': scale }">
        <component :is="templateComponent" :data="data" />
      </div>
    </div>
    <div v-else class="thumbnail__fallback">
      <span>{{ fallbackText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ResumeData } from '@/types/resume';
import { resolveTemplateView } from '@/components/preview/template-registry';
import { useWhenVisible } from '@/composables/useWhenVisible';

const props = defineProps<{
  templateId: string;
  data: ResumeData;
  fallbackText?: string;
}>();

const A4_WIDTH_PX = 794;
const thumbnailRef = ref<HTMLDivElement | null>(null);
const visible = useWhenVisible(thumbnailRef);
const scale = ref(0.36);
let resizeObserver: ResizeObserver | null = null;

const updateScale = () => {
  const width = thumbnailRef.value?.clientWidth || 0;
  if (width) scale.value = Math.min(1, width / A4_WIDTH_PX);
};

onMounted(() => {
  updateScale();
  if (thumbnailRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(thumbnailRef.value);
  }
});

onBeforeUnmount(() => resizeObserver?.disconnect());

const templateComponent = computed(() => resolveTemplateView({
  ...props.data,
  templateId: props.data.templateId || props.templateId,
}));
</script>

<style scoped>
.thumbnail {
  position: relative;
  width: 100%;
  aspect-ratio: 210 / 297;
  overflow: hidden;
  background: var(--color-paper-2);
}

.thumbnail__viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--resume-paper);
}

.thumbnail__stage {
  position: absolute;
  top: 0;
  left: 0;
  width: 210mm;
  min-height: 297mm;
  transform: scale(var(--scale));
  transform-origin: top left;
  pointer-events: none;
  background: var(--resume-paper);
}

.thumbnail__fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-md);
  background: var(--color-paper-2);
  color: var(--color-muted);
  font-size: var(--text-sm);
  font-weight: 500;
  text-align: center;
}
</style>
