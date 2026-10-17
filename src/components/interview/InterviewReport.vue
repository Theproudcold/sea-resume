<script setup lang="ts">
import { computed, ref } from 'vue';
import type { InterviewSession } from '@/types/interview';
import type { ResumeData } from '@/types/resume';
import type { OptimizationFact } from '@/types/ai';
import { storageManager } from '@/services/storage/StorageManager';
import { confirmedInterviewFacts } from '@/services/ai/interview';
import InterviewEvidence from './InterviewEvidence.vue';
import ResumeOptimizationPanel from '@/components/ai/ResumeOptimizationPanel.vue';
import { useAiWorkspaceStore } from '@/stores/aiWorkspace';
import { confirmAiAction } from '@/utils/aiDialogs';
const props = defineProps<{ session: InterviewSession }>();
const emit = defineEmits<{ configure: []; applied: [resumeId: string] }>();
const latestResume = ref<ResumeData | null>(null);
const selections = ref<Record<string, { targetId: string; confirmed: boolean }>>({});
const initialFacts = ref<OptimizationFact[]>([]);
const reviewing = ref(false);
const loading = ref(false);
const error = ref('');
const optimization = useAiWorkspaceStore();
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
    <span class="report-eyebrow">本轮复盘 · 基于实际回答</span>
    <h2>{{ session.report.incomplete ? '不完整面试报告' : '面试报告' }}</h2>
    <p v-if="session.report.incomplete">存在未回答、跳过或提前结束；结论仅针对本次已提交回答。</p>
    <p>同模型教练不是独立事实核验，不提供评分、录用概率或文字面试不可观察的语音 / 肢体评价。</p>
    <details open><summary>优点、表达问题与知识缺口 · 证据摘要</summary><InterviewEvidence :observations="session.report.observations" /><p v-if="!session.report.observations.length">没有足够回答证据，不作能力判断。</p></details>
    <details><summary>重点追问回顾</summary><InterviewEvidence :observations="session.report.followupReview" /></details>
    <h3>三项优先练习</h3><ol><li v-for="(priority, i) in session.report.priorities" :key="i">{{ priority }}</li></ol>
    <details><summary>参考表达 · 只重组真实回答</summary><p>{{ session.report.referencePhrasing || '没有可重组的回答事实' }}</p></details>
    <details><summary>知识讲解 · 非个人经历，需核实</summary><p>{{ session.report.knowledgeExplanation || '无' }}</p></details>
    <h3>用于补充简历</h3><p>只能选择实际回答的引用片段，逐项确认真实性和已有目标。表达 / 知识建议不能变为经历；之后仍须优化、审查、逐条采纳，默认另存版本。</p>
    <el-button :loading="loading" :disabled="!session.report.facts.length || reviewing" @click="prepare">读取最新简历，确认回补事实</el-button>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="latestResume && !reviewing">
      <div v-for="fact in session.report.facts" :key="fact.id" class="fact">
        <blockquote>{{ fact.text }}<small>原回答：{{ fact.answerId }}</small></blockquote>
        <template v-if="selections[fact.id]">
          <label>关联已有经历 / 项目<select v-model="selections[fact.id]!.targetId" @change="selections[fact.id]!.confirmed = false"><option value="">请选择</option><option v-for="target in targets" :key="target.id" :value="target.id">{{ target.label }}</option></select></label>
          <label><input v-model="selections[fact.id]!.confirmed" type="checkbox" :disabled="!selections[fact.id]!.targetId" />我确认这是我的真实职责、行动或结果，与所选目标相符</label>
        </template>
      </div>
      <el-button type="primary" :loading="loading" @click="review">仅将已确认事实交给优化与审查</el-button>
    </template>
    <ResumeOptimizationPanel v-if="reviewing && latestResume" :key="initialFacts.map(f => f.id).join(',')" :resume="latestResume" :initial-facts="initialFacts" @configure="emit('configure')" @applied="id => emit('applied', id)" />
  </section>
</template>
<style scoped>
.report { min-width: 0; padding: var(--ui-space-6); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); background: var(--ui-bg-surface); }.report-eyebrow { font-size: var(--ui-font-xs); color: var(--ui-primary); font-weight: 600; } h2 { font-size: var(--ui-font-xl); margin: var(--ui-space-2) 0; font-weight: 650; } h3 { font-size: var(--ui-font-lg); margin: var(--ui-space-6) 0 var(--ui-space-3); font-weight: 600; } p, li { white-space: pre-wrap; line-height: 1.8; overflow-wrap: anywhere; font-size: var(--ui-font-sm); } .report > p { color: var(--ui-text-secondary); }.report > details { margin: var(--ui-space-3) 0; padding: var(--ui-space-3) var(--ui-space-4); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); }.report > details[open] { background: var(--ui-bg-subtle); } summary { cursor: pointer; font-size: var(--ui-font-sm); font-weight: 500; line-height: 1.7; } ol { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); list-style: none; padding: 0; gap: var(--ui-space-3); counter-reset: priority; } ol > li { counter-increment: priority; padding: var(--ui-space-4); background: var(--ui-bg-subtle); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); }ol > li::before { content: '0' counter(priority); display: block; font-size: var(--ui-font-xs); color: var(--ui-primary); margin-bottom: var(--ui-space-2); font-weight: 600; }.fact { margin-top: var(--ui-space-4); padding: var(--ui-space-4); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); } blockquote { margin: 0 0 var(--ui-space-3); padding-left: var(--ui-space-3); border-left: 2px solid var(--ui-primary); white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--ui-font-md); } small { display: block; color: var(--ui-text-muted); font-size: var(--ui-font-xs); margin-top: var(--ui-space-2); } label { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); align-items: center; margin: var(--ui-space-3) 0; font-size: var(--ui-font-sm); color: var(--ui-text-secondary); } select { max-width: 100%; min-height: var(--ui-control-height); padding: var(--ui-space-2) var(--ui-space-3); background: var(--ui-bg-surface); color: var(--ui-text-main); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); } .report > :deep(.el-button) { margin-top: var(--ui-space-3); max-width: 100%; white-space: normal; min-height: var(--ui-control-height); height: auto; }.report > .optimization-panel { margin-top: var(--ui-space-6); padding-top: var(--ui-space-6); border-top: 1px solid var(--ui-border); } @media(max-width: 768px) { .report { padding: var(--ui-space-4); } ol { grid-template-columns: minmax(0, 1fr); }.report > :deep(.el-button) { width: 100%; } }
</style>
