<template>
  <div class="month-range">
    <el-date-picker
      :model-value="start"
      type="month"
      :placeholder="startPlaceholder"
      format="YYYY-MM"
      value-format="YYYY-MM"
      @update:model-value="(value: string | null) => $emit('update:start', value || '')"
    />
    <el-date-picker
      :model-value="present ? '' : end"
      type="month"
      :placeholder="endPlaceholder"
      format="YYYY-MM"
      value-format="YYYY-MM"
      :disabled="present"
      @update:model-value="(value: string | null) => $emit('update:end', value || '')"
    />
    <el-checkbox :model-value="present" @update:model-value="(value: unknown) => $emit('update:present', value === true)">至今</el-checkbox>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  start: string;
  end: string;
  present: boolean;
  startPlaceholder?: string;
  endPlaceholder?: string;
}>(), {
  startPlaceholder: '开始月份',
  endPlaceholder: '结束月份',
});

defineEmits<{
  'update:start': [value: string];
  'update:end': [value: string];
  'update:present': [value: boolean];
}>();
</script>

<style scoped>
.month-range {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
}

.month-range :deep(.el-date-editor) {
  width: 100%;
}

@media (max-width: 640px) {
  .month-range {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
