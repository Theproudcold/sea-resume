<template>
  <el-dialog
    :model-value="modelValue"
    title="简历质量检查"
    width="var(--ui-dialog-width-md)"
    align-center
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <p class="quality-intro">检查只提供内容完整性建议，不会自动修改简历。</p>
    <el-empty v-if="!issues.length" description="未发现基础完整性问题。" />
    <div v-else class="quality-groups">
      <section v-for="group in groups" :key="group.section" class="quality-group">
        <h3 class="quality-group__title">{{ group.title }}</h3>
        <ul class="quality-list" :aria-label="`${group.title}的检查结果`">
          <li v-for="(issue, index) in group.issues" :key="`${issue.id}-${index}`">
            <span class="quality-dot" :class="`quality-dot--${issue.severity}`" aria-hidden="true">{{ issue.severity === 'warning' ? '!' : 'i' }}</span>
            <span class="quality-message">{{ issue.message }}</span>
            <el-button
              link
              type="primary"
              :aria-label="`去编辑：${issue.message}`"
              @click="$emit('navigate', issue.section, issue.target)"
            >去编辑</el-button>
          </li>
        </ul>
      </section>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ResumeQualityIssue } from '@/utils/resumeQuality';

const props = defineProps<{ modelValue: boolean; issues: ResumeQualityIssue[] }>();
defineEmits<{
  'update:modelValue': [value: boolean];
  navigate: [section: ResumeQualityIssue['section'], target: ResumeQualityIssue['target']];
}>();

/** Fixed reading order; only sections that actually have issues are rendered. */
const GROUP_TITLES: Array<{ section: ResumeQualityIssue['section']; title: string }> = [
  { section: 'basic', title: '基础信息' },
  { section: 'experience', title: '工作经历' },
  { section: 'projects', title: '项目经验' },
  { section: 'education', title: '教育背景' },
  { section: 'skills', title: '技能证书' },
];

const groups = computed(() => GROUP_TITLES
  .map((group) => ({ ...group, issues: props.issues.filter((issue) => issue.section === group.section) }))
  .filter((group) => group.issues.length > 0));
</script>

<style scoped>
.quality-intro { margin-top: 0; color: var(--ui-text-muted); font-size: var(--ui-font-sm); }
.quality-groups { display: flex; flex-direction: column; gap: var(--space-md); }
.quality-group__title { margin: 0 0 var(--space-2xs); color: var(--color-ink-2); font-size: var(--ui-font-sm); font-weight: 600; }
.quality-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.quality-list li { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-sm); }
.quality-dot { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; font-weight: 600; }
.quality-dot--warning { background: var(--color-warning-wash); color: var(--color-warning); }
.quality-dot--info { background: var(--color-paper-2); color: var(--color-muted); }
@media (max-width: 480px) { .quality-list li { grid-template-columns: 22px minmax(0, 1fr); } .quality-list li :deep(.el-button) { grid-column: 2; justify-self: start; } }
</style>
