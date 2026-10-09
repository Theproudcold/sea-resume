<template>
  <article class="template-card">
    <div class="template-card__preview">
      <TemplateThumbnail :template-id="template.id" :data="demoData" :fallback-text="template.name" />
      <el-tag class="template-card__badge" size="small" effect="dark">{{ template.categoryLabel }}</el-tag>
    </div>
    <div class="template-card__body">
      <div class="template-card__meta">
        <h3 class="template-card__title">{{ template.name }}</h3>
        <p class="template-card__desc">{{ template.description }}</p>
      </div>
      <div class="template-card__keywords">
        <el-tag
          v-for="keyword in template.keywords.slice(0, 3)"
          :key="keyword"
          size="small"
          effect="plain"
          type="info"
        >
          {{ keyword }}
        </el-tag>
      </div>
      <div class="template-card__actions">
        <el-button type="primary" @click="$emit('preview')">预览并选择</el-button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { ResumeData, TemplateMetadata } from '@/types/resume';
import TemplateThumbnail from './TemplateThumbnail.vue';

defineProps<{
  template: TemplateMetadata;
  demoData: ResumeData;
}>();

defineEmits<{
  preview: [];
}>();
</script>

<style scoped>
.template-card {
  overflow: hidden;
  border-radius: var(--ui-radius-lg);
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-surface);
  box-shadow: var(--ui-shadow-sm);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

@media (hover: hover) {
  .template-card:hover {
    transform: translateY(-3px);
    box-shadow: var(--ui-shadow-md);
  }
}

.template-card__preview {
  position: relative;
  border-bottom: 1px solid var(--ui-border);
}

.template-card__badge {
  position: absolute;
  top: 14px;
  right: 14px;
}

.template-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4);
}

.template-card__title {
  margin: 0;
  font-size: var(--ui-font-title);
  font-weight: 700;
  color: var(--ui-text-main);
}

.template-card__desc {
  margin: var(--ui-space-2) 0 0;
  min-height: 44px;
  color: var(--ui-text-secondary);
  line-height: 1.6;
  font-size: var(--ui-font-md);
}

.template-card__keywords {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.template-card__actions {
  display: flex;
  gap: var(--ui-space-3);
}

.template-card__actions :deep(.el-button) {
  flex: 1;
}
</style>
