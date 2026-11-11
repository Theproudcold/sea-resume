<template>
  <el-dialog
    :model-value="visible"
    title="使用模板"
    width="var(--ui-dialog-width-sm)"
    align-center
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
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  line-height: var(--ui-line-height);
}

.use-template-dialog__lead {
  margin: 0 0 var(--space-xs);
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 600;
}

.use-template-dialog__desc {
  margin: 0;
}

.use-template-dialog__hint {
  margin: var(--space-sm) 0 0;
  padding-top: var(--space-sm);
  border-top: var(--rule-hair) solid var(--color-rule);
  color: var(--color-warning);
  font-weight: 500;
}

.use-template-dialog__actions {
  gap: var(--space-xs);
}
</style>
