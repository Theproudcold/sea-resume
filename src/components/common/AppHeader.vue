<template>
  <header class="app-header no-print">
    <div class="header-content">
      <div class="header-identity">
        <el-button
          v-if="showBack"
          class="back-button"
          text
          :icon="ArrowLeft"
          @click="$emit('back')"
        >
          {{ backLabel }}
        </el-button>
        <img class="brand-mark" :src="logoUrl" alt="Sea Resume" width="40" height="40" />
        <div class="page-heading">
          <h1>{{ title }}</h1>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
      </div>

      <div class="header-trailing">
        <div v-if="$slots.context" class="header-context">
          <slot name="context" />
        </div>
        <div v-if="$slots.actions" class="header-actions">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ArrowLeft } from '@element-plus/icons-vue';

withDefaults(defineProps<{
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backLabel?: string;
}>(), {
  subtitle: '',
  showBack: false,
  backLabel: '返回',
});

defineEmits<{
  back: [];
}>();

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
  max-width: var(--ui-content-max-width);
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
  min-width: 0;
  gap: var(--ui-space-3);
}

.back-button {
  flex: 0 0 auto;
  margin-right: var(--ui-space-1);
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

.page-heading h1 {
  margin: 0;
  overflow: hidden;
  color: var(--ui-text-main);
  font-size: var(--ui-font-lg);
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-heading p {
  overflow: hidden;
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-sm);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-trailing {
  min-width: 0;
  justify-content: flex-end;
  gap: var(--ui-space-4);
}

.header-actions {
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

@media (max-width: 768px) {
  .header-content {
    min-height: 0;
    align-items: flex-start;
    flex-direction: column;
    gap: var(--ui-space-3);
    padding-block: var(--ui-space-3);
  }

  .header-identity {
    width: 100%;
  }

  .header-trailing,
  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .header-trailing {
    flex-wrap: wrap;
  }
}
</style>
