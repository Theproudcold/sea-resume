<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ArrowDown, ChatDotRound, EditPen, Right } from '@element-plus/icons-vue';
import type { InterviewSession } from '@/types/interview';
import InterviewEvidence from './InterviewEvidence.vue';
const props = defineProps<{ session: InterviewSession; busy: boolean; consented: boolean }>();
const emit = defineEmits<{ answer: [text: string, skipped: boolean]; continue: []; draft: [dirty: boolean] }>();
const answer = ref('');
const composing = ref(false);
const conversation = ref<HTMLElement>();
const current = computed(() => props.session.turns[props.session.turns.length - 1]);
const canAnswer = computed(() => props.session.status === 'answering' && !props.session.ending && !props.busy && props.consented);
const requestLabel = computed(() => ({ initialize: '面试官正在准备第一题', next: '面试官正在根据原回答组织下一题', coach: '教练正在整理本题反馈', report: '正在整理面试报告' }[props.session.pendingStage || 'next']));
let followNext = false;
let submitting = false;
function locateCurrent(focus = false) {
  const target = conversation.value?.querySelector<HTMLElement>('[data-current="true"] .question-text');
  target?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  if (focus) target?.focus({ preventScroll: true });
}
watch(() => current.value?.id, async (_id, previous) => {
  answer.value = ''; composing.value = false;
  if (previous && followNext) { await nextTick(); locateCurrent(true); }
  followNext = false;
});
watch(answer, value => emit('draft', !!value.trim()));
watch(() => current.value?.submittedAt, value => { if (value) answer.value = ''; });
function submit(skipped = false, event?: KeyboardEvent) {
  if (!canAnswer.value || submitting || composing.value || event?.isComposing || (!skipped && (!answer.value.trim() || answer.value.length > 10000))) return;
  submitting = true;
  emit('answer', answer.value, skipped);
  void nextTick(() => { submitting = false; });
}
function continueInterview() {
  if (props.busy || !props.consented || props.session.status !== 'reviewing') return;
  followNext = true; emit('continue');
}
</script>

<template>
  <section ref="conversation" aria-label="面试对话" class="conversation" :aria-busy="busy">
    <header class="conversation-heading">
      <div><span class="eyebrow">INTERVIEW ROOM</span><h2>一次一题，把经历讲清楚</h2></div>
      <el-button v-if="session.turns.length > 1 && session.status !== 'completed'" text :icon="ArrowDown" @click="locateCurrent(true)">定位当前题</el-button>
    </header>
    <div class="turn-list">
      <article v-for="turn in session.turns" :key="turn.id" class="turn" :data-current="turn.id === current?.id">
        <div class="message interviewer">
          <span class="avatar" aria-hidden="true"><el-icon><ChatDotRound /></el-icon></span>
          <div class="message-body">
            <div class="message-meta"><strong>面试官</strong><span>第 {{ turn.mainNumber }} 题</span><span v-if="turn.followup" class="question-kind">追问 1/1</span><span v-else class="question-kind">主问题</span></div>
            <p class="question-text" tabindex="-1">{{ turn.question.text }}</p>
            <details class="question-context"><summary>考察点与问题背景</summary><p>{{ turn.question.focus }}</p><p v-if="turn.question.kind === 'knowledge'">知识假设，不代表你的个人经历。</p></details>
          </div>
        </div>
        <div v-if="turn.submittedAt" class="message candidate">
          <div class="message-body"><div class="message-meta"><strong>你的原回答</strong><span v-if="turn.skipped">已跳过</span><span v-else>原文保留</span></div><p>{{ turn.skipped ? '已跳过（未生成回答）' : turn.answer }}</p></div>
          <span class="avatar" aria-hidden="true"><el-icon><EditPen /></el-icon></span>
        </div>
        <details v-if="session.settings.mode === 'training' && turn.feedback" class="feedback" :open="turn.id === current?.id && session.status === 'reviewing'">
          <summary>训练点评 · 基于证据的摘要（非内部推理）</summary>
          <div class="feedback-body">
            <InterviewEvidence :observations="turn.feedback.observations" />
            <div class="feedback-tip"><h3>答题组织提示</h3><p>{{ turn.feedback.organizationHint || '先说清自己的职责，再说明行动与验证方式。' }}</p></div>
            <details><summary>参考表达：仅重组实际回答，非能力证明</summary><p>{{ turn.feedback.referencePhrasing || '没有可引用的事实' }}</p></details>
            <details><summary>知识讲解：非个人经历，需核实</summary><p>{{ turn.feedback.knowledgeExplanation || '无' }}</p></details>
          </div>
        </details>
      </article>
    </div>
    <div v-if="busy" class="request-status" role="status"><span class="request-dot" aria-hidden="true" /><div><strong>{{ requestLabel }}</strong><p>仅在当前步骤完成后继续；可在顶部暂停，不会自动重试。</p></div></div>
    <form v-if="session.status === 'answering' && !session.ending" class="composer" @submit.prevent="submit()">
      <div class="composer-heading"><label for="interview-answer">你的回答（可回答“不知道”，或明确跳过）</label><span aria-live="off">{{ answer.length.toLocaleString() }} / 10,000</span></div>
      <textarea id="interview-answer" v-model="answer" rows="4" maxlength="10000" :disabled="!canAnswer" aria-describedby="answer-hint" placeholder="从你的职责、具体行动和结果说起。不必完美，保持真实。" @compositionstart="composing = true" @compositionend="composing = false" @keydown.enter.ctrl.prevent="submit(false, $event)" @keydown.enter.meta.prevent="submit(false, $event)" />
      <div class="composer-footer"><p id="answer-hint">{{ consented ? 'Ctrl / ⌘ + Enter 提交 · 普通 Enter 换行' : '请先确认本次模型与发送范围，再开始作答。' }}</p><div class="actions"><el-button :disabled="!canAnswer" @click="submit(true)">跳过此题</el-button><el-button native-type="submit" type="primary" :disabled="!canAnswer || !answer.trim()" :icon="Right">提交原回答</el-button></div></div>
    </form>
    <div v-if="session.status === 'reviewing'" class="continue-card">
      <div><span class="eyebrow">{{ session.ending ? 'READY FOR REVIEW' : 'ANSWER SAVED' }}</span><h3>{{ session.ending ? '这轮问答已结束' : '回答已保留，按你的节奏继续' }}</h3><p>{{ session.ending ? '生成报告后可查看重点反馈，并确认是否回补简历。' : session.settings.mode === 'training' ? '可以先查看本题点评。下一题仍只依据你的原回答。' : '本轮不展示中途点评，结束后统一生成报告。' }}</p></div>
      <el-button type="primary" :disabled="busy || !consented" :icon="Right" @click="continueInterview">{{ session.ending ? '生成报告' : '继续下一题 / 追问' }}</el-button>
    </div>
    <div v-if="['paused', 'interrupted', 'failed'].includes(session.status)" class="paused-note"><strong>{{ session.status === 'failed' ? '这一步尚未完成' : '面试已暂停' }}</strong><p>已提交的原回答仍在。请使用顶部的恢复或重试操作，不会自动重新请求。</p></div>
  </section>
</template>

<style scoped>
.conversation { min-width: 0; padding: var(--ui-space-6); border-radius: var(--ui-radius-lg); background: var(--ui-bg-surface); border: 1px solid var(--ui-border); }
.conversation-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); padding-bottom: var(--ui-space-6); border-bottom: 1px solid var(--ui-border); }
.eyebrow { font-size: var(--ui-font-xs); letter-spacing: .1em; color: var(--ui-text-muted); font-weight: 600; }
h2 { font-size: var(--ui-font-lg); margin: var(--ui-space-1) 0 0; font-weight: 650; } h3 { font-size: var(--ui-font-md); font-weight: 600; margin: 0 0 var(--ui-space-2); }
.turn-list { padding-top: var(--ui-space-6); display: grid; gap: var(--ui-space-8); }
.turn { min-width: 0; display: grid; gap: var(--ui-space-4); }
.message { display: flex; gap: var(--ui-space-3); align-items: flex-start; min-width: 0; }
.avatar { width: 32px; height: 32px; display: grid; place-items: center; flex: 0 0 auto; border-radius: var(--ui-radius-md); color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 8%, var(--ui-bg-surface)); }
.message-body { min-width: 0; flex: 1; } .message-meta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ui-space-2); color: var(--ui-text-muted); font-size: var(--ui-font-xs); }
.message-meta strong { color: var(--ui-text-main); font-size: var(--ui-font-sm); } .question-kind { padding: 0 var(--ui-space-2); background: var(--ui-bg-subtle); border-radius: var(--ui-radius-sm); }
p { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.8; margin: var(--ui-space-2) 0 0; font-size: var(--ui-font-md); }
.question-text { font-size: var(--ui-font-lg); font-weight: 550; line-height: 1.75; scroll-margin-top: var(--ui-space-6); }
.question-context { margin-top: var(--ui-space-3); color: var(--ui-text-secondary); } summary { cursor: pointer; font-size: var(--ui-font-sm); line-height: var(--ui-line-height); }
.question-context p { font-size: var(--ui-font-sm); }
.candidate { margin-left: auto; width: min(85%, 640px); } .candidate .message-body { padding: var(--ui-space-4); background: color-mix(in srgb, var(--ui-primary) 5%, var(--ui-bg-surface)); border: 1px solid color-mix(in srgb, var(--ui-primary) 10%, var(--ui-border)); border-radius: var(--ui-radius-lg); }
.candidate .avatar { color: var(--ui-text-secondary); background: var(--ui-bg-subtle); }
.feedback { margin-left: calc(32px + var(--ui-space-3)); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-bg-subtle); }
.feedback > summary { padding: var(--ui-space-3) var(--ui-space-4); color: var(--ui-primary); font-weight: 550; } .feedback-body { padding: 0 var(--ui-space-4) var(--ui-space-4); display: grid; gap: var(--ui-space-4); }
.feedback-tip { padding: var(--ui-space-3); border-left: 2px solid var(--ui-primary); background: var(--ui-bg-surface); } .feedback-body p { font-size: var(--ui-font-sm); }
.composer { position: sticky; bottom: var(--ui-space-3); z-index: 2; display: grid; gap: var(--ui-space-3); margin-top: var(--ui-space-6); padding: var(--ui-space-4); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); background: var(--ui-bg-elevated); box-shadow: var(--ui-shadow-md); }
.composer:focus-within { border-color: var(--ui-primary); } .composer-heading, .composer-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); }
.composer-heading label { font-size: var(--ui-font-sm); font-weight: 550; } .composer-heading > span { flex-shrink: 0; font-size: var(--ui-font-xs); color: var(--ui-text-muted); font-variant-numeric: tabular-nums; }
textarea { width: 100%; min-height: 96px; max-height: 240px; padding: 0; border: 0; resize: vertical; font: inherit; font-size: var(--ui-font-md); line-height: 1.8; background: transparent; color: inherit; } textarea:focus-visible { outline: none; } textarea::placeholder { color: var(--ui-text-muted); }
.composer-footer p { margin: 0; color: var(--ui-text-muted); font-size: var(--ui-font-xs); } .actions { display: flex; gap: var(--ui-space-2); flex-shrink: 0; }.actions :deep(.el-button) { margin: 0; }
.continue-card { margin-top: var(--ui-space-6); display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4); padding: var(--ui-space-4); border-radius: var(--ui-radius-md); background: var(--ui-bg-subtle); border: 1px solid var(--ui-border); }
.continue-card h3 { margin-top: var(--ui-space-1); } .continue-card p, .paused-note p, .request-status p { font-size: var(--ui-font-sm); color: var(--ui-text-secondary); } .continue-card :deep(.el-button) { flex-shrink: 0; }
.request-status { display: flex; gap: var(--ui-space-3); align-items: flex-start; padding: var(--ui-space-4) 0; color: var(--ui-text-secondary); font-size: var(--ui-font-sm); }
.request-dot { height: 8px; width: 8px; border-radius: 50%; margin-top: var(--ui-space-2); background: var(--ui-primary); flex-shrink: 0; animation: breathe 1.4s ease-in-out infinite; }
.paused-note { margin-top: var(--ui-space-6); padding: var(--ui-space-4); background: var(--ui-bg-subtle); border-radius: var(--ui-radius-md); font-size: var(--ui-font-sm); }
@keyframes breathe { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .request-dot { animation: none; } }
@media (max-width: 768px) { .conversation { padding: var(--ui-space-4); }.conversation-heading { align-items: flex-start; }.conversation-heading h2 { font-size: var(--ui-font-md); }.conversation-heading :deep(.el-button) { padding: var(--ui-space-1); font-size: var(--ui-font-xs); }.candidate { width: 94%; }.feedback { margin-left: 0; }.composer { bottom: max(var(--ui-space-2), env(safe-area-inset-bottom)); padding: var(--ui-space-3); }.composer-heading { align-items: flex-start; }.composer-heading label { max-width: 75%; }.composer-footer, .continue-card { align-items: stretch; flex-direction: column; }.actions { justify-content: flex-end; }.continue-card :deep(.el-button) { align-self: flex-end; }.question-text { font-size: var(--ui-font-md); } }
</style>
