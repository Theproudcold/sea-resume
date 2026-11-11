<template>
  <section class="toolbar">
    <div class="toolbar__row toolbar__row--categories" role="group" aria-label="模板分类">
      <button
        v-for="category in categories"
        :key="category.value"
        type="button"
        class="toolbar__tag"
        :class="{ 'is-active': category.value === activeCategory }"
        :aria-pressed="category.value === activeCategory"
        @click="$emit('update:category', category.value)"
      >
        {{ category.label }}
      </button>
    </div>
    <div class="toolbar__row toolbar__row--controls">
      <el-input
        :model-value="search"
        placeholder="搜索模板名称、描述或关键词"
        clearable
        @update:model-value="(value: string) => $emit('update:search', value)"
      />
      <el-select
        class="toolbar__sort"
        :model-value="sortBy"
        @update:model-value="(value: TemplateSortKey) => $emit('update:sort', value)"
      >
        <el-option label="推荐优先" value="recommended" />
        <el-option label="名称排序" value="name" />
        <el-option label="最近使用" value="recent" />
      </el-select>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { TemplateSortKey } from '@/utils/template-gallery';
import type { TemplateMetadata } from '@/types/resume';

defineProps<{
  categories: Array<{
    value: TemplateMetadata['category'] | 'all';
    label: string;
  }>;
  activeCategory: TemplateMetadata['category'] | 'all';
  search: string;
  sortBy: TemplateSortKey;
}>();

defineEmits<{
  'update:category': [value: TemplateMetadata['category'] | 'all'];
  'update:search': [value: string];
  'update:sort': [value: TemplateSortKey];
}>();
</script>

<style scoped>
.toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-sm) var(--space-lg);
  padding-bottom: var(--space-md);
  border-bottom: var(--rule-hair) solid var(--color-rule);
}

.toolbar__row {
  display: flex;
  min-width: 0;
}

/* Category choice: keys on a sunken tray; the chosen key is raised. */
.toolbar__row--categories {
  flex-wrap: wrap;
  gap: var(--space-3xs);
  justify-self: start;
  padding: var(--space-3xs);
  border-radius: var(--radius-input);
  background: var(--color-sunken);
}

.toolbar__tag {
  min-width: 0;
  min-height: var(--control-height-s);
  padding: 0 var(--space-sm);
  border: 0;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--color-ink-2);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--dur-micro) var(--ease-out), color var(--dur-micro) var(--ease-out), box-shadow var(--dur-micro) var(--ease-out);
}

@media (hover: hover) {
  .toolbar__tag:not(.is-active):hover {
    color: var(--color-ink);
    background: color-mix(in oklab, var(--color-paper-3) 55%, transparent);
  }
}

.toolbar__tag:active {
  box-shadow: var(--shadow-key-press);
}

.toolbar__tag.is-active {
  background: var(--color-paper-3);
  color: var(--color-ink);
  font-weight: 600;
  box-shadow: var(--shadow-card);
}

.toolbar__tag:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 1px;
}

.toolbar__row--controls {
  align-items: center;
  gap: var(--space-xs);
}

.toolbar__row--controls :deep(.el-input) {
  flex: 1 1 auto;
  min-width: 0;
}

.toolbar__sort {
  width: 11rem;
  flex-shrink: 0;
}

@media (max-width: 1024px) {
  .toolbar {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 768px) {
  .toolbar__row--categories {
    flex-wrap: nowrap;
    max-width: 100%;
    overflow-x: auto;
  }

  .toolbar__row--controls {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar__row--controls :deep(.el-input),
  .toolbar__sort {
    width: 100%;
  }
}
</style>
