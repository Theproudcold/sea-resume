<template>
  <section class="toolbar">
    <div class="toolbar__row toolbar__row--categories">
      <el-tag
        v-for="category in categories"
        :key="category.value"
        class="toolbar__tag"
        :effect="category.value === activeCategory ? 'dark' : 'plain'"
        :type="category.value === activeCategory ? 'primary' : 'info'"
        tabindex="0"
        role="button"
        :aria-pressed="category.value === activeCategory"
        @click="$emit('update:category', category.value)"
        @keydown.enter.prevent="$emit('update:category', category.value)"
        @keydown.space.prevent="$emit('update:category', category.value)"
      >
        {{ category.label }}
      </el-tag>
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
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4) var(--ui-space-6);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-bg-surface);
}

.toolbar__row {
  display: flex;
  gap: var(--ui-space-3);
}

.toolbar__row--categories {
  flex-wrap: wrap;
}

.toolbar__tag {
  cursor: pointer;
}

.toolbar__tag:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

.toolbar__row--controls {
  align-items: center;
}

.toolbar__row--controls :deep(.el-input) {
  flex: 1;
  min-width: 0;
}

.toolbar__sort {
  width: 180px;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .toolbar {
    padding: var(--ui-space-4);
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
