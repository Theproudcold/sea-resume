<template>
  <header class="app-header no-print">
    <div class="header-content">
      <div class="header-identity">
        <img class="brand-mark" :src="logoUrl" alt="Sea Resume" width="40" height="40" />
        <div class="page-heading">
          <div v-if="editableTitle && isEditingTitle" class="page-title-input">
            <el-input
              ref="titleInputRef"
              v-model="draftTitle"
              maxlength="120"
              aria-label="简历名称"
              @blur="saveTitleEdit"
              @keyup.enter="saveTitleEdit"
              @keyup.esc="cancelTitleEdit"
            />
          </div>
          <button
            v-else-if="editableTitle"
            type="button"
            class="page-title-edit"
            :aria-label="`编辑简历名称：${title}`"
            title="点击修改简历名称"
            @click="startTitleEdit"
          >
            <span class="page-title-text">{{ title }}</span>
            <el-icon aria-hidden="true"><EditPen /></el-icon>
          </button>
          <h1 v-else>{{ title }}</h1>
          <div v-if="subtitle || showBack" class="page-subtitle">
            <el-button
              v-if="showBack"
              class="back-button"
              text
              :icon="ArrowLeft"
              @click="$emit('back')"
            >
              {{ backLabel }}
            </el-button>
            <span v-if="showBack && subtitle" class="breadcrumb-divider" aria-hidden="true">/</span>
            <p v-if="subtitle">{{ subtitle }}</p>
          </div>
        </div>
      </div>

      <div class="header-trailing">
        <div v-if="$slots.context" class="header-context">
          <slot name="context" />
        </div>
        <div v-if="$slots.actions" class="header-actions">
          <slot name="actions" />
        </div>
        <div v-if="inlineToolbar && $slots.toolbar" class="header-inline-toolbar">
          <slot name="toolbar" />
        </div>
        <a
          class="repository-link"
          href="https://github.com/Theproudcold/sea-resume"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="查看 Sea Resume GitHub 仓库"
          title="GitHub 仓库"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2.1c-3.2.7-3.9-.8-3.9-.8-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.3 1.8 1.3 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.4-1.3-5.4-5.7 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.3 2.9.1 3.2.8.9 1.2 1.9 1.2 3.2 0 4.4-2.8 5.4-5.4 5.7.4.3.8 1 .8 2v3c0 .3.2.7.8.6A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
          </svg>
        </a>
      </div>
    </div>
    <div v-if="$slots.toolbar && !inlineToolbar" class="header-toolbar">
      <div class="header-toolbar-content">
        <slot name="toolbar" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { ArrowLeft, EditPen } from '@element-plus/icons-vue';

const props = withDefaults(defineProps<{
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backLabel?: string;
  inlineToolbar?: boolean;
  editableTitle?: boolean;
}>(), {
  subtitle: '',
  showBack: false,
  backLabel: '返回',
  inlineToolbar: false,
  editableTitle: false,
});

const emit = defineEmits<{
  back: [];
  'update:title': [title: string];
}>();

const isEditingTitle = ref(false);
const draftTitle = ref(props.title);
const titleInputRef = ref<any>();

watch(() => props.title, (title) => {
  draftTitle.value = title;
});

const startTitleEdit = () => {
  draftTitle.value = props.title;
  isEditingTitle.value = true;
  nextTick(() => {
    titleInputRef.value?.focus?.();
    titleInputRef.value?.input?.select?.();
  });
};

const saveTitleEdit = () => {
  if (!isEditingTitle.value) return;
  const title = draftTitle.value.trim();
  isEditingTitle.value = false;
  draftTitle.value = title || props.title;
  if (title && title !== props.title) emit('update:title', title);
};

const cancelTitleEdit = () => {
  if (!isEditingTitle.value) return;
  draftTitle.value = props.title;
  isEditingTitle.value = false;
};

const logoUrl = `${import.meta.env.BASE_URL}brand/sea-resume-logo-generated.png`;
</script>

<style scoped>
.app-header {
  position: relative;
  z-index: 10;
  flex: 0 0 auto;
  background: var(--ui-bg-surface);
  border-bottom: 1px solid var(--ui-border);
  box-shadow: var(--ui-shadow-sm);
}

.header-content {
  width: 100%;
  max-width: none;
  min-height: 76px;
  margin: 0 auto;
  padding: var(--ui-space-4) var(--ui-page-gutter);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
}


.header-identity,
.header-trailing,
.header-actions {
  display: flex;
  align-items: center;
}

.header-identity {
  flex: 1 1 auto;
  min-width: 0;
  gap: var(--ui-space-3);
}

.brand-mark {
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  object-fit: contain;
}

.page-heading {
  min-width: 0;
  overflow: hidden;
}

.page-heading h1,
.page-title-text {
  display: block;
  min-width: 0;
  max-width: 100%;
  margin: 0;
  overflow: hidden;
  color: var(--ui-text-main);
  font-size: var(--ui-font-lg);
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.page-title-edit {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: text;
}

.page-title-edit > .el-icon {
  flex: 0 0 auto;
  color: var(--ui-text-muted);
  opacity: 0.65;
  transition: color 0.15s ease, opacity 0.15s ease;
}

.page-title-edit:hover > .el-icon {
  color: var(--ui-primary);
  opacity: 1;
}

.page-title-input {
  width: min(440px, 48vw);
}

.page-title-input :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--ui-primary) inset;
}

.page-subtitle {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--ui-space-1);
  margin-top: var(--ui-space-1);
  overflow: hidden;
}

.page-heading p {
  min-width: 0;
  overflow: hidden;
  margin: 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-sm);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.back-button {
  flex: 0 0 auto;
  height: auto;
  min-height: 0;
  margin: 0;
  padding: 0;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-sm);
}

.back-button:hover {
  color: var(--ui-primary);
}

.breadcrumb-divider {
  flex: 0 0 auto;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-sm);
}

.header-trailing {
  flex: 0 1 auto;
  min-width: 0;
  justify-content: flex-end;
  gap: var(--ui-space-4);
}

.repository-link {
  display: inline-flex;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--ui-text-secondary);
  transition: color 0.15s ease;
}

.repository-link svg {
  width: 20px;
  height: 20px;
}

.repository-link:hover {
  color: var(--ui-primary);
}

.repository-link:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
}

.header-inline-toolbar {
  display: flex;
  min-width: 0;
  align-items: center;
}

.header-actions {
  justify-content: flex-end;
  flex-wrap: nowrap;
  gap: var(--ui-space-2);
}

.header-toolbar {
  border-top: 1px solid var(--ui-border);
}

.header-toolbar-content {
  display: flex;
  width: 100%;
  max-width: var(--ui-content-max-width);
  min-height: 52px;
  align-items: center;
  margin: 0 auto;
  padding: var(--ui-space-2) var(--ui-page-gutter);
}

@media (max-width: 768px) {
  .header-content {
    min-height: 0;
    align-items: flex-start;
    flex-direction: column;
    gap: var(--ui-space-3);
    padding-block: var(--ui-space-3);
  }

  .header-identity,
  .header-trailing,
  .header-actions {
    width: 100%;
  }

  .header-trailing,
  .header-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .header-trailing {
    gap: var(--ui-space-2);
  }

  .header-inline-toolbar {
    width: 100%;
  }

  .page-title-input {
    width: min(440px, 100%);
  }

  .header-toolbar-content {
    min-height: 0;
    align-items: flex-start;
    padding-block: var(--ui-space-2);
  }
}
</style>
