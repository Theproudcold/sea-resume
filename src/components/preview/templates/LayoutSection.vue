<template>
  <section v-if="visible" class="layout-section" :data-section="id" @click.stop="emit('activate', id)">
    <h2 class="section-title" :class="`heading-${heading}`">{{ title }}</h2>

    <div v-if="id === 'experience'" class="entries">
      <article v-for="item in visibleExperiences" :key="item.id">
        <div class="entry">
          <div><strong>{{ item.company }}</strong><p>{{ item.position }}</p></div>
          <span class="when">{{ formatResumeDateRange(item.startDate, item.endDate, dateFormat) }}</span>
        </div>
        <div v-if="item.description" class="rich-text" v-html="item.description" />
        <ul v-if="item.highlights?.length"><li v-for="(line, index) in item.highlights" :key="index">{{ line }}</li></ul>
      </article>
    </div>

    <div v-else-if="id === 'projects'" class="entries">
      <article v-for="item in visibleProjects" :key="item.id">
        <div class="entry">
          <div><strong>{{ item.name }}</strong><p>{{ item.role }}</p></div>
          <span class="when">{{ formatResumeDateRange(item.startDate, item.endDate, dateFormat) }}</span>
        </div>
        <div v-if="item.description" class="rich-text" v-html="item.description" />
      </article>
    </div>

    <div v-else-if="id === 'education'" class="entries">
      <article v-for="item in visibleEducation" :key="item.id">
        <div class="entry">
          <div><strong>{{ item.school }}</strong><p>{{ item.degree }} · {{ item.major }}<template v-if="item.gpa"> · {{ item.gpa }}</template></p></div>
          <span class="when">{{ formatResumeDateRange(item.startDate, item.endDate, dateFormat) }}</span>
        </div>
      </article>
    </div>

    <div v-else-if="id === 'skills'" class="entries">
      <p v-for="item in visibleSkills" :key="item.id"><strong>{{ item.category }}：</strong>{{ item.items.join('、') }}</p>
    </div>

    <div v-else-if="customBlock" class="entries">
      <div v-if="Array.isArray(customBlock.content)">
        <article v-for="item in customItems" :key="item.id">
          <div class="entry"><div><strong>{{ item.title }}</strong><p v-if="item.subtitle">{{ item.subtitle }}</p></div><span v-if="item.date" class="when">{{ item.date }}</span></div>
          <div v-if="item.description" class="rich-text" v-html="item.description" />
        </article>
      </div>
      <div v-else class="rich-text" v-html="customBlock.content" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { HeadingStyle } from '@/types/layout-template';
import type { ResumeData } from '@/types/resume';
import { formatResumeDateRange } from '@/utils/pdf/dateFormat';

const props = defineProps<{ id: string; data: ResumeData; heading: HeadingStyle }>();
const emit = defineEmits<{ activate: [id: string] }>();
const dateFormat = computed(() => props.data.theme?.dateFormat || 'YYYY.MM');
const visibleExperiences = computed(() => props.data.experiences.filter((item) => item.visible !== false));
const visibleProjects = computed(() => props.data.projects.filter((item) => item.visible !== false));
const visibleEducation = computed(() => props.data.education.filter((item) => item.visible !== false));
const visibleSkills = computed(() => props.data.skills.filter((item) => item.visible !== false));
const customBlock = computed(() => props.data.customBlocks.find((block) => block.id === props.id));
const customItems = computed(() => Array.isArray(customBlock.value?.content) ? customBlock.value.content.filter((item) => item.visible !== false) : []);
const defaults: Record<string, string> = { experience: '工作经历', projects: '项目经验', education: '教育背景', skills: '技能证书' };
const title = computed(() => props.data.sectionTitles?.[props.id] || customBlock.value?.title || defaults[props.id] || props.id);
const visible = computed(() => {
  if (props.id === 'experience') return visibleExperiences.value.length > 0;
  if (props.id === 'projects') return visibleProjects.value.length > 0;
  if (props.id === 'education') return visibleEducation.value.length > 0;
  if (props.id === 'skills') return visibleSkills.value.length > 0;
  if (!customBlock.value) return false;
  return !Array.isArray(customBlock.value.content) || customItems.value.length > 0;
});
</script>
