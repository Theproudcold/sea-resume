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
            title="修改简历名称"
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
        <div
          class="scheme-switch"
          :class="{ 'is-ready': schemeReady }"
          role="radiogroup"
          aria-label="主题"
          :style="{ '--scheme-index': schemeIndex }"
        >
          <span class="scheme-thumb" aria-hidden="true" />
          <button
            v-for="option in schemeOptions"
            :key="option.value"
            type="button"
            class="scheme-option"
            role="radio"
            :aria-checked="schemePreference === option.value"
            :aria-label="option.label"
            :title="option.label"
            :class="{ 'is-active': schemePreference === option.value }"
            @click="selectScheme(option.value, $event)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" :d="option.icon" />
            </svg>
          </button>
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  applyColorScheme,
  persistColorScheme,
  readStoredScheme,
  resolveColorScheme,
  type ColorSchemePreference,
} from '@/composables/useColorScheme';
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
const SUN_ICON = 'M12 4.2a.9.9 0 0 1 .9.9V6a.9.9 0 0 1-1.8 0V5.1a.9.9 0 0 1 .9-.9Zm0 12.9a.9.9 0 0 1 .9.9v.9a.9.9 0 0 1-1.8 0v-.9a.9.9 0 0 1 .9-.9ZM4.2 12a.9.9 0 0 1 .9-.9H6a.9.9 0 0 1 0 1.8H5.1a.9.9 0 0 1-.9-.9Zm12.9 0a.9.9 0 0 1 .9-.9h.9a.9.9 0 0 1 0 1.8h-.9a.9.9 0 0 1-.9-.9ZM6.4 6.4a.9.9 0 0 1 1.27 0l.64.64a.9.9 0 1 1-1.27 1.27l-.64-.64a.9.9 0 0 1 0-1.27Zm9.29 9.29a.9.9 0 0 1 1.27 0l.64.64a.9.9 0 1 1-1.27 1.27l-.64-.64a.9.9 0 0 1 0-1.27Zm1.27-9.29a.9.9 0 0 1 0 1.27l-.64.64a.9.9 0 1 1-1.27-1.27l.64-.64a.9.9 0 0 1 1.27 0ZM7.68 15.05a.9.9 0 0 1 0 1.27l-.64.64a.9.9 0 1 1-1.27-1.27l.64-.64a.9.9 0 0 1 1.27 0ZM12 8.1A3.9 3.9 0 1 1 12 15.9 3.9 3.9 0 0 1 12 8.1Z';
const MOON_ICON = 'M14.2 3.4a.9.9 0 0 1 .2 1 8.2 8.2 0 1 0 5.2 5.2.9.9 0 0 1 1.2-.2A9.9 9.9 0 1 1 14 3.2a.9.9 0 0 1 .2 1.2Z';
const SYSTEM_ICON = 'M4.6 5.2A1.6 1.6 0 0 1 6.2 3.6h11.6a1.6 1.6 0 0 1 1.6 1.6v8.2a1.6 1.6 0 0 1-1.6 1.6h-4.3l.7 1.6h2.1a.9.9 0 0 1 0 1.8H7.7a.9.9 0 0 1 0-1.8h2.1l.7-1.6H6.2a1.6 1.6 0 0 1-1.6-1.6Zm1.6-.2a.2.2 0 0 0-.2.2v8.2c0 .1.1.2.2.2h11.6a.2.2 0 0 0 .2-.2V5.2a.2.2 0 0 0-.2-.2Z';
const schemeOptions: Array<{ value: ColorSchemePreference; label: string; icon: string }> = [
  { value: 'light', label: '浅色主题', icon: SUN_ICON },
  { value: 'system', label: '跟随系统', icon: SYSTEM_ICON },
  { value: 'dark', label: '深色主题', icon: MOON_ICON },
];
const schemePreference = ref<ColorSchemePreference>(readStoredScheme() ?? 'system');
const schemeReady = ref(false);
const schemeIndex = computed(() => {
  const index = schemeOptions.findIndex((option) => option.value === schemePreference.value);
  return index < 0 ? 1 : index;
});
let schemeMedia: MediaQueryList | null = null;

const paintScheme = () => {
  applyColorScheme(resolveColorScheme(schemePreference.value) === 'dark');
};

const selectScheme = (preference: ColorSchemePreference, event: MouseEvent) => {
  // 点已选中的按钮仍在浅色和深色之间切换，不会卡在当前外观。
  if (preference === schemePreference.value) {
    preference = resolveColorScheme(preference) === 'dark' ? 'light' : 'dark';
  }
  schemePreference.value = preference;
  persistColorScheme(preference, { x: event.clientX, y: event.clientY });
};

const onSystemScheme = () => {
  if (schemePreference.value !== 'system') return;
  paintScheme();
};

onMounted(() => {
  requestAnimationFrame(() => {
    schemeReady.value = true;
  });
  if (typeof window.matchMedia !== 'function') return;
  schemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
  schemeMedia.addEventListener('change', onSystemScheme);
});

onUnmounted(() => {
  schemeMedia?.removeEventListener('change', onSystemScheme);
});
</script>

<style scoped>
.app-header {
  position: relative;
  z-index: var(--z-sticky-nav);
  flex: 0 0 auto;
  background: var(--color-paper-3);
  color: var(--color-ink);
  border-bottom: var(--rule-hair) solid var(--color-rule);
}

.header-content {
  width: 100%;
  max-width: none;
  min-height: var(--topbar-height);
  margin: 0 auto;
  padding: var(--space-xs) var(--ui-page-gutter);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
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
  gap: var(--space-sm);
}

.brand-mark {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  object-fit: contain;
  padding: var(--space-3xs);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-input);
  background: var(--color-paper-2);
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
  color: var(--color-ink);
  font-size: var(--text-lg);
  font-weight: 600;
  max-width: none;
  letter-spacing: var(--tracking-display);
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-title-edit {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: var(--space-xs);
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
  color: var(--color-muted);
  transition: color var(--dur-micro) var(--ease-out);
}

.page-title-edit:hover > .el-icon {
  color: var(--color-accent);
}

.page-title-edit:hover .page-title-text {
  text-decoration: underline;
  text-decoration-thickness: var(--rule-bar);
  text-underline-offset: 0.2em;
}

.page-title-edit:active .page-title-text {
  color: var(--color-accent);
}

.page-title-edit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.page-title-input {
  width: min(440px, 48vw);
}

.page-subtitle {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2xs);
  margin-top: var(--space-3xs);
  overflow: hidden;
}

.page-heading p {
  min-width: 0;
  overflow: hidden;
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-weight: 500;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-subtitle .back-button {
  flex: 0 0 auto;
  height: auto;
  min-height: 0;
  margin: 0;
  padding: 0;
  --el-button-text-color: var(--color-ink-2);
  --el-button-hover-text-color: var(--color-accent);
  --el-button-hover-bg-color: transparent;
  --el-button-active-bg-color: transparent;
  --el-button-active-text-color: var(--color-accent);
  font-size: var(--text-xs);
  font-weight: 500;
}

.page-subtitle .back-button:hover {
  background: transparent !important;
}

.breadcrumb-divider {
  flex: 0 0 auto;
  color: var(--color-muted);
  font-size: var(--text-xs);
}

.header-trailing {
  flex: 0 1 auto;
  min-width: 0;
  justify-content: flex-end;
  gap: var(--space-sm);
}

.app-header :deep(.el-button.is-text),
.app-header :deep(.el-button.is-link) {
  --el-button-border-color: transparent;
  --el-button-hover-border-color: transparent;
  --el-button-disabled-border-color: transparent;
  box-shadow: none;
}

.app-header :deep(.el-button.is-text:not(.is-disabled):hover),
.app-header :deep(.el-button.is-text:not(.is-disabled):focus-visible) {
  background-color: var(--color-paper-2);
  color: var(--color-ink);
}

.scheme-switch {
  position: relative;
  display: inline-grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(3, 32px);
  align-items: center;
  height: 36px;
  padding: 3px;
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-input);
  background: var(--color-paper-2);
}

.scheme-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 32px;
  height: 30px;
  border-radius: var(--radius-s);
  background: var(--color-paper-3);
  box-shadow: var(--shadow-key);
  pointer-events: none;
  transform: translateX(calc(var(--scheme-index) * 100%));
}

.scheme-switch.is-ready .scheme-thumb {
  transition: transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
}

.scheme-option {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: 32px;
  height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  transition: color 280ms var(--ease-out);
}

.scheme-option svg {
  width: 16px;
  height: 16px;
  transition: transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
}

.scheme-option:hover {
  color: var(--color-ink);
}

.scheme-option.is-active {
  color: var(--color-ink);
}

.scheme-option.is-active svg {
  transform: scale(1.08);
}

.scheme-option:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 1px;
}

.repository-link {
  position: relative;
  display: inline-flex;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-input);
  background: var(--color-paper-3);
  color: var(--color-ink);
  box-shadow: var(--shadow-key);
  cursor: pointer;
  transition: background-color var(--dur-micro) var(--ease-out), border-color var(--dur-micro) var(--ease-out),
    transform var(--dur-micro) var(--ease-out);
}

.repository-link::before {
  content: "";
  position: absolute;
  inset: -4px;
}

.repository-link svg {
  width: 18px;
  height: 18px;
}

.repository-link:hover {
  border-color: var(--color-rule-2);
  background: var(--color-paper-2);
}

.repository-link:active {
  transform: translateY(1px);
  box-shadow: var(--shadow-key-press);
}

.repository-link:focus-visible {
  outline: 2px solid var(--color-focus);
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
  gap: var(--space-xs);
}

.header-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.header-toolbar {
  border-top: var(--rule-hair) solid var(--color-rule);
}

.header-toolbar-content {
  display: flex;
  width: 100%;
  max-width: var(--ui-content-max-width);
  min-height: 48px;
  align-items: center;
  margin: 0 auto;
  padding: var(--space-xs) var(--ui-page-gutter);
}

@media (max-width: 768px) {
  .header-content {
    min-height: 0;
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-sm);
    padding-block: var(--space-sm);
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
    gap: var(--space-xs);
  }

  .header-actions {
    flex-wrap: wrap;
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
    padding-block: var(--space-xs);
  }
}
</style>
