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
          <el-tag effect="plain">{{ template.categoryLabel }}</el-tag>
          <el-tag v-for="keyword in template.keywords.slice(0, 3)" :key="keyword" effect="plain" type="info">
            {{ keyword }}
          </el-tag>
        </div>
      </div>
      <div class="preview-dialog__canvas">
        <div class="preview-dialog__paper">
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
  gap: var(--ui-space-4);
}

.preview-template-dialog :deep(.el-dialog__body) {
  max-height: calc(100dvh - 200px);
  overflow-y: auto;
}

.preview-dialog__intro {
  display: flex;
  justify-content: space-between;
  gap: var(--ui-space-4);
  align-items: flex-start;
}

.preview-dialog__title {
  margin: 0;
  font-size: var(--ui-font-xl);
  font-weight: 650;
  color: var(--ui-text-main);
}

.preview-dialog__desc {
  margin: var(--ui-space-2) 0 0;
  color: var(--ui-text-secondary);
}

.preview-dialog__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}

.preview-dialog__canvas {
  max-height: min(68dvh, 900px);
  overflow: auto;
  padding: var(--ui-space-4);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-bg-page);
}

.preview-dialog__paper {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  background: #fff;
  box-shadow: var(--ui-shadow-md);
}

.preview-dialog__hint {
  margin: 0 0 var(--ui-space-2);
  color: var(--ui-text-muted);
  font-size: var(--ui-font-sm);
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
    padding: var(--ui-space-2);
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
