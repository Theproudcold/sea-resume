<template>
  <div class="theme-editor space-y-6" @pointerdown.capture="beginHistoryGroup" @keydown.capture="beginHistoryGroup">

    <section class="fit-panel">
      <div class="fit-panel__heading">
        <div>
          <strong>A4 页面适配</strong>
          <p>根据当前预览估算，不替代浏览器打印预览。</p>
        </div>
        <el-tag :type="estimatedPages === null || estimatedPages > 1 ? 'warning' : 'success'" effect="plain">
          {{ estimatedPages === null ? '计算中' : `预估 ${estimatedPages} 页` }}
        </el-tag>
      </div>
      <p class="fit-panel__note">尝试适配仅调整排版，不删除文字；字号不会低于 12px。超长内容仍会保留为多页。</p>
      <div class="fit-panel__actions">
        <el-button type="primary" plain :loading="isFitting" :disabled="estimatedPages === null || estimatedPages <= 1 || isFitting" @click="fitToOnePage">尝试适配一页</el-button>
        <el-button v-if="originalTheme" text @click="restoreOriginalTheme">还原原排版</el-button>
      </div>
      <el-alert v-if="estimatedPages !== null && estimatedPages > 1" class="fit-panel__alert" type="warning" :closable="false" title="当前内容预计需要多页；可尝试紧凑排版，或精简内容后再查看打印预览。" />
    </section>
    <!-- 主题色 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">主题颜色</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="color in presetColors"
          :key="color"
          type="button"
          class="theme-color-swatch"
          :class="{ 'is-active': data.theme.color === color }"
          :style="{ '--swatch-color': color }"
          :aria-label="`使用主题色 ${color}`"
          :aria-pressed="data.theme.color === color"
          @click="updateColor(color)"
        />
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

    <!-- 模块边距 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">模块边距 (上/下/左/右)</label>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <span class="text-xs text-gray-500 mb-1 block">上: {{ data.theme.moduleMargins?.top || 0 }}px</span>
          <el-slider v-model="data.theme.moduleMargins.top" :min="0" :max="64" :step="4" @change="handleUpdate" />
        </div>
        <div>
          <span class="text-xs text-gray-500 mb-1 block">下: {{ data.theme.moduleMargins?.bottom || 0 }}px</span>
          <el-slider v-model="data.theme.moduleMargins.bottom" :min="0" :max="64" :step="4" @change="handleUpdate" />
        </div>
        <div>
          <span class="text-xs text-gray-500 mb-1 block">左: {{ data.theme.moduleMargins?.left || 0 }}px</span>
          <el-slider v-model="data.theme.moduleMargins.left" :min="0" :max="64" :step="4" @change="handleUpdate" />
        </div>
        <div>
          <span class="text-xs text-gray-500 mb-1 block">右: {{ data.theme.moduleMargins?.right || 0 }}px</span>
          <el-slider v-model="data.theme.moduleMargins.right" :min="0" :max="64" :step="4" @change="handleUpdate" />
        </div>
      </div>
    </div>

    <!-- 页面边距 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">页面边距 ({{ data.theme.pageMargins }}px)</label>
      <el-slider
        v-model="data.theme.pageMargins"
        :min="0"
        :max="60"
        :step="4"
        @change="handleUpdate"
      />
    </div>

    <!-- 日期格式 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">日期格式</label>
      <el-select v-model="data.theme.dateFormat" @change="handleUpdate" class="w-full">
        <el-option label="2023.01" value="YYYY.MM" />
        <el-option label="2023-01" value="YYYY-MM" />
        <el-option label="2023/01" value="YYYY/MM" />
        <el-option label="01/2023" value="MM/YYYY" />
        <el-option label="Jan 2023" value="MMM YYYY" />
      </el-select>
    </div>

    <!-- 字体选择 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">字体系列</label>
      <el-select v-model="data.theme.fontFamily" @change="handleUpdate" class="w-full">
        <el-option label="默认 (Sans Serif)" value="sans-serif" />
        <el-option label="衬线体 (Serif)" value="serif" />
        <el-option label="等宽体 (Monospace)" value="monospace" />
      </el-select>
    </div>

    <!-- 图标显示 -->
    <div class="form-item flex justify-between items-center">
      <label class="text-sm font-medium text-gray-700">显示联系方式图标</label>
      <el-switch
        v-model="imgIconState"
        @change="updateIconState"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import type { ThemeConfig } from '@/types/resume';
import { estimateA4PageCount, getCompactThemeSettings } from '@/utils/pageFit';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const estimatedPages = ref<number | null>(null);
const originalTheme = ref<ThemeConfig | null>(null);
const isFitting = ref(false);
function beginHistoryGroup() {
  resumeStore.startHistoryGroup();
}
let canvasObserver: ResizeObserver | null = null;
let contentObserver: MutationObserver | null = null;
let updateFrame = 0;

function updatePageEstimate() {
  const canvas = document.querySelector<HTMLElement>('.preview-panel .resume-canvas');
  if (!canvas || canvas.getBoundingClientRect().width <= 0) {
    estimatedPages.value = null;
    return;
  }
  const ruler = document.createElement('div');
  ruler.style.cssText = 'position:fixed;left:-10000px;top:0;height:297mm;width:1px;visibility:hidden;';
  document.body.appendChild(ruler);
  const a4Height = ruler.getBoundingClientRect().height || ruler.offsetHeight;
  ruler.remove();
  if (a4Height <= 0) {
    estimatedPages.value = null;
    return;
  }
  estimatedPages.value = estimateA4PageCount(canvas.scrollHeight, a4Height);
}

function schedulePageEstimate() {
  if (updateFrame) cancelAnimationFrame(updateFrame);
  updateFrame = requestAnimationFrame(updatePageEstimate);
}

watch(() => data.value.theme, schedulePageEstimate, { deep: true });
onMounted(() => {
  const canvas = document.querySelector<HTMLElement>('.preview-panel .resume-canvas');
  schedulePageEstimate();
  if (canvas && typeof ResizeObserver !== 'undefined') {
    canvasObserver = new ResizeObserver(schedulePageEstimate);
    canvasObserver.observe(canvas);
  }
  if (canvas && typeof MutationObserver !== 'undefined') {
    contentObserver = new MutationObserver(schedulePageEstimate);
    contentObserver.observe(canvas, { childList: true, subtree: true, characterData: true });
  }
});
onUnmounted(() => {
  canvasObserver?.disconnect();
  contentObserver?.disconnect();
  if (updateFrame) cancelAnimationFrame(updateFrame);
});

async function fitToOnePage() {
  if (estimatedPages.value === null || estimatedPages.value <= 1 || isFitting.value) return;
  try {
    await ElMessageBox.confirm(
      '将尝试调整字号、行高和边距；字号不低于 12px，任何文字都不会被删除。若仍超页，请精简内容。',
      '尝试适配一页 A4',
      { confirmButtonText: '应用紧凑排版', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }

  const previous = JSON.parse(JSON.stringify(data.value.theme)) as ThemeConfig;
  if (!originalTheme.value) originalTheme.value = previous;
  isFitting.value = true;
  try {
    resumeStore.updateTheme(getCompactThemeSettings(data.value.theme));
    await resumeStore.autoSave();
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    updatePageEstimate();
    if ((estimatedPages.value ?? 1) <= 1) ElMessage.success('紧凑排版已应用，预览估算为一页。');
    else ElMessage.warning(`已应用安全范围内的紧凑排版；当前仍约 ${estimatedPages.value} 页，建议精简内容。`);
  } catch (error) {
    resumeStore.updateTheme(previous);
    try { await resumeStore.autoSave(); } catch { /* keep the original error for the user */ }
    originalTheme.value = null;
    ElMessage.error('紧凑排版未能保存: ' + (error instanceof Error ? error.message : '未知错误'));
  } finally {
    isFitting.value = false;
  }
}

async function restoreOriginalTheme() {
  const snapshot = originalTheme.value;
  if (!snapshot) return;
  try {
    resumeStore.updateTheme(snapshot);
    await resumeStore.autoSave();
    originalTheme.value = null;
    await nextTick();
    schedulePageEstimate();
    ElMessage.success('已还原适配前的主题排版');
  } catch (error) {
    ElMessage.error('还原排版失败: ' + (error instanceof Error ? error.message : '未知错误'));
  }
}

const customColor = ref(data.value.theme?.color || '#2563eb');
const imgIconState = ref(data.value.theme.displayIcons !== false);

const updateIconState = (val: any) => {
  resumeStore.updateTheme({ displayIcons: val });
};

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
  resumeStore.scheduleSave();
};
</script>

<style scoped>
.theme-color-swatch {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  background: var(--swatch-color);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.theme-color-swatch:hover {
  transform: scale(1.08);
}

.theme-color-swatch.is-active {
  border-color: var(--ui-text-main);
  box-shadow: 0 0 0 2px var(--ui-bg-surface), 0 0 0 4px var(--ui-primary);
}

.theme-color-swatch:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 3px;
}
.fit-panel {
  padding: var(--ui-space-4);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg-subtle);
}

.fit-panel__heading,
.fit-panel__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.fit-panel__heading p,
.fit-panel__note {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-sm);
  line-height: 1.45;
}

.fit-panel__actions { justify-content: flex-start; margin-top: var(--ui-space-3); }
.fit-panel__alert { margin-top: var(--ui-space-3); }
</style>
