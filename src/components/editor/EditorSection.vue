<template>
  <div :id="id" class="editor-section">
    <div class="section-header" @click="toggleOpen">
      <div class="section-heading">
        <el-icon class="drag-handle" title="拖动排序" @click.stop><Rank /></el-icon>
        <el-icon v-if="icon" class="section-icon"><component :is="icon" /></el-icon>
        <div class="section-title-wrap" @click.stop>
          <div v-if="isEditingTitle" class="section-title-input">
            <el-input
              v-model="localTitle"
              size="small"
              ref="titleInputRef"
              aria-label="编辑模块标题"
              @blur="saveTitle"
              @keyup.enter="saveTitle"
              @keyup.esc="cancelTitleEdit"
            />
          </div>
          <button v-else type="button" class="section-title-button" @click="startEditingTitle">
            {{ title || '未命名模块' }}
            <el-icon><EditPen /></el-icon>
          </button>
        </div>
      </div>

      <div class="section-actions" @click.stop>
        <el-button
          link
          :type="visible ? '' : 'info'"
          :icon="visible ? View : Hide"
          :aria-label="visible ? '隐藏模块' : '显示模块'"
          :title="visible ? '隐藏模块' : '显示模块'"
          @click="$emit('toggle-visibility')"
        />
        <el-button
          v-if="removable"
          link
          type="danger"
          :icon="Delete"
          aria-label="移除模块"
          title="移除模块"
          @click="$emit('remove')"
        />
        <button
          type="button"
          class="section-toggle"
          :aria-expanded="isOpen"
          :aria-controls="`${id}-body`"
          :aria-label="isOpen ? '折叠章节' : '展开章节'"
          @click.stop="toggleOpen"
        >
          <el-icon :class="['section-chevron', isOpen ? 'is-open' : '']"><ArrowDown /></el-icon>
        </button>
      </div>
    </div>

    <div :id="`${id}-body`" v-show="isOpen" class="section-body">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue';
import { Rank, ArrowDown, EditPen, Hide, View, Delete } from '@element-plus/icons-vue';

const props = defineProps<{
  id: string;
  title: string;
  isOpen: boolean;
  visible?: boolean;
  icon?: any;
  removable?: boolean;
}>();

const emit = defineEmits<{
  'update:isOpen': [value: boolean];
  'update:title': [value: string];
  'toggle-visibility': [];
  'remove': [];
}>();

const localTitle = ref(props.title);
const isEditingTitle = ref(false);
const titleInputRef = ref();

watch(() => props.title, (newVal) => {
  localTitle.value = newVal;
});

const toggleOpen = () => {
  emit('update:isOpen', !props.isOpen);
};

const startEditingTitle = () => {
  isEditingTitle.value = true;
  nextTick(() => {
    titleInputRef.value?.focus();
  });
};

const cancelTitleEdit = () => {
  localTitle.value = props.title;
  isEditingTitle.value = false;
};

const saveTitle = () => {
  isEditingTitle.value = false;
  if (localTitle.value.trim() !== props.title) {
    emit('update:title', localTitle.value.trim());
  }
};
</script>

<style scoped>
.editor-section {
  margin-bottom: var(--ui-space-3);
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg-surface);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.editor-section:hover {
  border-color: color-mix(in srgb, var(--ui-primary) 24%, var(--ui-border));
  box-shadow: var(--ui-shadow-sm);
}

.section-header {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-4);
  background: var(--ui-bg-subtle);
  cursor: pointer;
  user-select: none;
}

.section-heading,
.section-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.section-heading {
  min-width: 0;
  flex: 1;
}

.drag-handle {
  flex: 0 0 auto;
  color: var(--ui-text-faint);
  cursor: grab;
}

.drag-handle:hover,
.section-icon {
  color: var(--ui-text-muted);
}

.section-title-wrap {
  min-width: 0;
  flex: 1;
}

.section-title-input {
  max-width: 260px;
}

.section-title-button {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-main);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.section-title-button:hover,
.section-title-button:focus-visible {
  color: var(--ui-primary);
}

.section-toggle {
  display: grid;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.section-toggle:hover {
  background: var(--ui-bg-hover);
}
.section-chevron {
  color: var(--ui-text-muted);
  transition: transform 0.18s ease;
}

.section-chevron.is-open {
  transform: rotate(180deg);
}

.section-body {
  padding: var(--ui-space-4);
  border-top: 1px solid var(--ui-border);
}

@media (max-width: 768px) {
  .section-header {
    padding-inline: var(--ui-space-3);
  }

  .section-body {
    padding: var(--ui-space-3);
  }
}
</style>
