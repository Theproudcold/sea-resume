<template>
  <el-dialog
    :model-value="modelValue"
    title="简历质量检查"
    width="min(600px, calc(100vw - 32px))"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <p class="quality-intro">检查只提供内容完整性建议，不会自动修改简历。</p>
    <el-empty v-if="!issues.length" description="未发现基础完整性问题。" />
    <ul v-else class="quality-list" aria-label="检查结果">
      <li v-for="issue in issues" :key="issue.id">
        <span class="quality-dot" aria-hidden="true">!</span>
        <span>{{ issue.message }}</span>
        <el-button link type="primary" @click="$emit('navigate', issue.section)">去编辑</el-button>
      </li>
    </ul>
  </el-dialog>
</template>

<script setup lang="ts">
import type { ResumeQualityIssue } from '@/utils/resumeQuality';
defineProps<{ modelValue: boolean; issues: ResumeQualityIssue[] }>();
defineEmits<{ 'update:modelValue': [value: boolean]; navigate: [section: ResumeQualityIssue['section']] }>();
</script>

<style scoped>
.quality-intro { margin-top: 0; color: var(--ui-text-muted); font-size: var(--ui-font-sm); }
.quality-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.quality-list li { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-sm); }
.quality-dot { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--ui-warning) 14%, white); color: var(--ui-warning); font-weight: 700; }
@media (max-width: 480px) { .quality-list li { grid-template-columns: 22px minmax(0, 1fr); } .quality-list li :deep(.el-button) { grid-column: 2; justify-self: start; } }
</style>
