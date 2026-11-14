<template>
  <el-dialog
    :model-value="visible"
    title="存为模板"
    width="var(--ui-dialog-width-sm)"
    align-center
    class="save-template-dialog-shell"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="save-template">
      <p class="save-template__desc">
        保存当前简历的内容、版式和主题。模板只保存在这台浏览器，不会改动正在编辑的简历。
      </p>
      <label class="save-template__field">
        <span>模板名称</span>
        <el-input
          v-model="name"
          maxlength="40"
          show-word-limit
          placeholder="例如：校招通用版"
        />
      </label>
      <label class="save-template__field">
        <span>说明</span>
        <el-input
          v-model="description"
          type="textarea"
          maxlength="120"
          show-word-limit
          :rows="3"
          placeholder="可选。例如：带项目经历和蓝色主题"
        />
      </label>
    </div>
    <template #footer>
      <div class="app-dialog-actions">
        <el-button type="primary" :loading="saving" @click="submit">保存模板</el-button>
        <el-button :disabled="saving" @click="emit('update:visible', false)">取消</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  defaultName: string;
  saving: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  save: [payload: { name: string; description: string }];
}>();

const name = ref('');
const description = ref('');

watch(() => props.visible, (open) => {
  if (!open) return;
  name.value = props.defaultName;
  description.value = '';
});

const submit = () => {
  if (props.saving) return;
  emit('save', { name: name.value, description: description.value });
};
</script>

<style scoped>
.save-template {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  line-height: var(--ui-line-height);
}

.save-template__desc {
  margin: 0;
}

.save-template__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  color: var(--color-ink);
  font-family: var(--font-display);
  font-weight: 500;
}
</style>
