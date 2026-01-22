<template>
  <div class="resume-canvas-wrapper">
    <div id="resume-canvas" class="resume-canvas">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
// A4 尺寸画布组件
</script>

<style scoped>
.resume-canvas-wrapper {
  display: flex;
  justify-content: center;
  padding: 20px;
  background: #f5f5f5;
}

.resume-canvas {
  width: var(--a4-width);
  min-height: var(--a4-height);
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin: 0 auto;
  overflow: visible;
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
}
</style>
