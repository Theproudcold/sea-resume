<template>
  <AppHeader
    title="选择简历模板"
    :subtitle="subtitle"
    show-back
    @back="$emit('back')"
  >
  </AppHeader>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppHeader from '@/components/common/AppHeader.vue';

const props = defineProps<{
  canApplyToCurrent: boolean;
}>();

defineEmits<{
  back: [];
}>();

const subtitle = computed(() => props.canApplyToCurrent
  ? '选择适合的排版，也可以先预览效果。'
  : '选一个喜欢的样式，开始填写简历。');
</script>
