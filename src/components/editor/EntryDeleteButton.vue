<template>
  <el-popconfirm
    :title="`删除「${label}」？删除后可撤销。`"
    confirm-button-text="删除"
    cancel-button-text="取消"
    confirm-button-type="danger"
    width="240"
    @confirm="$emit('confirm')"
  >
    <template #reference>
      <el-button type="danger" size="small" text :icon="Delete">删除</el-button>
    </template>
  </el-popconfirm>
</template>

<script setup lang="ts">
import { Delete } from '@element-plus/icons-vue';

defineProps<{ label: string }>();
defineEmits<{ confirm: [] }>();
</script>
