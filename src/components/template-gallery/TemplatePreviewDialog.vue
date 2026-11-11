<template>
  <el-dialog
    :model-value="visible"
    :title="template?.name || '模板预览'"
    width="var(--ui-dialog-width-xl)"
    align-center
    @close="$emit('update:visible', false)"
  >
    <div v-if="template" class="preview-dialog">
      <div class="preview-dialog__intro">
        <div>
          <p class="preview-dialog__title">{{ template.name }}</p>
          <p class="preview-dialog__desc">{{ template.description }}</p>
        </div>
        <div class="preview-dialog__tags">
          <el-tag type="primary" effect="light">{{ template.categoryLabel }}</el-tag>
          <el-tag v-for="keyword in template.keywords.slice(0, 3)" :key="keyword" effect="plain" type="info">
            {{ keyword }}
          </el-tag>
        </div>
      </div>
      <div class="preview-dialog__canvas">
        <div class="preview-dialog__paper resume-document">
          <component :is="templateComponent" v-if="templateComponent" :data="previewData" />
          <el-empty v-else description="模板预览暂不可用" />
        </div>
      </div>
    </div>
    <template #footer>
      <p v-if="!canApplyToCurrent" class="preview-dialog__hint">应用到当前简历需从编辑器进入模板库。</p>
      <div class="app-dialog-actions preview-dialog__actions">
        <el-button :type="canApplyToCurrent ? 'default' : 'primary'" @click="$emit('create')">创建新简历</el-button>
        <el-button :type="canApplyToCurrent ? 'primary' : 'default'" :disabled="!canApplyToCurrent" @click="$emit('apply')">应用到当前简历</el-button>
        <el-button @click="$emit('update:visible', false)">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ResumeData, TemplateMetadata } from '@/types/resume';
import { getTemplateComponent } from '@/components/preview/template-registry';

const props = defineProps<{
  visible: boolean;
  template: TemplateMetadata | null;
  previewData: ResumeData;
  canApplyToCurrent: boolean;
}>();

defineEmits<{
  'update:visible': [value: boolean];
  create: [];
  apply: [];
}>();

const templateComponent = computed(() => (props.template ? getTemplateComponent(props.template.id) : null));
</script>

<style scoped>
.preview-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.preview-dialog__intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.preview-dialog__title {
  margin: 0;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
  letter-spacing: var(--tracking-display);
  line-height: 1.2;
}

.preview-dialog__desc {
  max-width: 62ch;
  margin: var(--space-2xs) 0 0;
  color: var(--color-muted);
  font-family: var(--font-body);
  font-size: var(--text-sm);
}

.preview-dialog__tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2xs);
}

/* The sheet: a white A4 page with a hairline edge, on a sunken stage. */
.preview-dialog__canvas {
  max-height: min(68dvh, 900px);
  overflow: auto;
  padding: var(--space-lg);
  border-radius: var(--radius-card);
  background: var(--color-sunken);
}

.preview-dialog__paper {
  box-sizing: content-box;
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  border: var(--rule-hair) solid var(--color-rule);
  background: var(--resume-paper);
  box-shadow: var(--shadow-card);
}

.preview-dialog__hint {
  margin: 0 0 var(--space-xs);
  color: var(--color-muted);
  font-size: var(--text-sm);
}

@media (max-width: 768px) {
  .preview-dialog__intro {
    flex-direction: column;
  }

  .preview-dialog__tags {
    justify-content: flex-start;
  }

  .preview-dialog__canvas {
    max-height: 54dvh;
    padding: var(--space-xs);
  }

  .preview-dialog__actions {
    flex-direction: column;
  }

  .preview-dialog__actions :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }
}
</style>
