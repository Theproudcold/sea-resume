<template>
  <div
    v-if="hasFields"
    class="resume-smart-fields"
    :class="[
      `is-sep-${separator}`,
      `is-align-${align}`,
      { 'is-inline': inline },
    ]"
    aria-label="简历计算信息"
  >
    <span v-if="fields.age !== null" class="resume-smart-field">{{ fields.age }} 岁</span>
    <span v-if="fields.workExperience" class="resume-smart-field">工作经验 {{ fields.workExperience }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ResumeData } from '@/types/resume';
import { getResumeSmartFields } from '@/utils/resumeSmartFields';

const props = withDefaults(defineProps<{
  data: ResumeData;
  separator?: 'dot' | 'pipe' | 'none';
  align?: 'start' | 'center' | 'end';
  inline?: boolean;
}>(), {
  separator: 'dot',
  align: 'start',
  inline: false,
});

const fields = computed(() => getResumeSmartFields(props.data));
const hasFields = computed(() => fields.value.age !== null || Boolean(fields.value.workExperience));
</script>

<style scoped>
.resume-smart-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  color: inherit;
  font-size: inherit;
  line-height: inherit;
}

.resume-smart-fields.is-inline {
  display: inline-flex;
}

.resume-smart-fields.is-align-start {
  justify-content: flex-start;
}

.resume-smart-fields.is-align-center {
  justify-content: center;
}

.resume-smart-fields.is-align-end {
  justify-content: flex-end;
}

.resume-smart-fields.is-sep-none {
  gap: 4px 12px;
}

.resume-smart-fields.is-sep-dot,
.resume-smart-fields.is-sep-pipe {
  gap: 4px 0;
}

.resume-smart-field {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.resume-smart-fields.is-sep-dot .resume-smart-field + .resume-smart-field::before {
  content: '·';
  margin: 0 7px;
  opacity: 0.65;
}

.resume-smart-fields.is-sep-pipe .resume-smart-field + .resume-smart-field::before {
  content: '|';
  margin: 0 8px;
  opacity: 0.55;
}
</style>
