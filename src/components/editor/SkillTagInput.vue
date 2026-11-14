<template>
  <div class="skill-tags">
    <span v-for="(item, index) in items" :key="`${item}-${index}`" class="skill-tag">
      {{ item }}
      <button type="button" :aria-label="`移除 ${item}`" @click="removeAt(index)">×</button>
    </span>
    <input
      :value="draft"
      type="text"
      :aria-label="label"
      :placeholder="items.length ? '继续输入，回车添加' : placeholder"
      @input="draft = ($event.target as HTMLInputElement).value"
      @keydown="onKeydown"
      @blur="commitDraft"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(defineProps<{
  items: string[];
  label?: string;
  placeholder?: string;
}>(), {
  label: '具体技能',
  placeholder: '输入技能后按回车，例如 JavaScript',
});

const emit = defineEmits<{ 'update:items': [value: string[]] }>();
const draft = ref('');

function commitToken(raw: string) {
  const token = raw.trim().replace(/[,，]+$/u, '').trim();
  if (!token || props.items.includes(token)) return;
  emit('update:items', [...props.items, token]);
}

function commitDraft() {
  if (!draft.value.trim()) return;
  commitToken(draft.value);
  draft.value = '';
}

function removeAt(index: number) {
  emit('update:items', props.items.filter((_, itemIndex) => itemIndex !== index));
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
    event.preventDefault();
    commitDraft();
    return;
  }
  if (event.key === 'Backspace' && !draft.value && props.items.length) {
    event.preventDefault();
    removeAt(props.items.length - 1);
  }
}
</script>

<style scoped>
.skill-tags {
  display: flex;
  min-height: var(--control-height);
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2xs);
  width: 100%;
  padding: var(--space-2xs);
  border: var(--rule-hair) solid var(--color-rule-2);
  border-radius: var(--radius-input);
  background: var(--color-paper-3);
}

.skill-tags:focus-within {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-wash);
}

.skill-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3xs);
  max-width: 100%;
  padding: 0 var(--space-2xs) 0 var(--space-xs);
  border-radius: var(--radius-s);
  background: var(--color-paper-2);
  color: var(--color-ink);
  font-size: var(--text-sm);
  line-height: 1.7;
}

.skill-tag button {
  border: 0;
  background: transparent;
  color: var(--color-muted);
  font: inherit;
  line-height: 1;
  cursor: pointer;
}

.skill-tags input {
  min-width: 8em;
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  font-size: var(--text-sm);
}
</style>
