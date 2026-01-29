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

const updateContent = () => {
  emit('update:modelValue', content.value);
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
  background: white;
  border-radius: 4px;
}

:deep(.ql-toolbar) {
  border-radius: 4px 4px 0 0;
  border-color: #dcdfe6;
}

:deep(.ql-container) {
  border-radius: 0 0 4px 4px;
  border-color: #dcdfe6;
  font-family: inherit;
  font-size: 14px;
  height: 200px; /* Adjust height as needed */
}

:deep(.ql-editor) {
  min-height: 150px;
}
</style>
