<template>
  <div class="custom-block-editor">
    <RichTextEditor
      :model-value="modelValue"
      @update:modelValue="(val) => $emit('update:modelValue', val)"
      placeholder="请输入内容..."
    />
  </div>
</template>

<script setup lang="ts">
import RichTextEditor from '@/components/common/RichTextEditor.vue';

defineProps<{
  modelValue: string;
}>();

defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>
