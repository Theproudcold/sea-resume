<template>
  <div class="rich-text-editor">
    <QuillEditor
      ref="editorRef"
      theme="snow"
      :toolbar="toolbarOptions"
      v-model:content="content"
      contentType="html"
      @update:content="updateContent"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits(['update:modelValue']);

const content = ref(props.modelValue);
const editorRef = ref();

// Update local content if prop changes from outside
watch(() => props.modelValue, (newVal) => {
  if (newVal !== content.value) {
    content.value = newVal;
  }
});

const updateContent = (newContent: string) => {
  content.value = newContent; // Ensure local ref is updated (though v-model might do it too, being explicit is safer if we drop v-model)
  emit('update:modelValue', newContent);
};

const toolbarOptions = [
  ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
  [{ 'list': 'ordered'}, { 'list': 'bullet' }],
  [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
  [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
  ['clean']                                         // remove formatting button
];
</script>

<style scoped>
.rich-text-editor {
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg-surface);
}

:deep(.ql-toolbar) {
  border: 0;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-subtle);
}

:deep(.ql-container) {
  border: 0;
  font-family: inherit;
  font-size: var(--ui-font-md);
  height: 200px;
}

:deep(.ql-editor) {
  min-height: 150px;
}

:deep(.ql-snow .ql-stroke) {
  stroke: var(--ui-text-secondary);
}

:deep(.ql-snow .ql-fill) {
  fill: var(--ui-text-secondary);
}

:deep(.ql-snow .ql-picker) {
  color: var(--ui-text-secondary);
}
</style>
