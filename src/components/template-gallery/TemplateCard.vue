<template>
  <article class="template-card">
    <div class="template-card__preview" aria-hidden="true" @click="$emit('preview')">
      <TemplateThumbnail :template-id="template.id" :data="demoData" :fallback-text="template.name" />
      <el-tag class="template-card__badge" size="small" type="primary" effect="light">{{ template.categoryLabel }}</el-tag>
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
        <el-button @click="$emit('preview')">预览并选择</el-button>
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
  display: flex;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper-3);
  box-shadow: var(--shadow-card);
  transition: transform var(--dur-micro) var(--ease-out), box-shadow var(--dur-micro) var(--ease-out), border-color var(--dur-micro) var(--ease-out);
}

@media (hover: hover) {
  .template-card:hover {
    border-color: var(--color-rule-2);
    box-shadow: var(--shadow-float);
    transform: translateY(-2px);
  }
}

/* The sheet leads the card: a white A4 page on a tinted stage. */
.template-card__preview {
  position: relative;
  padding: var(--space-md) var(--space-lg) 0;
  border-bottom: var(--rule-hair) solid var(--color-rule);
  background: var(--color-paper-2);
  cursor: pointer;
}

.template-card__preview :deep(.thumbnail) {
  border: var(--rule-hair) solid var(--color-rule);
  border-bottom: 0;
  box-shadow: var(--shadow-card);
}

.template-card__preview:active :deep(.thumbnail) {
  border-color: var(--color-rule-2);
}

.template-card__badge {
  position: absolute;
  top: var(--space-xs);
  left: var(--space-xs);
  z-index: var(--z-base);
  font-family: var(--font-display);
  font-weight: 500;
}

.template-card__body {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
}

.template-card__meta {
  min-width: 0;
}

.template-card__title {
  margin: 0;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  letter-spacing: var(--tracking-display);
  line-height: 1.25;
}

.template-card__desc {
  margin: var(--space-2xs) 0 0;
  color: var(--color-muted);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--ui-line-height);
}

.template-card__keywords {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
}

.template-card__keywords :deep(.el-tag) {
  border-radius: var(--radius-input);
  font-family: var(--font-display);
}

.template-card__actions {
  display: flex;
  margin-top: auto;
  padding-top: var(--space-2xs);
}

@media (max-width: 768px) {
  .template-card {
    display: grid;
    grid-template-columns: 136px minmax(0, 1fr);
    align-items: stretch;
  }

  .template-card__preview {
    padding: var(--space-sm) var(--space-sm) 0;
    border-right: var(--rule-hair) solid var(--color-rule);
    border-bottom: 0;
  }

  .template-card__actions :deep(.el-button) {
    width: 100%;
  }
}
</style>
