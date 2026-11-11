<template>
  <div :id="id" class="editor-section">
    <div class="section-header" :class="{ 'is-static': !collapsible }" @click="collapsible ? toggleOpen() : undefined">
      <div class="section-heading">
        <el-icon v-if="showDragHandle" class="drag-handle" title="拖动排序" @click.stop><Rank /></el-icon>
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
            <span class="section-title-text">{{ title || '未命名模块' }}</span>
            <el-icon aria-hidden="true"><EditPen /></el-icon>
          </button>
        </div>
      </div>

      <div v-if="showVisibility || removable || collapsible || $slots['header-actions']" class="section-actions" @click.stop>
        <slot name="header-actions" />
        <el-button
          v-if="showVisibility"
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
          v-if="collapsible"
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

const props = withDefaults(defineProps<{
  id: string;
  title: string;
  isOpen: boolean;
  visible?: boolean;
  icon?: any;
  removable?: boolean;
  showDragHandle?: boolean;
  showVisibility?: boolean;
  collapsible?: boolean;
}>(), {
  removable: false,
  showDragHandle: true,
  showVisibility: true,
  collapsible: true,
});

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
/* A section is a head row over its entries, never a card: the entries are the only boxes. */
.editor-section {
  margin-bottom: var(--space-lg);
  background: transparent;
}

.section-header {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: var(--space-sm) 0;
  border-bottom: var(--rule-hair) solid var(--color-rule);
  cursor: pointer;
  user-select: none;
}

.section-header.is-static {
  cursor: default;
}

.section-heading,
.section-actions {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.section-heading {
  min-width: 0;
  flex: 1;
}

.section-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.drag-handle {
  flex: 0 0 auto;
  color: var(--color-muted);
  cursor: grab;
}

.section-icon {
  flex: 0 0 auto;
  color: var(--color-muted);
  font-size: var(--text-lg);
}

.section-title-wrap {
  min-width: 0;
  flex: 1;
}

.section-title-input {
  max-width: 320px;
}

.section-title-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  max-width: 100%;
  min-height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink);
  font: inherit;
  text-align: left;
  cursor: text;
}

.section-title-text {
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  letter-spacing: var(--tracking-display);
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-title-button > .el-icon {
  flex: 0 0 auto;
  color: var(--color-muted);
  transition: color var(--dur-micro) var(--ease-out);
}

.section-title-button:active .section-title-text {
  color: var(--color-accent);
}

.section-toggle {
  display: grid;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-input);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  transition: background-color var(--dur-micro) var(--ease-out), color var(--dur-micro) var(--ease-out);
}

.section-toggle:active {
  background: var(--color-sunken);
  color: var(--color-ink);
}

@media (hover: hover) {
  .drag-handle:hover {
    color: var(--color-ink);
  }

  .section-title-button:hover .section-title-text {
    text-decoration: underline;
    text-decoration-color: var(--color-rule-2);
    text-decoration-thickness: var(--rule-hair);
    text-underline-offset: 0.25em;
  }

  .section-title-button:hover > .el-icon {
    color: var(--color-accent);
  }

  .section-toggle:hover {
    background: var(--color-paper-2);
    color: var(--color-ink);
  }
}

.section-chevron {
  transition: transform var(--dur-short) var(--ease-out);
}

.section-chevron.is-open {
  transform: rotate(180deg);
}

.section-body {
  padding: var(--space-md) 0 0;
}

/* Forms inside a section run dense: 36px controls, labels in 500. */
.section-body :deep(.el-form-item) {
  margin-bottom: var(--space-md);
}

.section-body :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.section-body :deep(.el-form-item--label-top .el-form-item__label) {
  margin-bottom: var(--space-2xs);
  line-height: 1.4;
}

.section-body :deep(.resume-entry-card__header > span) {
  color: var(--color-ink);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.section-body :deep(.resume-entry-card__header .el-button + .el-button) {
  margin-left: 0;
}

.section-body :deep(.resume-entry-card > .resume-entry-card__header + *) {
  padding-top: var(--space-md);
}

@media (max-width: 768px) {
  .section-title-text {
    font-size: var(--text-md);
  }
}
</style>
