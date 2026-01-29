<template>
  <div class="resume-canvas-wrapper">
    <div id="resume-canvas" class="resume-canvas">
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

const pageCount = ref(0);
let resizeObserver: ResizeObserver | null = null;

const updatePageBreaks = () => {
    const el = document.getElementById('resume-canvas');
    if (!el) return;
    
    // Get A4 height in pixels (approx 1123px at 96dpi, but better to read from CSS var if possible or hardcode mm->px ratio)
    // 297mm at 96dpi is approx 1122.5px.
    // Let's use getComputedStyle to be safe if --a4-height is set in px or absolute units.
    // Actually, simpler: read .resume-canvas height and divide by expected A4 height.
    
    // We need to know the pixel value of 297mm on this screen.
    // A trick is to create a temp element.
    const tempDiv = document.createElement('div');
    tempDiv.style.height = '297mm';
    document.body.appendChild(tempDiv);
    const a4HeightPx = tempDiv.offsetHeight;
    document.body.removeChild(tempDiv);

    if (a4HeightPx > 0) {
        const totalHeight = el.scrollHeight;
        pageCount.value = Math.floor(totalHeight / a4HeightPx);
    }
};

onMounted(() => {
    updatePageBreaks();
    resizeObserver = new ResizeObserver(updatePageBreaks);
    const el = document.getElementById('resume-canvas');
    if (el) resizeObserver.observe(el);
});

onUnmounted(() => {
    if (resizeObserver) resizeObserver.disconnect();
});
</script>

<style scoped>
.resume-canvas-wrapper {
  display: flex;
  justify-content: center;
  padding: 20px;
  background: #f5f5f5;
  overflow: auto; /* Allow scrolling if canvas is huge */
}

.resume-canvas {
  width: var(--a4-width);
  min-height: var(--a4-height);
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin: 0 auto;
  position: relative; /* For absolute positioning of breaks */
}

.page-break-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: repeating-linear-gradient(to right, #ff6b6b 0, #ff6b6b 5px, transparent 5px, transparent 10px);
    z-index: 50;
    pointer-events: none;
}

.page-number {
    position: absolute;
    right: 0;
    top: -20px;
    background: #ff6b6b;
    color: white;
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 4px 0 0 4px;
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
