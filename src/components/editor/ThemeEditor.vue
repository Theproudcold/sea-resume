<template>
  <div class="theme-editor space-y-6">
    <!-- 主题色 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">主题颜色</label>
      <div class="flex flex-wrap gap-2">
        <div
          v-for="color in presetColors"
          :key="color"
          class="w-8 h-8 rounded-full cursor-pointer border-2 transition-all"
          :class="{ 'border-gray-900 scale-110': data.theme.color === color, 'border-transparent': data.theme.color !== color }"
          :style="{ backgroundColor: color }"
          @click="updateColor(color)"
        ></div>
        <el-color-picker v-model="customColor" @change="updateColor" />
      </div>
    </div>

    <!-- 字体大小 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">字体大小 ({{ data.theme.fontSize }}px)</label>
      <el-slider
        v-model="data.theme.fontSize"
        :min="12"
        :max="18"
        :step="0.5"
        @change="handleUpdate"
      />
    </div>

    <!-- 行高 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">行高 ({{ data.theme.lineHeight }})</label>
      <el-slider
        v-model="data.theme.lineHeight"
        :min="1.0"
        :max="2.0"
        :step="0.1"
        @change="handleUpdate"
      />
    </div>

    <!-- 模块间距 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">模块间距 ({{ data.theme.spacing }}px)</label>
      <el-slider
        v-model="data.theme.spacing"
        :min="12"
        :max="48"
        :step="4"
        @change="handleUpdate"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const customColor = ref(data.value.theme?.color || '#2563eb');

const presetColors = [
  '#2563eb', // Blue (Default)
  '#dc2626', // Red
  '#059669', // Green
  '#7c3aed', // Purple
  '#d97706', // Amber
  '#0f172a', // Slate (Dark)
  '#4b5563', // Gray
];

const updateColor = (color: string | null) => {
  if (color) {
    resumeStore.updateTheme({ color });
    customColor.value = color;
  }
};

const handleUpdate = () => {
  resumeStore.debouncedSave();
};
</script>

<style scoped>
.form-item {
  background: white;
  padding: 0;
}
</style>
