<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ArrowDown, Right } from '@element-plus/icons-vue';
import type { InterviewSession, InterviewTurn } from '@/types/interview';
import { clearInterviewTurnDraft, readInterviewDraft, writeInterviewDraft } from '@/utils/interviewDraft';
import { formatDuration, turnAnswerMs } from '@/utils/interviewTiming';
import InterviewEvidence from './InterviewEvidence.vue';
const props = defineProps<{ session: InterviewSession; busy: boolean; consented: boolean }>();
const emit = defineEmits<{ answer: [text: string, skipped: boolean]; continue: []; draft: [dirty: boolean] }>();
const answer = ref('');
const composing = ref(false);
const conversation = ref<HTMLElement>();
const current = computed(() => props.session.turns[props.session.turns.length - 1]);
const canAnswer = computed(() => props.session.status === 'answering' && !props.session.ending && !props.busy && props.consented);
const requestLabel = computed(() => ({ initialize: '面试官正在准备第一题', next: '面试官正在根据原回答组织下一题', coach: '教练正在整理本题反馈', report: '正在整理面试报告' }[props.session.pendingStage || 'next']));
/** Drafts survive a refresh only while this interview is kept on this device. */
const draftEnabled = computed(() => props.session.persistence && !props.session.ending);
let followNext = false;
let submitting = false;
function locateCurrent(focus = false) {
  const target = conversation.value?.querySelector<HTMLElement>('[data-current="true"] .question-text');
  target?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  if (focus) target?.focus({ preventScroll: true });
}
function answerDuration(turn: InterviewTurn): string {
  const ms = turnAnswerMs(turn);
  return ms === null ? '' : formatDuration(ms);
}
watch([() => props.session.id, () => current.value?.id], async ([, turnId], previous) => {
  answer.value = draftEnabled.value && turnId ? readInterviewDraft(props.session.id, turnId) : '';
  composing.value = false;
  if (previous?.[1] && followNext) { await nextTick(); locateCurrent(true); }
  followNext = false;
}, { immediate: true });
watch(answer, value => {
  emit('draft', !!value.trim());
  const turn = current.value;
  if (draftEnabled.value && turn && !turn.submittedAt) writeInterviewDraft(props.session.id, turn.id, value, true);
});
watch(() => current.value?.submittedAt, value => { if (value) answer.value = ''; });
function submit(skipped = false, event?: KeyboardEvent) {
  if (!canAnswer.value || submitting || composing.value || event?.isComposing || (!skipped && (!answer.value.trim() || answer.value.length > 10000))) return;
  submitting = true;
  if (current.value) clearInterviewTurnDraft(props.session.id, current.value.id);
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
      <h2>一次一题，把经历讲清楚</h2>
      <el-button v-if="session.turns.length > 1 && session.status !== 'completed'" text :icon="ArrowDown" @click="locateCurrent(true)">定位当前题</el-button>
    </header>
    <div class="turn-list">
      <article v-for="turn in session.turns" :key="turn.id" class="turn" :data-current="turn.id === current?.id">
        <div class="message interviewer">
          <div class="message-meta"><strong>面试官</strong><span>第 {{ turn.mainNumber }} 题</span><span v-if="turn.followup" class="question-kind">追问</span></div>
          <div class="message-body">
            <p class="question-text" tabindex="-1">{{ turn.question.text }}</p>
            <details class="question-context"><summary>考察点与问题背景</summary><p>{{ turn.question.focus }}</p><p v-if="turn.question.kind === 'knowledge'">知识假设，不代表你的个人经历。</p></details>
          </div>
        </div>
        <div v-if="turn.submittedAt" class="message candidate">
          <div class="message-meta"><strong>你的回答</strong><span v-if="turn.skipped">已跳过</span><span v-if="answerDuration(turn)">用时 {{ answerDuration(turn) }}</span></div>
          <div class="message-body"><p>{{ turn.skipped ? '已跳过（未生成回答）' : turn.answer }}</p></div>
        </div>
        <details v-if="session.settings.mode === 'training' && turn.feedback" class="feedback" :open="turn.id === current?.id && session.status === 'reviewing'">
          <summary><span>训练点评</span><span class="summary-note">只根据你这次的回答</span></summary>
          <div class="feedback-body">
            <InterviewEvidence :observations="turn.feedback.observations" />
            <div class="feedback-tip"><h3>答题组织提示</h3><p>{{ turn.feedback.organizationHint || '先说清自己的职责，再说明行动与验证方式。' }}</p></div>
            <details><summary>参考表达：仅重组实际回答，非能力证明</summary><p>{{ turn.feedback.referencePhrasing || '没有可引用的事实' }}</p></details>
            <details><summary>知识讲解：非个人经历，需核实</summary><p>{{ turn.feedback.knowledgeExplanation || '无' }}</p></details>
          </div>
        </details>
      </article>
    </div>
    <div v-if="busy" class="request-status" role="status"><span class="request-dot" aria-hidden="true" /><div><strong>{{ requestLabel }}</strong><p>这一步完成前不会继续。可以在顶部暂停，不会自动重试。</p></div></div>
    <form v-if="session.status === 'answering' && !session.ending" class="composer" @submit.prevent="submit()">
      <div class="composer-heading"><label for="interview-answer">你的回答（可回答“不知道”，或明确跳过）</label><span aria-live="off">{{ answer.length.toLocaleString() }} / 10,000</span></div>
      <textarea id="interview-answer" v-model="answer" rows="4" maxlength="10000" :disabled="!canAnswer" aria-describedby="answer-hint" placeholder="从你的职责、具体行动和结果说起。不必完美，保持真实。" @compositionstart="composing = true" @compositionend="composing = false" @keydown.enter.ctrl.prevent="submit(false, $event)" @keydown.enter.meta.prevent="submit(false, $event)" />
      <div class="composer-footer"><p id="answer-hint"><template v-if="consented"><span>Ctrl / ⌘ + Enter 提交</span><span>普通 Enter 换行</span><span v-if="draftEnabled">草稿暂存在本机</span></template><template v-else>请先确认本次模型与发送范围，再开始作答。</template></p><div class="actions"><el-button :disabled="!canAnswer" @click="submit(true)">跳过此题</el-button><el-button native-type="submit" type="primary" :disabled="!canAnswer || !answer.trim()" :icon="Right">提交回答</el-button></div></div>
    </form>
    <div v-if="session.status === 'reviewing'" class="continue-card">
      <div><h3>{{ session.ending ? '这轮问答已结束' : '回答已保留，按你的节奏继续' }}</h3><p>{{ session.ending ? '生成报告后可查看重点反馈，并确认是否回补简历。' : session.settings.mode === 'training' ? '可以先查看本题点评。下一题仍只依据你刚提交的回答。' : '本轮不展示中途点评，结束后统一生成报告。' }}</p></div>
      <el-button type="primary" :disabled="busy || !consented" :icon="Right" @click="continueInterview">{{ session.ending ? '生成报告' : '继续下一题 / 追问' }}</el-button>
    </div>
    <div v-if="['paused', 'interrupted', 'failed'].includes(session.status)" class="paused-note"><strong>{{ session.status === 'failed' ? '这一步尚未完成' : '面试已暂停' }}</strong><p>已经提交的回答还在。用顶部的继续或重试，不会自动重新提问。</p></div>
  </section>
</template>

<style scoped>
/* A transcript: speakers in a label column, turns on hairlines, the live question on a 2px ink bar. */
.conversation { min-width: 0; }

.conversation-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding-bottom: var(--space-sm);
  border-bottom: var(--rule-bar) solid var(--color-rule);
}

h2 {
  min-width: 0;
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  letter-spacing: var(--tracking-display);
  line-height: 1.2;
  overflow-wrap: break-word;
  text-wrap: balance;
}

h3 { margin: 0 0 var(--space-2xs); font-size: var(--text-md); font-weight: 600; }

p {
  margin: var(--space-xs) 0 0;
  font-size: var(--text-md);
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.turn-list { display: grid; }

.turn {
  display: grid;
  min-width: 0;
  padding: var(--space-md) 0;
}

.turn + .turn { border-top: var(--rule-hair) solid var(--color-rule); }

.message {
  display: grid;
  grid-template-columns: 9rem minmax(0, 1fr);
  gap: var(--space-md);
  min-width: 0;
  padding: var(--space-xs) 0 var(--space-xs) var(--space-sm);
  border-left: var(--rule-bar) solid transparent;
}

.candidate {
  margin-top: var(--space-xs);
  padding-top: var(--space-sm);
  border-top: var(--rule-hair) solid var(--color-rule);
}

.turn[data-current="true"] .interviewer { border-left-color: var(--color-accent); }

.message-body { min-width: 0; }

.message-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2xs);
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.message-meta strong { color: var(--color-muted); font-size: var(--text-sm); font-weight: 500; }
.message-meta span { font-variant-numeric: tabular-nums; }

.question-kind {
  padding: 0 var(--space-2xs);
  border: var(--rule-hair) solid var(--color-rule);
  color: var(--color-ink-2);
}

.turn[data-current="true"] .question-kind { border-color: var(--color-accent); color: var(--color-accent); border-radius: var(--radius-s); }

.question-text {
  margin-top: 0;
  color: var(--color-ink-2);
  font-size: var(--text-md);
  font-weight: 500;
  scroll-margin-top: var(--space-lg);
}

.turn[data-current="true"] .question-text {
  color: var(--color-ink);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.5;
}

.candidate .message-body p { margin-top: 0; color: var(--color-ink); }

summary {
  color: var(--color-ink-2);
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 1.55;
  transition: color var(--dur-micro) var(--ease-out);
}

summary:active { color: var(--color-accent); }

@media (hover: hover) {
  summary:hover { color: var(--color-ink); text-decoration: underline; }
}

.question-context { margin-top: var(--space-xs); }
.question-context p { color: var(--color-ink-2); font-size: var(--text-sm); }

.feedback {
  margin: var(--space-sm) 0 0 calc(9rem + var(--space-md) + var(--space-sm) + var(--rule-bar));
  border-top: var(--rule-hair) solid var(--color-rule);
}

.feedback > summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-sm);
  padding: var(--space-xs) 0;
  color: var(--color-ink);
  font-weight: 600;
}

.summary-note { color: var(--color-muted); font-weight: 500; }

.feedback-body { display: grid; gap: var(--space-sm); padding-bottom: var(--space-xs); }
.feedback-body p { font-size: var(--text-sm); }
.feedback-body > details { padding-top: var(--space-xs); border-top: var(--rule-hair) solid var(--color-rule); }
.feedback-tip { padding: var(--space-sm) var(--space-md); background: var(--color-paper-2); }

/* Composer: the answer field held on the paper by a 2px ink edge. */
.composer {
  position: sticky;
  bottom: var(--space-sm);
  z-index: 2;
  display: grid;
  gap: var(--space-xs);
  margin-top: var(--space-md);
  padding: var(--space-md);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper-3);
  box-shadow: var(--shadow-card);
}

.composer-heading, .composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.composer-heading label { color: var(--color-ink-2); font-size: var(--text-sm); font-weight: 500; }

.composer-heading > span {
  flex-shrink: 0;
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

textarea {
  width: 100%;
  min-height: 96px;
  max-height: 240px;
  padding: var(--space-xs) var(--space-sm);
  border: var(--rule-hair) solid var(--color-rule-2);
  border-radius: var(--radius-input);
  background: var(--color-paper-3);
  color: inherit;
  font: inherit;
  font-size: var(--text-md);
  line-height: 1.7;
  resize: vertical;
  transition: box-shadow var(--dur-micro) var(--ease-out);
}

textarea:focus-visible { outline: none; border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-accent-wash); }
textarea:disabled { opacity: 0.55; cursor: not-allowed; }
textarea::placeholder { color: var(--color-muted); }

.composer-footer p {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-md);
  margin: 0;
  color: var(--color-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.actions { display: flex; flex-shrink: 0; gap: var(--space-xs); }
.actions :deep(.el-button) { margin: 0; }

.continue-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-top: var(--space-md);
  padding: var(--space-md);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper-3);
  box-shadow: var(--shadow-card);
}

.continue-card p, .paused-note p, .request-status p { font-size: var(--text-sm); }
.continue-card p { margin-top: 0; color: var(--color-ink-2); }
.continue-card :deep(.el-button) { flex-shrink: 0; }

.request-status {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-md) 0;
  border-top: var(--rule-hair) solid var(--color-rule);
  color: var(--color-ink-2);
  font-size: var(--text-sm);
}

.request-status strong { color: var(--color-ink); font-weight: 600; }
.request-status p { margin-top: var(--space-2xs); }

.request-dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  margin-top: var(--space-2xs);
  background: var(--color-accent);
  animation: request-blink 1.2s var(--ease-out) infinite;
}

/* The paused or failed step: an amber plate under ink text. */
.paused-note {
  margin-top: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border: var(--rule-hair) solid color-mix(in oklab, var(--color-warning) 40%, transparent);
  border-radius: var(--radius-card);
  background: var(--color-warning-wash);
  color: var(--color-ink);
  font-size: var(--text-sm);
}

.paused-note strong { font-weight: 600; }
.paused-note p { margin-top: var(--space-2xs); }

@keyframes request-blink { 50% { opacity: 0.25; } }

@media (prefers-reduced-motion: reduce) { .request-dot { animation: none; } }

@media (max-width: 768px) {
  .conversation-heading { align-items: flex-start; }
  h2 { font-size: var(--text-lg); }
  .conversation-heading :deep(.el-button) { padding: var(--space-2xs); font-size: var(--text-xs); }
  .message { grid-template-columns: minmax(0, 1fr); gap: var(--space-xs); }
  .message-meta { flex-direction: row; flex-wrap: wrap; align-items: center; gap: var(--space-xs); }
  .feedback { margin-left: 0; }
  .composer { bottom: max(var(--space-xs), env(safe-area-inset-bottom)); padding: var(--space-sm); }
  .composer-heading { align-items: flex-start; }
  .composer-heading label { max-width: 75%; }
  .composer-footer, .continue-card { align-items: stretch; flex-direction: column; }
  .actions { justify-content: flex-end; }
  .continue-card :deep(.el-button) { align-self: flex-end; }
  .turn[data-current="true"] .question-text { font-size: var(--text-md); }
}
</style>
