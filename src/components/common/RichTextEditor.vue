<template>
  <div class="rich-text-editor" @compositionstart.capture="startComposition" @compositionend.capture="finishComposition">
    <QuillEditor
      ref="editorRef"
      theme="snow"
      :toolbar="toolbarOptions"
      :content="content"
      contentType="html"
      @update:content="updateContent"
      @ready="syncEditor"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits(['update:modelValue']);

const content = ref(props.modelValue);
const editorRef = ref();

let composing = false;
let applyingExternal = false;
let pendingExternal: string | undefined;

// This Quill wrapper does not watch its content prop. Apply actual external
// changes silently, never rewriting the DOM for a user's own store echo.
const syncEditor = () => {
  const quill = editorRef.value?.getQuill?.();
  if (!quill || quill.root.innerHTML === content.value) return;
  applyingExternal = true;
  try {
    const selection = quill.getSelection();
    quill.setContents(quill.clipboard.convert(content.value), 'silent');
    if (selection) {
      const index = Math.min(selection.index, Math.max(0, quill.getLength() - 1));
      quill.setSelection(index, Math.min(selection.length, quill.getLength() - 1 - index), 'silent');
    }
  } finally {
    applyingExternal = false;
  }
};

watch(() => props.modelValue, (value) => {
  if (value === content.value) {
    pendingExternal = undefined;
    return;
  }
  if (composing) {
    pendingExternal = value;
    return;
  }
  content.value = value;
  syncEditor();
});

const startComposition = () => { composing = true; };

const finishComposition = () => {
  composing = false;
  nextTick(() => {
    if (pendingExternal === undefined || composing) return;
    content.value = pendingExternal;
    pendingExternal = undefined;
    syncEditor();
  });
};

const updateContent = (newContent: string) => {
  if (applyingExternal || pendingExternal !== undefined || newContent === content.value) return;
  content.value = newContent;
  if (newContent !== props.modelValue) emit('update:modelValue', newContent);
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
