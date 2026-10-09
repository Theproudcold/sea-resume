<template>
  <nav class="section-quick-nav" aria-label="章节快速跳转">
    <span class="section-quick-nav__label">快速跳转</span>
    <button
      v-for="section in sections"
      :key="section.id"
      type="button"
      :class="{ 'is-active': activeId === section.id }"
      @click="$emit('navigate', section.id)"
    >{{ section.title }}</button>
  </nav>
</template>

<script setup lang="ts">
defineProps<{ sections: Array<{ id: string; title: string }>; activeId?: string | null }>();
defineEmits<{ navigate: [id: string] }>();
</script>

<style scoped>
.section-quick-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
  padding: 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg-subtle);
}
.section-quick-nav__label { color: var(--ui-text-muted); font-size: var(--ui-font-xs); }
.section-quick-nav button {
  min-height: 32px;
  padding: 5px 9px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg-surface);
  color: var(--ui-text-secondary);
  cursor: pointer;
}
.section-quick-nav button.is-active { border-color: var(--ui-primary); color: var(--ui-primary); }
@media (max-width: 768px) {
  .section-quick-nav { align-items: stretch; }
  .section-quick-nav button { flex: 1 1 auto; }
}
</style>
