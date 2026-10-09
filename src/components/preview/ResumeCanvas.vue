<template>
  <div class="resume-canvas-wrapper">
    <div ref="canvasRef" class="resume-canvas">
      <slot></slot>
      
      <!-- Visual Page Breaks (for Editor View only) -->
      <div v-for="i in pageCount" :key="i" 
           class="page-break-line no-print"
           :style="{ top: `calc(${i} * var(--a4-height))` }"
      >
        <span class="page-number">Page {{ i + 1 }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { estimateA4PageCount } from '@/utils/pageFit';

const canvasRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let scheduledFrame = 0;

const pageCount = ref(0);
const updatePageBreaks = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const measure = document.createElement('div');
  measure.style.cssText = 'position:fixed;left:-10000px;top:0;height:297mm;width:1px;visibility:hidden;';
  document.body.appendChild(measure);
  const a4Height = measure.getBoundingClientRect().height || measure.offsetHeight;
  measure.remove();
  const totalPages = estimateA4PageCount(canvas.scrollHeight, a4Height);
  pageCount.value = Math.max(0, totalPages - 1);
};

const scheduleUpdate = () => {
  if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
  scheduledFrame = requestAnimationFrame(updatePageBreaks);
};

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  scheduleUpdate();
  resizeObserver = new ResizeObserver(scheduleUpdate);
  resizeObserver.observe(canvas);
  mutationObserver = new MutationObserver(scheduleUpdate);
  mutationObserver.observe(canvas, { childList: true, subtree: true, characterData: true });
  if ('fonts' in document) void document.fonts.ready.then(scheduleUpdate);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
  if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
});
</script>

<style scoped>
.resume-canvas-wrapper {
  display: flex;
  justify-content: center;
  padding: var(--ui-space-4);
  background: var(--ui-bg-page);
  overflow: auto;
}

.resume-canvas {
  width: var(--a4-width);
  min-height: var(--a4-height);
  background: #fff;
  box-shadow: var(--ui-shadow-md);
  margin: 0 auto;
  position: relative; /* For absolute positioning of breaks */
}

.page-break-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: repeating-linear-gradient(to right, var(--ui-danger) 0, var(--ui-danger) 5px, transparent 5px, transparent 10px);
  z-index: 50;
  pointer-events: none;
}

.page-number {
  position: absolute;
  right: 0;
  top: -20px;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm) 0 0 var(--ui-radius-sm);
  background: var(--ui-danger);
  color: white;
  font-size: var(--ui-font-xs);
}

@media print {
  .resume-canvas-wrapper {
    padding: 0;
    background: white;
  }

  .resume-canvas {
    box-shadow: none;
    width: 100%;
    height: auto;
  }
  
  .page-break-line {
      display: none;
  }
}
</style>
