<template>
  <div class="thumbnail">
    <div v-if="templateComponent" class="thumbnail__viewport">
      <div class="thumbnail__stage">
        <component :is="templateComponent" :data="data" />
      </div>
    </div>
    <div v-else class="thumbnail__fallback">
      <span>{{ fallbackText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ResumeData } from '@/types/resume';
import { getTemplateComponent } from '@/components/preview/template-registry';

const props = defineProps<{
  templateId: string;
  data: ResumeData;
  fallbackText?: string;
}>();

const templateComponent = computed(() => getTemplateComponent(props.templateId));
</script>

<style scoped>
.thumbnail {
  position: relative;
  width: 100%;
  aspect-ratio: 210 / 200;
  overflow: hidden;
  background: var(--ui-bg-page);
}

.thumbnail__viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--ui-bg-subtle);
}

.thumbnail__stage {
  --scale: 0.24;
  width: calc(100% / var(--scale));
  min-height: calc(100% / var(--scale));
  transform: scale(var(--scale));
  transform-origin: top left;
  pointer-events: none;
  background: var(--ui-bg-elevated);
}

.thumbnail__fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-md);
  background: linear-gradient(135deg, var(--ui-bg-subtle), var(--ui-bg-page));
}
</style>
