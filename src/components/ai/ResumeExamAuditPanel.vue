<template>
  <section class="exam-audit" aria-label="简历考纲防翻车自查">
    <p class="hint">
      面试考纲就是你自己的简历（纯本地扫描，不调用模型）。逐条确认：<strong>稳了</strong>就留着，<strong>需补学</strong>去准备，<strong>怕被问倒</strong>直接回编辑器删改。
    </p>

    <div v-if="points.length" class="audit-stats">
      <span>共识别 <strong>{{ points.length }}</strong> 个高频考纲点</span>
      <span class="stat-pill stat-pill--ready">稳了 {{ counts.ready }}</span>
      <span class="stat-pill stat-pill--study">需补学 {{ counts.study }}</span>
      <span class="stat-pill stat-pill--remove">待删改 {{ counts.remove }}</span>
    </div>

    <div v-if="!points.length" class="empty-hint">
      当前简历暂未识别到高风险深挖考点。完善专业技能、量化数据或核心项目描述后，这里会自动生成面试考纲清单。
    </div>

    <div v-else class="audit-list">
      <article v-for="point in points" :key="point.id" class="audit-card" data-testid="exam-audit-card">
        <header class="audit-card__head">
          <div class="audit-card__title">
            <el-tag :type="point.risk === 'high' ? 'danger' : 'warning'" size="small" effect="plain">
              {{ point.risk === 'high' ? '高频深挖' : '常规追问' }}
            </el-tag>
            <strong>{{ point.topic }}</strong>
          </div>
          <el-button
            link
            type="primary"
            size="small"
            data-testid="exam-audit-jump"
            @click="emit('navigate', point.section, point.target)"
          >去删改</el-button>
        </header>

        <p class="audit-card__source">
          <small>{{ point.sourceLabel }}：</small>「{{ point.sourceSnippet }}」
        </p>

        <ol class="audit-card__questions">
          <li v-for="(question, idx) in point.probeQuestions" :key="idx">{{ question }}</li>
        </ol>

        <p class="audit-card__advice">{{ point.advice }}</p>

        <div class="audit-card__status" role="group" :aria-label="`${point.topic}自检状态`">
          <button
            v-for="opt in STATUS_OPTIONS"
            :key="opt.value"
            type="button"
            class="status-btn"
            :class="[`status-btn--${opt.value}`, { 'is-active': statusOf(point.id) === opt.value }]"
            :data-testid="`exam-status-${point.id}-${opt.value}`"
            @click="toggleStatus(point.id, opt.value)"
          >{{ opt.label }}</button>
        </div>
      </article>
    </div>

    <div v-if="points.length" class="audit-footer">
      <el-button type="primary" plain data-testid="exam-start-interview" @click="emit('start-interview')">
        前往模拟面试实战演练
      </el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ResumeData } from '@/types/resume';
import type { ResumeQualitySection } from '@/utils/resumeQuality';
import {
  buildResumeExamAudit,
  loadExamAuditStatuses,
  saveExamAuditStatus,
  type ExamAuditStatus,
} from '@/utils/resumeExamAudit';

const props = defineProps<{ resume: ResumeData }>();
const emit = defineEmits<{
  navigate: [section: ResumeQualitySection, target: string | null];
  'start-interview': [];
}>();

const STATUS_OPTIONS: Array<{ value: Exclude<ExamAuditStatus, 'unchecked'>; label: string }> = [
  { value: 'ready', label: '稳了，能讲透' },
  { value: 'study', label: '需补学' },
  { value: 'remove', label: '怕问倒，去删改' },
];

const points = computed(() => buildResumeExamAudit(props.resume));
const statuses = ref<Record<string, ExamAuditStatus>>({});

watch(() => props.resume.id, (id) => {
  statuses.value = loadExamAuditStatuses(id);
}, { immediate: true });

function statusOf(pointId: string): ExamAuditStatus {
  return statuses.value[pointId] ?? 'unchecked';
}

function toggleStatus(pointId: string, next: Exclude<ExamAuditStatus, 'unchecked'>) {
  const target: ExamAuditStatus = statusOf(pointId) === next ? 'unchecked' : next;
  statuses.value = saveExamAuditStatus(props.resume.id, pointId, target);
}

const counts = computed(() => {
  let ready = 0;
  let study = 0;
  let remove = 0;
  for (const point of points.value) {
    const st = statusOf(point.id);
    if (st === 'ready') ready += 1;
    else if (st === 'study') study += 1;
    else if (st === 'remove') remove += 1;
  }
  return { ready, study, remove };
});
</script>

<style scoped>
.exam-audit {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hint,
.empty-hint {
  margin: 0;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-sm);
  line-height: 1.65;
}

.empty-hint {
  padding: 16px;
  border: 1px dashed var(--ui-border);
  border-radius: var(--ui-radius-md);
}

.audit-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg-subtle);
  font-size: var(--ui-font-xs);
  color: var(--ui-text-secondary);
}

.stat-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}

.stat-pill--ready { background: color-mix(in srgb, var(--el-color-success) 12%, transparent); color: var(--el-color-success); }
.stat-pill--study { background: color-mix(in srgb, var(--el-color-warning) 14%, transparent); color: var(--el-color-warning); }
.stat-pill--remove { background: color-mix(in srgb, var(--el-color-danger) 12%, transparent); color: var(--el-color-danger); }

.audit-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.audit-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg-surface);
}

.audit-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.audit-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--ui-font-sm);
}

.audit-card__source {
  margin: 0;
  padding: 6px 8px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg-subtle);
  color: var(--ui-text-main);
  font-size: var(--ui-font-xs);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.audit-card__source small {
  color: var(--ui-text-muted);
}

.audit-card__questions {
  margin: 0;
  padding-left: 18px;
  color: var(--ui-text-main);
  font-size: var(--ui-font-sm);
  line-height: 1.55;
}

.audit-card__questions li + li {
  margin-top: 4px;
}

.audit-card__advice {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: var(--ui-font-xs);
  line-height: 1.5;
}

.audit-card__status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.status-btn {
  padding: 4px 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-xs);
  cursor: pointer;
}

.status-btn--ready.is-active {
  border-color: var(--el-color-success);
  color: var(--el-color-success);
  background: color-mix(in srgb, var(--el-color-success) 10%, transparent);
  font-weight: 600;
}

.status-btn--study.is-active {
  border-color: var(--el-color-warning);
  color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  font-weight: 600;
}

.status-btn--remove.is-active {
  border-color: var(--el-color-danger);
  color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 10%, transparent);
  font-weight: 600;
}

.audit-footer {
  display: flex;
  justify-content: flex-end;
}
</style>
