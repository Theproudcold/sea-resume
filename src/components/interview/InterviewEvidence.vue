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
.observation { padding: var(--ui-space-4); background: var(--ui-bg-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); margin-top: var(--ui-space-3); }
.observation-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-2); font-size: var(--ui-font-xs); }.observation-heading strong { color: var(--ui-primary); font-weight: 600; }.observation[data-category=strength] strong { color: var(--ui-success); }.observation[data-category=knowledge] strong { color: var(--ui-warning); }.observation-heading > span { color: var(--ui-text-muted); }
p { white-space: pre-wrap; overflow-wrap: anywhere; margin: var(--ui-space-2) 0; font-size: var(--ui-font-sm); line-height: 1.8; } summary { cursor: pointer; font-size: var(--ui-font-xs); color: var(--ui-text-secondary); } blockquote { margin: var(--ui-space-3) 0 0; border-left: 2px solid var(--ui-border); padding-left: var(--ui-space-3); } small { color: var(--ui-text-muted); overflow-wrap: anywhere; font-size: var(--ui-font-xs); }
</style>
