<template>
  <div class="resume-canvas-wrapper">
    <div ref="canvasRef" class="resume-canvas resume-document">
      <div ref="contentRef" class="resume-canvas-content">
        <slot></slot>
      </div>

      <!-- Visual Page Breaks (for Editor View only) -->
      <div v-for="(offset, index) in pageBreakOffsets" :key="`${index}-${offset}`"
           class="page-break-line no-print"
           :style="{ top: `${offset}px` }"
      >
        <span class="page-number">Page {{ index + 2 }}</span>
      </div>
    </div>
    <!-- Keep the physical ruler outside the exported/printed canvas. -->
    <div ref="rulerRef" class="a4-ruler no-print" aria-hidden="true"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { measurePageBreaks } from '@/utils/pageBreaks';

const canvasRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const rulerRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let scheduledFrame = 0;
let a4Height = 0;
let disposed = false;

/** 破页线位置：每页的结束偏移（相对画布顶边），最后不画在内容末尾。 */
const pageBreakOffsets = ref<number[]>([]);
/** 破页线数量 = 页数 - 1。 */
const pageCount = computed(() => pageBreakOffsets.value.length);
/** 首次有效测量完成前为 false；隐藏或标尺读数为 0 时退回 false。 */
const measured = ref(false);

/** 对外发布的页数：破页线数量加一，显示与分页共用同一次测量。 */
const totalPages = computed(() => (measured.value ? pageCount.value + 1 : null));
const pending = computed(() => !measured.value);

// 主预览通过 provide 把这份测量交给主题面板，避免两处各量一次。
defineExpose({ pageCount: totalPages, pending });

/** 切点几乎没变时不写 DOM，避免每次输入都重建破页线。 */
function sameOffsets(previous: readonly number[], next: readonly number[]): boolean {
  return previous.length === next.length
    && previous.every((offset, index) => Math.abs(offset - next[index]!) < 0.5);
}

const updatePageBreaks = () => {
  // Clear before measuring so later notifications can schedule the next frame.
  scheduledFrame = 0;
  const canvas = canvasRef.value;
  const content = contentRef.value;
  const ruler = rulerRef.value;
  if (disposed || !canvas || !content || !ruler) return;

  // display:none (including hidden ancestors) has no layout box. Keep the last
  // page count and wait for ResizeObserver to report the restored layout.
  const box = canvas.getClientRects()[0];
  if (!box || box.width <= 0 || box.height <= 0) {
    measured.value = false;
    return;
  }

  // Read layout together; marker overflow must never contribute to pagination.
  const pageHeight = a4Height || ruler.getBoundingClientRect().height;
  const contentHeight = Math.max(content.scrollHeight, content.offsetHeight);
  if (pageHeight <= 0) {
    measured.value = false;
    return;
  }
  a4Height = pageHeight;
  measured.value = true;
  // 破页线就是导出时真正的切点：只落在内容空隙里，预览与 PDF 才不会各切各的。
  const nextOffsets = measurePageBreaks(canvas, contentHeight, pageHeight).slice(0, -1);
  if (!sameOffsets(pageBreakOffsets.value, nextOffsets)) pageBreakOffsets.value = nextOffsets;
};

const scheduleUpdate = () => {
  if (disposed || scheduledFrame) return;
  scheduledFrame = requestAnimationFrame(updatePageBreaks);
};

const handleWindowResize = () => {
  // Reuse the ruler DOM, but recheck physical units after zoom/viewport changes.
  a4Height = 0;
  scheduleUpdate();
};

onMounted(() => {
  const canvas = canvasRef.value;
  const content = contentRef.value;
  if (!canvas || !content) return;
  scheduleUpdate();
  resizeObserver = new ResizeObserver(scheduleUpdate);
  resizeObserver.observe(content);
  mutationObserver = new MutationObserver(scheduleUpdate);
  mutationObserver.observe(content, {
    childList: true, subtree: true, characterData: true, attributes: true,
  });
  // Image load events do not bubble; capture also handles newly inserted images.
  content.addEventListener('load', scheduleUpdate, true);
  content.addEventListener('error', scheduleUpdate, true);
  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) scheduleUpdate();
    });
    intersectionObserver.observe(canvas);
  }
  window.addEventListener('resize', handleWindowResize);
  if ('fonts' in document) {
    // The ready promise cannot be cancelled; scheduleUpdate guards late resolution.
    void document.fonts.ready.then(scheduleUpdate, () => {});
    document.fonts.addEventListener('loadingdone', scheduleUpdate);
  }
});

onBeforeUnmount(() => {
  disposed = true;
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
  intersectionObserver?.disconnect();
  contentRef.value?.removeEventListener('load', scheduleUpdate, true);
  contentRef.value?.removeEventListener('error', scheduleUpdate, true);
  window.removeEventListener('resize', handleWindowResize);
  if ('fonts' in document) document.fonts.removeEventListener('loadingdone', scheduleUpdate);
  if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
  scheduledFrame = 0;
});
</script>

<style scoped>
.resume-canvas-wrapper {
  display: block;
  padding: var(--ui-space-4);
  background: var(--ui-bg-page);
  overflow: auto;
}

.resume-canvas {
  /* 预览列变窄时靠滚动而不是压缩：A4 图纸始终是 210mm。 */
  width: var(--a4-width);
  min-width: var(--a4-width);
  min-height: var(--a4-height);
  background: var(--resume-paper);
  box-shadow: var(--ui-shadow-md);
  margin: 0 auto;
  position: relative; /* For absolute positioning of breaks */
}

.resume-canvas-content {
  display: flow-root;
}

.a4-ruler {
  position: fixed;
  left: -10000px;
  top: 0;
  width: 1px;
  height: 297mm;
  visibility: hidden;
  pointer-events: none;
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
    background: #fff;
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
