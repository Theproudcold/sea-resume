<template>
  <div class="star-helper">
    <div class="star-helper__bar">
      <el-button
        link
        type="primary"
        size="small"
        data-testid="star-helper-toggle"
        @click="open = !open"
      >{{ open ? '收起 STAR 写作引导' : 'STAR 结构化填槽' }}</el-button>
      <el-button
        link
        size="small"
        data-testid="star-bold-metrics"
        :disabled="!hasMetricsToBold"
        title="将当前描述中的百分比、倍数、时长等量化数据加粗突出"
        @click="applyBoldMetrics"
      >加粗量化数字</el-button>
    </div>

    <div v-if="open" class="star-helper__panel">
      <p class="star-helper__tip">只填真实发生的要点，可留空部分项；插入时会自动拼装为清晰列表并突出量化数字。</p>
      <div class="star-helper__grid">
        <label class="star-helper__field">
          <span>S · 情境/痛点（选填）</span>
          <el-input v-model="parts.situation" size="small" placeholder="例如：高并发大促期间结算接口 P99 达 800ms" />
        </label>
        <label class="star-helper__field">
          <span>T · 目标/职责（选填）</span>
          <el-input v-model="parts.task" size="small" placeholder="例如：负责核心链路性能治理与稳定性保障" />
        </label>
        <label class="star-helper__field">
          <span>A · 具体动作（推荐）</span>
          <el-input v-model="parts.action" size="small" placeholder="例如：拆分慢查询并引入多级缓存与本地降级" />
        </label>
        <label class="star-helper__field">
          <span>R · 量化结果（推荐）</span>
          <el-input v-model="parts.result" size="small" placeholder="例如：接口耗时降低 45%，峰值承载提升 2 倍" />
        </label>
      </div>
      <div v-if="previewText" class="star-helper__preview">
        <small>预览：</small>{{ previewText }}
      </div>
      <div class="star-helper__actions">
        <el-button type="primary" size="small" data-testid="star-helper-insert" :disabled="!previewText" @click="insertStar">插入到描述</el-button>
        <el-button size="small" text @click="resetParts">清空</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import {
  appendStarBulletToHtml,
  boldResumeMetricsHtml,
  composeStarListItemHtml,
  composeStarPlainText,
} from '@/utils/starBuilder';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const open = ref(false);
const parts = reactive({
  situation: '',
  task: '',
  action: '',
  result: '',
});

const previewText = computed(() => composeStarPlainText(parts));
const boldedHtml = computed(() => boldResumeMetricsHtml(props.modelValue || ''));
const hasMetricsToBold = computed(() => boldedHtml.value !== (props.modelValue || ''));

function resetParts() {
  parts.situation = '';
  parts.task = '';
  parts.action = '';
  parts.result = '';
}

function insertStar() {
  const itemHtml = composeStarListItemHtml(parts, { boldMetrics: true });
  if (!itemHtml) return;
  emit('update:modelValue', appendStarBulletToHtml(props.modelValue || '', itemHtml));
  resetParts();
}

function applyBoldMetrics() {
  if (!hasMetricsToBold.value) return;
  emit('update:modelValue', boldedHtml.value);
}
</script>

<style scoped>
.star-helper {
  width: 100%;
  margin-top: 6px;
}

.star-helper__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.star-helper__panel {
  margin-top: 8px;
  padding: 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg-subtle);
}

.star-helper__tip {
  margin: 0 0 10px;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-xs);
  line-height: 1.5;
}

.star-helper__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}

.star-helper__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.star-helper__field span {
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-xs);
}

.star-helper__preview {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg-surface);
  color: var(--ui-text-main);
  font-size: var(--ui-font-xs);
  line-height: 1.55;
}

.star-helper__preview small {
  color: var(--ui-text-muted);
}

.star-helper__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

@media (max-width: 600px) {
  .star-helper__grid {
    grid-template-columns: 1fr;
  }
}
</style>
