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
/* Steps: small numbered markers joined by a hairline; cobalt for the current step, a wash for done. */
.workflow {
  display: flex;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.workflow li {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  gap: var(--space-xs);
  min-width: 0;
  color: var(--color-muted);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 500;
  line-height: 1.3;
}

.workflow li:last-child {
  flex: 0 0 auto;
}

.workflow li:not(:last-child)::after {
  content: "";
  flex: 1 1 var(--space-md);
  min-width: var(--space-xs);
  height: var(--rule-hair);
  margin-right: var(--space-xs);
  background: var(--color-rule-2);
}

.workflow li.is-done:not(:last-child)::after {
  background: var(--color-accent);
}

.workflow__marker {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 24px;
  height: 24px;
  border: var(--rule-hair) solid var(--color-rule-2);
  border-radius: var(--radius-s);
  background: var(--color-paper-3);
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.workflow__label {
  min-width: 0;
  overflow-wrap: break-word;
}

.workflow .is-done {
  color: var(--color-ink-2);
}

.is-done .workflow__marker {
  border-color: transparent;
  background: var(--color-accent-wash);
  color: var(--color-accent);
}

.workflow .is-current {
  color: var(--color-ink);
  font-weight: 600;
}

.is-current .workflow__marker {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: var(--color-accent-ink);
}

@media (max-width: 768px) {
  .workflow li {
    flex-wrap: wrap;
  }

  .workflow__label {
    flex: 1 1 100%;
    order: 2;
  }

  .workflow li:not(:last-child)::after {
    order: 1;
  }
}
</style>
