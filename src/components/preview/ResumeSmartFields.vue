<template>
  <div v-if="fields.age !== null || fields.workExperience" class="resume-smart-fields" aria-label="简历计算信息">
    <span v-if="fields.age !== null">{{ fields.age }} 岁</span>
    <span v-if="fields.workExperience">工作经验 {{ fields.workExperience }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ResumeData } from '@/types/resume';
import { getResumeSmartFields } from '@/utils/resumeSmartFields';

const props = defineProps<{ data: ResumeData }>();
const fields = computed(() => getResumeSmartFields(props.data));
</script>

<style scoped>
.resume-smart-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  color: inherit;
  font-size: 0.9em;
}
</style>
