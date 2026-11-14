<script setup lang="ts">
import { computed, ref } from 'vue';
import type { InterviewFocus, InterviewSession } from '@/types/interview';
import type { ResumeData } from '@/types/resume';
import type { OptimizationFact } from '@/types/ai';
import { storageManager } from '@/services/storage/StorageManager';
import { confirmedInterviewFacts } from '@/services/ai/interview';
import { weaknessFocusFromReport } from '@/utils/interviewWeakness';
import InterviewEvidence from './InterviewEvidence.vue';
import ResumeOptimizationPanel from '@/components/ai/ResumeOptimizationPanel.vue';
import { useAiWorkspaceStore } from '@/stores/aiWorkspace';
import { confirmAiAction } from '@/utils/aiDialogs';
const props = defineProps<{ session: InterviewSession }>();
const emit = defineEmits<{ configure: []; applied: [resumeId: string]; practice: [focus: InterviewFocus] }>();
const latestResume = ref<ResumeData | null>(null);
const selections = ref<Record<string, { targetId: string; confirmed: boolean }>>({});
const initialFacts = ref<OptimizationFact[]>([]);
const reviewing = ref(false);
const loading = ref(false);
const error = ref('');
const optimization = useAiWorkspaceStore();
const practiceFocus = computed(() => weaknessFocusFromReport(props.session));
/** Show the question the fact came from, not an internal answer id. */
function answerLabel(answerId: string): string {
  const turn = props.session.turns.find(item => item.id === answerId);
  return turn ? `主问题 ${turn.mainNumber}${turn.followup ? ' · 追问' : ''}` : '原回答不可用';
}
function startPractice() { if (practiceFocus.value) emit('practice', practiceFocus.value); }
const targets = computed(() => latestResume.value ? [...(latestResume.value.hiddenSections?.includes('experience') ? [] : latestResume.value.experiences).filter(item => item.visible !== false).map(item => ({ id: item.id, label: `经历 · ${item.company} / ${item.position}` })), ...(latestResume.value.hiddenSections?.includes('projects') ? [] : latestResume.value.projects).filter(item => item.visible !== false).map(item => ({ id: item.id, label: `项目 · ${item.name}` }))] : []);
async function prepare() {
  if (loading.value) return;
  loading.value = true; error.value = ''; reviewing.value = false;
  try {
    latestResume.value = await storageManager.read(props.session.sourceResumeId);
    if (!latestResume.value) throw new Error('来源简历已删除，不能回补。');
    selections.value = Object.fromEntries((props.session.report?.facts ?? []).map(fact => [fact.id, { targetId: '', confirmed: false }]));
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '读取最新简历失败'; }
  finally { loading.value = false; }
}
async function review() {
  if (loading.value) return;
  loading.value = true; error.value = '';
  try {
    // Read again at handoff: do not apply to the stale interview snapshot.
    latestResume.value = await storageManager.read(props.session.sourceResumeId);
    if (!latestResume.value) throw new Error('来源简历已删除。');
    initialFacts.value = confirmedInterviewFacts(props.session, Object.entries(selections.value).map(([factId, selection]) => ({ factId, ...selection })), targets.value.map(target => target.id));
    if (!initialFacts.value.length) throw new Error('请选定目标并明确确认至少一项真实事实。');
    if (optimization.run && (optimization.unsaved || optimization.busy) && !await confirmAiAction('开始新的回补审查？', '这会替换内存中的旧优化任务，已保存记录不受影响。请先保存重要内容。', '开始新审查')) return;
    optimization.reset();
    reviewing.value = true;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '回补校验失败'; }
  finally { loading.value = false; }
}
</script>
<template>
  <section v-if="session.report" class="report">
    <header class="report-head">
      <h2>{{ session.report.incomplete ? '不完整面试报告' : '面试报告' }}</h2>
      <p class="report-meta"><span>本轮复盘</span><span>基于实际回答</span></p>
    </header>
    <p v-if="session.report.incomplete" class="report-warning">存在未回答、跳过或提前结束；结论仅针对本次已提交回答。</p>
    <p>同模型教练不是独立事实核验，不提供评分、录用概率或文字面试不可观察的语音 / 肢体评价。</p>
    <details open><summary><span>优点、表达问题与知识缺口</span><span class="summary-note">证据摘要</span></summary><InterviewEvidence :observations="session.report.observations" /><p v-if="!session.report.observations.length">没有足够回答证据，不作能力判断。</p></details>
    <details><summary>重点追问回顾</summary><InterviewEvidence :observations="session.report.followupReview" /></details>
    <h3>三项优先练习</h3><ol><li v-for="(priority, i) in session.report.priorities" :key="i">{{ priority }}</li></ol>
    <div v-if="practiceFocus" class="practice-row">
      <p>把这次复盘的重点带进下一场：只围绕你勾选的方向提问，主问题上限仍是 {{ session.settings.mainQuestionLimit }} 道，追问规则不变。</p>
      <el-button type="primary" plain @click="startPractice">针对弱项再练一轮</el-button>
    </div>
    <details><summary><span>参考表达</span><span class="summary-note">只重组真实回答</span></summary><p>{{ session.report.referencePhrasing || '没有可重组的回答事实' }}</p></details>
    <details><summary><span>知识讲解</span><span class="summary-note">非个人经历，需核实</span></summary><p>{{ session.report.knowledgeExplanation || '无' }}</p></details>
    <h3>用于补充简历</h3><p>只能选择实际回答的引用片段，逐项确认真实性和已有目标。表达 / 知识建议不能变为经历；之后仍须优化、审查、逐条采纳，默认另存版本。</p>
    <el-button :loading="loading" :disabled="!session.report.facts.length || reviewing" @click="prepare">读取最新简历，确认回补事实</el-button>
    <p v-if="error" role="alert" class="report-error">{{ error }}</p>
    <template v-if="latestResume && !reviewing">
      <div v-for="fact in session.report.facts" :key="fact.id" class="fact">
        <blockquote>{{ fact.text }}<small>来自 {{ answerLabel(fact.answerId) }}</small></blockquote>
        <template v-if="selections[fact.id]">
          <label>关联已有经历 / 项目<select v-model="selections[fact.id]!.targetId" @change="selections[fact.id]!.confirmed = false"><option value="">请选择</option><option v-for="target in targets" :key="target.id" :value="target.id">{{ target.label }}</option></select></label>
          <label class="check"><input v-model="selections[fact.id]!.confirmed" type="checkbox" :disabled="!selections[fact.id]!.targetId" />我确认这是我的真实职责、行动或结果，与所选目标相符</label>
        </template>
      </div>
      <el-button type="primary" :loading="loading" @click="review">仅将已确认事实交给优化与审查</el-button>
    </template>
    <ResumeOptimizationPanel v-if="reviewing && latestResume" :key="initialFacts.map(f => f.id).join(',')" :resume="latestResume" :initial-facts="initialFacts" @configure="emit('configure')" @applied="id => emit('applied', id)" />
  </section>
</template>
<style scoped>
/* The report: flat on the paper under a 2px ink rule; disclosures on hairlines, priorities as numbered plates. */
.report {
  min-width: 0;
  padding-top: var(--space-md);
  border-top: var(--rule-bar) solid var(--color-rule);
}

.report-head { display: grid; gap: var(--space-2xs); min-width: 0; margin-bottom: var(--space-sm); }

h2 {
  min-width: 0;
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 600;
  letter-spacing: var(--tracking-display);
  line-height: 1.15;
  overflow-wrap: break-word;
  text-wrap: balance;
}

.report-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-md);
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

h3 {
  margin: var(--space-lg) 0 var(--space-sm);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.25;
}

p, li {
  margin: var(--space-xs) 0 0;
  font-size: var(--text-sm);
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.report > p { color: var(--color-ink-2); }

.report > .report-warning {
  padding: var(--space-xs) var(--space-md);
  border: var(--rule-hair) solid color-mix(in oklab, var(--color-warning) 40%, transparent);
  border-radius: var(--radius-card);
  background: var(--color-warning-wash);
  color: var(--color-ink);
  font-weight: 500;
}

.report > .report-error { color: var(--color-error); font-weight: 500; }

.report > details {
  margin: 0;
  padding: var(--space-sm) 0;
  border-bottom: var(--rule-hair) solid var(--color-rule);
}

.report > p + details { margin-top: var(--space-md); border-top: var(--rule-hair) solid var(--color-rule); }

summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-sm);
  color: var(--color-ink);
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.6;
  transition: color var(--dur-micro) var(--ease-out);
}

.summary-note { color: var(--color-muted); font-weight: 500; }
summary:active { color: var(--color-accent); }

@media (hover: hover) {
  summary:hover { text-decoration: underline; }
}

ol {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: priority;
}

ol > li {
  min-width: 0;
  margin: 0;
  padding: var(--space-md);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper-3);
  counter-increment: priority;
}

ol > li::before {
  content: '0' counter(priority);
  display: block;
  margin-bottom: var(--space-xs);
  color: var(--color-ink);
  font-size: var(--text-2xl);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

/* Targeted practice: one quiet plate between the priorities and the disclosures. */
.practice-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm) var(--space-md);
  margin-top: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper-2);
}

.practice-row p { margin: 0; color: var(--color-ink-2); font-size: var(--text-sm); }
.practice-row :deep(.el-button) { flex-shrink: 0; margin: 0; }

.fact {
  margin-top: var(--space-md);
  padding: var(--space-md) 0;
  border-top: var(--rule-hair) solid var(--color-rule);
}

blockquote {
  margin: 0 0 var(--space-sm);
  padding-left: var(--space-sm);
  border-left: var(--rule-bar) solid var(--color-rule);
  font-size: var(--text-md);
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

small { display: block; margin-top: var(--space-xs); color: var(--color-muted); font-size: var(--text-xs); font-weight: 500; }

label {
  display: grid;
  gap: var(--space-2xs);
  margin: var(--space-sm) 0;
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  font-weight: 500;
}

label.check { display: flex; align-items: flex-start; gap: var(--space-xs); color: var(--color-ink); }
label.check input { margin-top: var(--space-2xs); accent-color: var(--color-accent); }
label.check input:disabled { opacity: 0.55; cursor: not-allowed; }

select {
  max-width: 100%;
  min-height: var(--control-height);
  padding: var(--space-2xs) var(--space-sm);
  border: var(--rule-hair) solid var(--color-rule-2);
  border-radius: var(--radius-input);
  background: var(--color-paper-3);
  color: var(--color-ink);
  font: inherit;
  font-weight: 400;
  transition: box-shadow var(--dur-micro) var(--ease-out), border-color var(--dur-micro) var(--ease-out);
}

select:focus-visible { outline: none; border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-accent-wash); }

@media (hover: hover) {
  select:hover { border-color: var(--color-ink-2); }
}

.report > :deep(.el-button) { max-width: 100%; height: auto; min-height: var(--control-height); margin-top: var(--space-sm); white-space: normal; }
.report > .optimization-panel { margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: var(--rule-bar) solid var(--color-rule); }

@media (max-width: 768px) {
  h2 { font-size: var(--text-xl); }
  ol { grid-template-columns: minmax(0, 1fr); }
  ol > li + li { margin-top: 0; margin-left: 0; }
  .report > :deep(.el-button) { width: 100%; }
  .practice-row :deep(.el-button) { width: 100%; }
}
</style>
