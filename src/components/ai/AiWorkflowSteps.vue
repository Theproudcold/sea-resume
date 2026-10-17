<script setup lang="ts">
withDefaults(defineProps<{ steps: readonly string[]; current: number; complete?: boolean; label?: string }>(), { label: '执行步骤', complete: false });
</script>

<template>
  <ol class="workflow" :aria-label="label" :style="{ '--step-count': steps.length }">
    <li v-for="(step, index) in steps" :key="step" :class="{ 'is-current': !complete && index === current, 'is-done': complete || index < current }" :aria-current="!complete && index === current ? 'step' : undefined">
      <span class="workflow__marker" aria-hidden="true">{{ complete || index < current ? '✓' : index + 1 }}</span>
      <span class="workflow__label">{{ step }}<span v-if="!complete && index === current" class="sr-only">，当前步骤</span><span v-else-if="complete || index < current" class="sr-only">，已完成</span></span>
    </li>
  </ol>
</template>

<style scoped>
.workflow { display: grid; grid-template-columns: repeat(var(--step-count), minmax(0, 1fr)); padding: 0; margin: 0; list-style: none; gap: var(--ui-space-2); }
.workflow li { position: relative; display: flex; gap: var(--ui-space-2); align-items: center; min-width: 0; color: var(--ui-text-muted); font-size: var(--ui-font-xs); line-height: var(--ui-line-height); }
.workflow__marker { display: grid; place-items: center; flex: 0 0 24px; height: 24px; border: 1px solid var(--ui-border); border-radius: 50%; background: var(--ui-bg-surface); font-weight: 600; }
.workflow__label { overflow-wrap: anywhere; }
.is-current .workflow__marker { background: var(--ui-primary); border-color: var(--ui-primary); color: var(--ui-bg-surface); }
.workflow .is-current { color: var(--ui-text-main); font-weight: 600; }
.workflow .is-done { color: var(--ui-primary); }
.is-done .workflow__marker { border-color: color-mix(in srgb, var(--ui-primary) 20%, var(--ui-border)); background: color-mix(in srgb, var(--ui-primary) 7%, var(--ui-bg-surface)); }
@media (max-width: 768px) { .workflow li { flex-direction: column; align-items: flex-start; gap: var(--ui-space-1); } }
</style>
