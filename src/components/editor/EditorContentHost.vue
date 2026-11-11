<template>
  <div class="editor-section-stage" :data-section-id="sectionId">
    <section v-if="sectionId === 'theme' || sectionId === 'basic'" :id="`editor-section-${sectionId}`" class="editor-settings-panel">
      <div class="editor-detail-heading">
        <h2>{{ sectionId === 'theme' ? '主题设置' : '基础信息' }}</h2>
      </div>
      <ThemeEditor v-if="sectionId === 'theme'" />
      <BasicInfoEditor v-else />
    </section>

    <EditorSection
      v-else-if="section"
      :id="`editor-section-${sectionId}`"
      :title="title"
      :is-open="true"
      :visible="visible"
      :icon="section.icon"
      :show-drag-handle="false"
      :show-visibility="false"
      :removable="false"
      :collapsible="false"
      @update:title="(value) => isCurrentResume && emit('updateTitle', sectionId, value)"
    >
      <template #header-actions>
        <el-button v-if="addActionLabel" :icon="Plus" @click.stop="isCurrentResume && emit('add', sectionId)">
          {{ addActionLabel }}
        </el-button>
      </template>
      <component :is="section.component" v-if="!custom" ref="editorRef" />
      <CustomBlockEditor
        v-else
        :id="sectionId"
        ref="editorRef"
        :model-value="content"
        @update:model-value="(value) => isCurrentResume && emit('updateContent', sectionId, value)"
        @delete="isCurrentResume && emit('delete', sectionId)"
      />
    </EditorSection>
    <el-empty v-else description="请选择或添加一个简历模块" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import { useResumeStore } from '@/stores/resume';
import { Plus } from '@element-plus/icons-vue';
import type { CustomItem } from '@/types/resume';
import BasicInfoEditor from './BasicInfoEditor.vue';
import ThemeEditor from './ThemeEditor.vue';
import EditorSection from './EditorSection.vue';
import CustomBlockEditor from './CustomBlockEditor.vue';

defineProps<{
  sectionId: string;
  section?: { id: string; icon: Component; component: Component | null };
  title: string;
  visible: boolean;
  custom: boolean;
  content: string | CustomItem[];
  addActionLabel: string;
}>();
const emit = defineEmits<{
  updateTitle: [id: string, value: string];
  updateContent: [id: string, value: string | CustomItem[]];
  delete: [id: string];
  add: [id: string];
}>();
const editorRef = ref<{ addNew?: () => void; addItem?: () => void } | null>(null);
// An outgoing host may still receive an async rich-text event during a resume
// switch. Never let that old instance write into the newly loaded resume.
const resumeStore = useResumeStore();
const resumeId = resumeStore.data.id;
const isCurrentResume = computed(() => resumeStore.data.id === resumeId);
// Keep the panel's active editor API while caching the actual editor subtree.
defineExpose({
  addNew: () => { if (isCurrentResume.value) editorRef.value?.addNew?.(); },
  addItem: () => { if (isCurrentResume.value) editorRef.value?.addItem?.(); },
});
</script>

<style scoped>
/* Theme and basic info hold a form with no inner cards, so the form itself sits on one raised card. */
.editor-settings-panel {
  padding: 0 var(--space-lg) var(--space-lg);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper-3);
  box-shadow: var(--shadow-card);
}

.editor-detail-heading {
  display: flex;
  min-height: 52px;
  align-items: center;
  margin: 0 calc(var(--space-lg) * -1) var(--space-lg);
  padding: var(--space-sm) var(--space-lg);
  border-bottom: var(--rule-hair) solid var(--color-rule);
}

.editor-detail-heading h2 {
  max-width: none;
  margin: 0;
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.25;
  text-wrap: balance;
}

.editor-settings-panel :deep(.el-form-item) {
  margin-bottom: var(--space-md);
}

.editor-settings-panel :deep(.el-form-item--label-top .el-form-item__label) {
  margin-bottom: var(--space-2xs);
  line-height: 1.4;
}

@media (max-width: 768px) {
  .editor-settings-panel {
    padding: 0 var(--space-md) var(--space-md);
  }

  .editor-detail-heading {
    margin: 0 calc(var(--space-md) * -1) var(--space-md);
    padding: var(--space-sm) var(--space-md);
  }

  .editor-detail-heading h2 {
    font-size: var(--text-md);
  }
}
</style>
