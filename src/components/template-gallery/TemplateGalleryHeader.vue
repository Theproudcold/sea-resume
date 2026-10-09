<template>
  <AppHeader
    title="选择简历模板"
    :subtitle="subtitle"
    show-back
    @back="$emit('back')"
  >
    <template #context>
      <el-tag :type="canApplyToCurrent ? 'success' : 'info'" effect="plain">
        {{ canApplyToCurrent ? '当前简历可应用模板' : '选择模板创建新简历' }}
      </el-tag>
    </template>
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
  ? '预览后应用到当前简历，或创建一份新简历。'
  : '浏览不同风格，预览后创建你的简历。');
</script>
