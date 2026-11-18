<template>
  <el-dialog
    :model-value="visible"
    :title="template?.name || '模板预览'"
    width="var(--ui-dialog-width-xl)"
    align-center
    :close-on-click-modal="!loading"
    :close-on-press-escape="!loading"
    :show-close="!loading"
    @close="$emit('update:visible', false)"
  >
    <div v-if="template" class="preview-dialog">
      <div class="preview-dialog__intro">
        <div>
          <p class="preview-dialog__desc">{{ template.description }}</p>
        </div>
        <div class="preview-dialog__tags">
          <el-tag type="primary" effect="light">{{ template.categoryLabel }}</el-tag>
          <el-tag v-for="keyword in template.keywords.slice(0, 3)" :key="keyword" effect="plain" type="info">
            {{ keyword }}
          </el-tag>
        </div>
      </div>
      <div ref="canvas" class="preview-dialog__canvas">
        <div class="preview-dialog__paper resume-document" :style="{ '--preview-scale': previewScale }">
          <component :is="templateComponent" v-if="templateComponent" :data="previewData" />
          <el-empty v-else description="模板预览暂不可用" />
        </div>
      </div>
    </div>
    <template #footer>
      <p v-if="canApplyToCurrent" class="preview-dialog__hint">{{ template?.source === 'custom' ? '此模板包含已保存的简历内容，使用时会替换当前内容。' : '只更换模板，已填写的内容保持不变。' }}</p>
      <div class="app-dialog-actions preview-dialog__actions">
        <el-button :disabled="loading" @click="$emit('update:visible', false)">返回模板库</el-button>
        <el-button :type="canApplyToCurrent ? 'default' : 'primary'" :loading="loading && !canApplyToCurrent" :disabled="loading" @click="$emit('create')">用此模板新建</el-button>
        <el-button v-if="canApplyToCurrent" type="primary" :loading="loading" @click="$emit('apply')">使用此模板</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { ResumeData, TemplateMetadata } from '@/types/resume';
import { getTemplateComponent } from '@/components/preview/template-registry';

const props = defineProps<{
  visible: boolean;
  template: TemplateMetadata | null;
  previewData: ResumeData;
  canApplyToCurrent: boolean;
  loading?: boolean;
}>();

defineEmits<{
  'update:visible': [value: boolean];
  create: [];
  apply: [];
}>();

const canvas = ref<HTMLElement | null>(null);
const previewScale = ref(1);
let resizeObserver: ResizeObserver | undefined;
watch(canvas, (element) => {
  resizeObserver?.disconnect();
  if (!element || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(([entry]) => {
    if (entry && entry.contentRect.width > 0) previewScale.value = Math.min(1, entry.contentRect.width / 796);
  });
  resizeObserver.observe(element);
}, { flush: 'post' });
onBeforeUnmount(() => resizeObserver?.disconnect());

const templateComponent = computed(() => {
  if (!props.template) return null;
  return getTemplateComponent(props.previewData.templateId || props.template.baseTemplateId || props.template.id);
});
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
  zoom: var(--preview-scale, 1);
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
    flex: 0 0 auto;
    width: 100%;
    min-height: 40px;
    margin-left: 0;
  }
}
</style>
