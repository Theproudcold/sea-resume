<template>
  <el-dialog
    :model-value="visible"
    title="使用模板"
    width="min(420px, calc(100vw - 32px))"
    class="use-template-dialog-shell"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="use-template-dialog">
      <p class="use-template-dialog__lead">你正在选择「{{ templateName }}」模板。</p>
      <p class="use-template-dialog__desc">可以创建一份新的简历，也可以直接应用到当前正在编辑的简历。</p>
      <p v-if="!canApplyToCurrent" class="use-template-dialog__hint">
        需从编辑页进入后才能应用到当前简历
      </p>
    </div>
    <template #footer>
      <div class="app-dialog-actions use-template-dialog__actions">
        <el-button type="primary" @click="emit('create')">创建新简历</el-button>
        <el-button :disabled="!canApplyToCurrent" @click="emit('apply')">应用到当前简历</el-button>
        <el-button @click="emit('update:visible', false)">取消</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
const props = defineProps<{
  visible: boolean;
  templateName: string;
  canApplyToCurrent: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  create: [];
  apply: [];
}>();
</script>

<style scoped>
.use-template-dialog {
  color: var(--ui-text-secondary);
  line-height: var(--ui-line-height);
}

.use-template-dialog__lead {
  margin: 0 0 var(--ui-space-2);
  color: var(--ui-text-main);
  font-size: var(--ui-font-md);
  font-weight: 600;
}

.use-template-dialog__desc {
  margin: 0;
}

.use-template-dialog__hint {
  margin: var(--ui-space-3) 0 0;
  color: var(--ui-warning);
  font-size: var(--ui-font-sm);
}

.use-template-dialog__actions {
  gap: var(--ui-space-2);
}
</style>
