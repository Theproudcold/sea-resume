<template>
  <div class="theme-editor space-y-6" @pointerdown.capture="beginHistoryGroup" @keydown.capture="beginHistoryGroup">

    <section class="fit-panel">
      <div class="fit-panel__heading">
        <div>
          <strong>页面排版</strong>
          <p>{{ fitUnavailable ? '请在电脑端显示预览，以计算页数并自动适配' : 'A4 纸张，实际页数以导出结果为准' }}</p>
        </div>
        <el-tag :type="fitUnavailable ? 'warning' : 'success'" effect="plain">
          {{ fitUnavailable ? '等待预览' : `预估 ${estimatedPages} 页` }}
        </el-tag>
      </div>
      <p class="fit-panel__note">调整间距和字号，尽量排成一页；不删内容，字号不小于 {{ MIN_FONT_SIZE }}px。</p>
      <div class="fit-panel__actions">
        <el-button type="primary" plain :loading="isFitting" :disabled="fitUnavailable || (estimatedPages ?? 0) <= 1 || isFitting" @click="fitToOnePage">尝试适配一页</el-button>
        <el-button v-if="canRestore" text @click="restoreOriginalTheme">还原原排版</el-button>
      </div>
      <el-alert v-if="!fitUnavailable && (estimatedPages ?? 0) > 1" class="fit-panel__alert" type="warning" :closable="false" title="当前为多页简历，可压缩排版或精简内容。" />
    </section>

    <section class="fit-panel">
      <div class="fit-panel__heading">
        <div>
          <strong>版式结构</strong>
          <p>{{ data.layout ? '当前使用自定义版式。字号和主题色仍在下面调整。' : '基于当前模板生成可编辑版式。细节可能和原模板不同，可以撤销。' }}</p>
        </div>
      </div>
      <div class="fit-panel__actions">
        <el-button v-if="!data.layout" type="primary" plain @click="customizeLayout">基于当前模板自定义</el-button>
        <el-button v-else text @click="clearLayout">恢复内置模板</el-button>
      </div>
      <template v-if="data.layout">
        <label class="layout-field"><span>栏数</span>
          <el-select aria-label="版式栏数" :model-value="data.layout.structure" @change="patchLayout({ structure: $event })">
            <el-option label="单栏" value="single" />
            <el-option label="左侧栏" value="sidebar-left" />
            <el-option label="右侧栏" value="sidebar-right" />
          </el-select>
        </label>
        <label v-if="data.layout.structure !== 'single'" class="layout-field"><span>侧栏宽度 ({{ data.layout.sidebarWidth }}%)</span>
          <el-slider aria-label="侧栏宽度" :model-value="data.layout.sidebarWidth" :min="24" :max="42" :step="1" @change="patchLayout({ sidebarWidth: $event })" />
        </label>
        <fieldset v-if="data.layout.structure !== 'single'" class="layout-field">
          <legend>放进侧栏的模块</legend>
          <el-checkbox v-for="section in sectionChoices" :key="section.id" :model-value="data.layout.sidebarSections.includes(section.id)" @change="toggleSidebarSection(section.id, $event)">{{ section.label }}</el-checkbox>
        </fieldset>
        <label class="layout-field"><span>个人简介</span>
          <el-select aria-label="简介位置" :model-value="data.layout.summaryPlacement" @change="patchLayout({ summaryPlacement: $event })">
            <el-option label="主栏" value="main" /><el-option label="侧栏" value="sidebar" /><el-option label="不显示" value="hidden" />
          </el-select>
        </label>
        <label class="layout-field"><span>联系方式</span>
          <el-select aria-label="联系方式位置" :model-value="data.layout.contactsPlacement" @change="patchLayout({ contactsPlacement: $event })">
            <el-option label="页眉" value="header" /><el-option label="侧栏" value="sidebar" />
          </el-select>
        </label>
        <label class="layout-field"><span>页眉</span>
          <el-select aria-label="页眉样式" :model-value="data.layout.header.variant" @change="patchHeader({ variant: $event })">
            <el-option label="行内" value="inline" /><el-option label="色带" value="banner" /><el-option label="堆叠" value="stacked" />
          </el-select>
        </label>
        <label class="layout-field"><span>头像</span>
          <el-select aria-label="头像位置" :model-value="data.layout.header.avatar" @change="patchHeader({ avatar: $event })">
            <el-option label="左侧" value="start" /><el-option label="右侧" value="end" /><el-option label="不显示" value="none" />
          </el-select>
        </label>
        <label class="layout-field"><span>标题</span>
          <el-select aria-label="标题样式" :model-value="data.layout.heading" @change="patchLayout({ heading: $event })">
            <el-option label="下划线" value="underline" /><el-option label="强调色" value="accent" /><el-option label="纯文字" value="plain" />
          </el-select>
        </label>
        <label class="layout-field"><span>纸色</span>
          <el-select aria-label="纸色" :model-value="data.layout.paper" @change="patchLayout({ paper: $event })">
            <el-option label="浅色" value="light" /><el-option label="深色" value="dark" />
          </el-select>
        </label>
      </template>
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
        <el-color-picker aria-label="自定义主题颜色" v-model="customColor" @change="updateColor" />
      </div>
    </div>

    <!-- 字体大小 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">字体大小 ({{ data.theme.fontSize }}px)</label>
      <el-slider
        aria-label="字体大小" v-model="data.theme.fontSize"
        :min="12"
        :max="18"
        :step="0.5"
        @change="handleUpdate"
      />
    </div>

    <!-- 行高 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">行间距 ({{ data.theme.lineHeight }})</label>
      <el-slider
        aria-label="行间距" v-model="data.theme.lineHeight"
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
          <span class="text-xs text-gray-500 mb-1 block">上: {{ moduleMargins.top }}px</span>
          <el-slider
            aria-label="模块上边距"
            :model-value="moduleMargins.top"
            :min="0"
            :max="64"
            :step="4"
            @update:model-value="updateModuleMargin('top', $event)"
            @change="handleUpdate"
          />
        </div>
        <div>
          <span class="text-xs text-gray-500 mb-1 block">下: {{ moduleMargins.bottom }}px</span>
          <el-slider
            aria-label="模块下边距"
            :model-value="moduleMargins.bottom"
            :min="0"
            :max="64"
            :step="4"
            @update:model-value="updateModuleMargin('bottom', $event)"
            @change="handleUpdate"
          />
        </div>
        <div>
          <span class="text-xs text-gray-500 mb-1 block">左: {{ moduleMargins.left }}px</span>
          <el-slider
            aria-label="模块左边距"
            :model-value="moduleMargins.left"
            :min="0"
            :max="64"
            :step="4"
            @update:model-value="updateModuleMargin('left', $event)"
            @change="handleUpdate"
          />
        </div>
        <div>
          <span class="text-xs text-gray-500 mb-1 block">右: {{ moduleMargins.right }}px</span>
          <el-slider
            aria-label="模块右边距"
            :model-value="moduleMargins.right"
            :min="0"
            :max="64"
            :step="4"
            @update:model-value="updateModuleMargin('right', $event)"
            @change="handleUpdate"
          />
        </div>
      </div>
    </div>

    <!-- 页面边距 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">页面边距 ({{ data.theme.pageMargins }}px)</label>
      <el-slider
        aria-label="页面留白" v-model="data.theme.pageMargins"
        :min="0"
        :max="60"
        :step="4"
        @change="handleUpdate"
      />
    </div>

    <!-- 日期格式 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">日期格式</label>
      <el-select aria-label="日期格式" v-model="data.theme.dateFormat" @change="handleUpdate" class="w-full">
        <el-option label="2023.01" value="YYYY.MM" />
        <el-option label="2023-01" value="YYYY-MM" />
        <el-option label="2023/01" value="YYYY/MM" />
        <el-option label="01/2023" value="MM/YYYY" />
        <el-option label="Jan 2023" value="MMM YYYY" />
      </el-select>
    </div>

    <!-- 字体选择 -->
    <div class="form-item">
      <label class="block text-sm font-medium text-gray-700 mb-2">字体</label>
      <el-select aria-label="字体" v-model="data.theme.fontFamily" @change="handleUpdate" class="w-full">
        <el-option label="推荐：Noto Sans SC + Inter" :value="RECOMMENDED_FONT_FAMILY" />
        <el-option label="系统默认字体" value="sans-serif" />
        <el-option label="衬线字体" value="serif" />
        <el-option label="等宽字体" value="monospace" />
      </el-select>
    </div>

    <!-- 图标显示 -->
    <div class="form-item flex justify-between items-center">
      <label class="text-sm font-medium text-gray-700">显示联系方式图标</label>
      <el-switch
        aria-label="显示联系方式图标"
        v-model="imgIconState"
        @change="updateIconState"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import type { LayoutHeader, LayoutRecipe } from '@/types/layout-template';
import { useResumeStore } from '@/stores/resume';
import { recipeForResume } from '@/utils/layout-template';
import { RECOMMENDED_FONT_FAMILY } from '@/utils/fonts';
import { MIN_FONT_SIZE } from '@/utils/pageFit';
import { useOnePageFit } from '@/composables/useOnePageFit';
import { previewPageMetricsKey } from '@/components/preview/previewPageMetrics';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

/** 每次开始拖动/按键编辑前先落一个撤销点，整段连续调整合并成一步。 */
function beginHistoryGroup() {
  resumeStore.startHistoryGroup();
}

// 页数由预览画布实测后发布；编辑器侧不自己量 DOM，避免两处读数不一致。
// 编辑器不在预览树内（如独立页面）时退回「未测量」，UI 显示计算中并禁用适配。
const pageMetrics = inject(previewPageMetricsKey, null) ?? {
  pending: computed(() => true),
  pageCount: computed(() => null),
};
const estimatedPages = pageMetrics.pageCount;
/** 尚未完成首次有效测量：既没有页数，画布也明确报告 pending。 */
const fitUnavailable = computed(() => pageMetrics.pending.value || estimatedPages.value === null);

// 适配一页由 composable 负责，组件只渲染主题 token 与按钮状态。
const { isFitting, canRestore, fitToOnePage, restoreOriginalTheme } = useOnePageFit(
  computed(() => data.value.theme),
  pageMetrics,
  {
    updateTheme: (theme) => resumeStore.updateTheme(theme),
    autoSave: () => resumeStore.autoSave(),
    beginHistoryGroup: () => resumeStore.startHistoryGroup(),
  },
);

const customColor = ref(data.value.theme?.color || '#2563eb');
const imgIconState = ref(data.value.theme?.displayIcons !== false);

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

const moduleMargins = computed(() => ({
  top: data.value.theme.moduleMargins?.top ?? 0,
  bottom: data.value.theme.moduleMargins?.bottom ?? 24,
  left: data.value.theme.moduleMargins?.left ?? 0,
  right: data.value.theme.moduleMargins?.right ?? 0,
}));

/** 更新模块四边边距，兼容旧数据缺失 moduleMargins 字段的情况。 */
const updateModuleMargin = (edge: 'top' | 'bottom' | 'left' | 'right', value: number | number[]) => {
  const next = Array.isArray(value) ? (value[0] ?? 0) : value;
  data.value.theme.moduleMargins = {
    ...moduleMargins.value,
    [edge]: next,
  };
};

const sectionChoices = computed(() => (data.value.sectionOrder || []).map((id) => ({
  id,
  label: data.value.sectionTitles?.[id]
    || data.value.customBlocks.find((block) => block.id === id)?.title
    || id,
})));

function customizeLayout() {
  resumeStore.updateLayout(recipeForResume({ ...data.value, layout: undefined }));
}

function clearLayout() {
  resumeStore.setTemplate(data.value.layout?.seedId || 'modern');
}

function patchLayout(patch: Partial<LayoutRecipe>) {
  const recipe = recipeForResume(data.value);
  const next = { ...recipe, ...patch };
  if (patch.paper && patch.paper !== recipe.paper) {
    next.tokens = {
      ...recipe.tokens,
      ink: patch.paper === 'dark' ? '#d7dee6' : '#1f2937',
      muted: patch.paper === 'dark' ? '#9aa6b2' : '#64748b',
    };
  }
  resumeStore.updateLayout(next);
}

function patchHeader(patch: Partial<LayoutHeader>) {
  const recipe = recipeForResume(data.value);
  patchLayout({ header: { ...recipe.header, ...patch } });
}

function toggleSidebarSection(id: string, checked: string | number | boolean) {
  const current = recipeForResume(data.value).sidebarSections;
  const sidebarSections = checked ? [...new Set([...current, id])] : current.filter((item) => item !== id);
  patchLayout({ sidebarSections });
}
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
.layout-field { display: flex; flex-direction: column; gap: 6px; margin-top: var(--ui-space-3); min-width: 0; }
.layout-field legend, .layout-field > span { color: var(--ui-text-secondary); font-size: var(--ui-font-sm); }
</style>
