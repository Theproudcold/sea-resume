<script setup lang="ts">
import type { InterviewObservation } from '@/types/interview';
defineProps<{ observations: InterviewObservation[] }>();
const labels = { strength: '优点', expression: '表达问题', knowledge: '知识缺口' };
</script>
<template>
  <article v-for="(item, index) in observations" :key="index" class="observation" :data-category="item.category">
    <div class="observation-heading"><strong>{{ labels[item.category] }}</strong><span>需核实</span></div>
    <p>{{ item.text }}</p>
    <details><summary>查看原回答与简历证据</summary><blockquote v-for="(reference, i) in item.evidence" :key="i"><small>{{ reference.sourceId }}</small><p>{{ reference.snippet }}</p></blockquote></details>
  </article>
</template>
<style scoped>
/* Evidence as hairline rows: the category as a small square label, the note, its sources on demand. */
.observation {
  min-width: 0;
  padding: var(--space-sm) 0;
  border-bottom: var(--rule-hair) solid var(--color-rule);
}

.observation:first-child { border-top: var(--rule-hair) solid var(--color-rule); }

.observation-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
  font-size: var(--text-xs);
  font-weight: 500;
}

.observation-heading strong {
  padding: 0 var(--space-2xs);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-s);
  color: var(--color-ink);
  font-weight: 600;
}

.observation[data-category=strength] strong { border-color: var(--color-success); color: var(--color-success); }
.observation[data-category=knowledge] strong { border-color: var(--color-warning); background: var(--color-warning-wash); color: var(--color-ink); }
.observation-heading > span { color: var(--color-muted); }

p {
  margin: var(--space-xs) 0;
  font-size: var(--text-sm);
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

summary {
  color: var(--color-ink-2);
  cursor: pointer;
  font-size: var(--text-xs);
  font-weight: 500;
  transition: color var(--dur-micro) var(--ease-out);
}

summary:active { color: var(--color-accent); }

@media (hover: hover) {
  summary:hover { color: var(--color-ink); text-decoration: underline; }
}

blockquote {
  margin: var(--space-xs) 0 0;
  padding-left: var(--space-sm);
  border-left: var(--rule-bar) solid var(--color-rule);
}

small { color: var(--color-muted); font-size: var(--text-xs); font-weight: 500; overflow-wrap: break-word; }
</style>
