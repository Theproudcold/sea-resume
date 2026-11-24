<template>
  <section class="jd-risk-panel" aria-label="岗位表述判读">
    <p class="hint">
      粘贴职位描述，本地匹配常见的风险表述，并给出可以直接带去面试的反问。
      <strong>不会发送任何内容，也不调用模型。</strong>
    </p>
    <label for="jd-risk-input">职位描述</label>
    <textarea
      id="jd-risk-input"
      v-model="jd"
      data-testid="jd-risk-input"
      rows="8"
      placeholder="粘贴岗位职责、任职要求……"
    />
    <p class="hint">{{ jd.length }} 字{{ scan.truncated ? ' · 超过 20000 字，只判读了前面部分' : '' }}</p>

    <p v-if="!jd.trim()" class="hint" role="status">粘贴 JD 后自动判读，输入变化即时更新。</p>
    <p v-else-if="!scan.hits.length" class="hint" role="status" data-testid="jd-risk-empty">
      未发现收录的风险表述。<strong>这只说明词典没命中，不代表岗位安全。</strong>
    </p>

    <div v-for="group in groups" :key="group.severity" class="jd-risk-group" data-testid="jd-risk-group">
      <h3>{{ SEVERITY_LABEL[group.severity] }}</h3>
      <article v-for="hit in group.hits" :key="hit.ruleId" class="jd-risk-hit" data-testid="jd-risk-hit" :data-severity="hit.severity">
        <p class="jd-risk-head">
          <strong>{{ hit.category }}</strong>
          <span class="jd-risk-term">命中「{{ hit.term }}」</span>
        </p>
        <p class="jd-risk-excerpt" data-testid="jd-risk-excerpt">{{ hit.excerpt }}</p>
        <p class="jd-risk-translation">{{ hit.translation }}</p>
        <div class="jd-risk-question">
          <span>可以问：{{ hit.question }}</span>
          <button type="button" data-testid="jd-risk-copy" @click="copy(hit.question)">{{ copied === hit.ruleId ? '已复制' : '复制反问' }}</button>
        </div>
      </article>
    </div>

    <p class="hint">
      以上只是基于词典的表述匹配，不是对公司或岗位的评价；表述存在也不代表一定如此，请结合原文和沟通核实。
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { scanJdRisks, type JdRiskHit, type JdRiskSeverity } from '@/utils/jdRiskLexicon';

const SEVERITY_LABEL: Record<JdRiskSeverity, string> = {
  high: '直接影响，投之前值得问清',
  medium: '需要核实',
  info: '值得留意',
};
const SEVERITY_ORDER: JdRiskSeverity[] = ['high', 'medium', 'info'];

const jd = ref('');
const copied = ref('');
let copyTimer: ReturnType<typeof setTimeout> | undefined;

const scan = computed(() => scanJdRisks(jd.value));
const groups = computed(() =>
  SEVERITY_ORDER
    .map((severity) => ({ severity, hits: scan.value.hits.filter((hit) => hit.severity === severity) }))
    .filter((group) => group.hits.length > 0),
);

watch(jd, () => { copied.value = ''; });

async function copy(question: string): Promise<void> {
  const hit = scan.value.hits.find((item) => item.question === question);
  try {
    await navigator.clipboard.writeText(question);
    copied.value = hit?.ruleId ?? '';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copied.value = ''; }, 2000);
  } catch {
    copied.value = '';
  }
}

onBeforeUnmount(() => clearTimeout(copyTimer));

defineExpose({ scan });
export type { JdRiskHit };
</script>

<style scoped>
.jd-risk-panel { display: flex; flex-direction: column; gap: var(--ui-space-3); color: var(--ui-text-main); font-size: var(--ui-font-sm); line-height: 1.7; }
label { font-weight: 600; }
textarea { width: 100%; min-width: 0; box-sizing: border-box; padding: var(--ui-space-2) var(--ui-space-3); background: var(--ui-bg-surface); color: inherit; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); font: inherit; resize: vertical; }
.hint { color: var(--ui-text-muted); font-size: var(--ui-font-xs); margin: 0; }
.jd-risk-group { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.jd-risk-group h3 { margin: var(--ui-space-2) 0 0; font-size: var(--ui-font-xs); font-weight: 700; color: var(--ui-text-secondary); letter-spacing: .02em; }
.jd-risk-hit { border: 1px solid var(--ui-border); border-left: 3px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: var(--ui-space-3); display: flex; flex-direction: column; gap: var(--ui-space-2); }
.jd-risk-hit[data-severity=high] { border-left-color: var(--ui-danger); }
.jd-risk-hit[data-severity=medium] { border-left-color: var(--ui-warning); }
.jd-risk-hit[data-severity=info] { border-left-color: var(--ui-border); }
.jd-risk-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--ui-space-2); margin: 0; }
.jd-risk-term { color: var(--ui-text-muted); font-size: var(--ui-font-xs); }
.jd-risk-excerpt { margin: 0; padding: var(--ui-space-2); background: var(--ui-bg-subtle); border-radius: var(--ui-radius-md); color: var(--ui-text-secondary); font-size: var(--ui-font-xs); }
.jd-risk-translation { margin: 0; }
.jd-risk-question { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-space-2); font-size: var(--ui-font-xs); color: var(--ui-text-secondary); }
.jd-risk-question button { min-height: var(--ui-control-height); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: var(--ui-space-1) var(--ui-space-3); background: var(--ui-bg-surface); color: var(--ui-text-main); cursor: pointer; font: inherit; }
.jd-risk-question button:hover { background: var(--ui-bg-hover); }
</style>
