<template>
  <div class="editor-section-stage" :data-section-id="sectionId">
    <section v-if="sectionId === 'theme' || sectionId === 'basic'" :id="`editor-section-${sectionId}`" class="editor-settings-panel">
      <div class="editor-detail-heading">
        <div>
          <span class="editor-detail-eyebrow">{{ sectionId === 'theme' ? '外观' : '简历内容' }}</span>
          <h2>{{ sectionId === 'theme' ? '主题设置' : '基础信息' }}</h2>
        </div>
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
        <el-button v-if="addActionLabel" type="primary" size="small" :icon="Plus" @click.stop="isCurrentResume && emit('add', sectionId)">
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
.editor-settings-panel {
  padding: 24px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-bg-surface);
}

.editor-detail-eyebrow {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.editor-detail-heading {
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--ui-border);
}

.editor-detail-heading h2 {
  margin: 4px 0 0;
  color: var(--ui-text-main);
  font-size: var(--ui-font-lg);
  font-weight: 650;
}

@media (max-width: 700px) {
  .editor-settings-panel {
    padding: 16px;
  }
}
</style>
