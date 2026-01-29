<template>
  <div class="minimal-template" :style="{
    padding: (data.theme?.spacing || 24) + 'px',
    fontSize: (data.theme?.fontSize || 14) + 'px',
    lineHeight: data.theme?.lineHeight || 1.6,
    '--primary-color': data.theme?.color || '#000000'
  }">
    <!-- 极简头部 -->
    <header 
      class="text-center mb-12 pb-8 border-b border-black cursor-pointer hover:bg-gray-50 transition-colors rounded p-4 -m-4"
      @click="setActiveSection('basic')"
    >
      <h1 class="text-5xl font-light tracking-wide mb-4">{{ data.basic.name || '您的姓名' }}</h1>
      <div class="text-sm tracking-widest uppercase text-gray-700">{{ data.basic.title || '求职意向' }}</div>
    </header>

    <!-- 联系方式 -->
    <div class="text-center text-xs tracking-wide mb-12 space-x-6">
      <span v-if="data.basic.email">{{ data.basic.email }}</span>
      <span v-if="data.basic.phone">{{ data.basic.phone }}</span>
      <span v-if="data.basic.location">{{ data.basic.location }}</span>
    </div>

    <!-- 简介 -->
    <section 
      v-if="data.basic.summary" 
      class="mb-12 cursor-pointer hover:bg-gray-50 transition-colors rounded p-4 -m-4"
      @click="setActiveSection('basic')"
    >
      <div class="text-center text-sm leading-loose text-gray-800 max-w-2xl mx-auto rich-text" v-html="data.basic.summary"></div>
    </section>

    <!-- 动态排序模块 -->
    <draggable
      v-model="sortedSections"
      :item-key="section => section"
      :animation="200"
      handle=".section-header"
      group="resume-sections"
    >
      <template #item="{ element: section }">
        <div 
          class="section-item cursor-pointer hover:bg-gray-50 rounded transition-all mb-12 p-2 -m-2"
          @click.stop="setActiveSection(section)"
        >
          <!-- 工作经历 -->
          <section v-if="section === 'experience' && data.experiences.length > 0">
            <h2 class="section-header text-xs tracking-widest uppercase text-center mb-8 font-semibold">Experience</h2>
            <div class="space-y-8">
              <div v-for="exp in data.experiences" :key="exp.id" class="text-center">
                <h3 class="font-semibold text-lg mb-1">{{ exp.company }}</h3>
                <div class="text-sm text-gray-600 mb-1">{{ exp.position }}</div>
                <div class="text-xs text-gray-500 mb-3">{{ formatDateRange(exp.startDate, exp.endDate) }}</div>
                <div class="text-sm text-gray-700 max-w-2xl mx-auto rich-text" v-html="exp.description"></div>
              </div>
            </div>
          </section>

          <!-- 项目经验 -->
          <section v-else-if="section === 'projects' && data.projects.length > 0">
            <h2 class="section-header text-xs tracking-widest uppercase text-center mb-8 font-semibold">Projects</h2>
            <div class="space-y-8">
              <div v-for="project in data.projects" :key="project.id" class="text-center">
                <h3 class="font-semibold text-lg mb-1">{{ project.name }}</h3>
                <div class="text-sm text-gray-600 mb-1">{{ project.role }}</div>
                <div class="text-xs text-gray-500 mb-3">{{ formatDateRange(project.startDate, project.endDate) }}</div>
                <div class="text-sm text-gray-700 max-w-2xl mx-auto rich-text" v-html="project.description"></div>
                <div v-if="project.techStack && project.techStack.length" class="mt-2 text-xs text-gray-500">
                  {{ project.techStack.join(' · ') }}
                </div>
              </div>
            </div>
          </section>

          <!-- 教育背景 -->
          <section v-else-if="section === 'education' && data.education.length > 0">
            <h2 class="section-header text-xs tracking-widest uppercase text-center mb-8 font-semibold">Education</h2>
            <div class="space-y-6">
              <div v-for="edu in data.education" :key="edu.id" class="text-center">
                <h3 class="font-semibold">{{ edu.school }}</h3>
                <div class="text-sm text-gray-600">{{ edu.degree }} · {{ edu.major }}</div>
                <div class="text-xs text-gray-500">{{ formatDateRange(edu.startDate, edu.endDate) }}</div>
              </div>
            </div>
          </section>

          <!-- 技能 -->
          <section v-else-if="section === 'skills' && data.skills.length > 0">
            <h2 class="section-header text-xs tracking-widest uppercase text-center mb-8 font-semibold">Skills</h2>
            <div class="text-center space-y-2">
              <div v-for="skill in data.skills" :key="skill.id" class="text-sm">
                <span class="font-medium">{{ skill.category }}</span>
                <span class="text-gray-600"> · {{ skill.items.join(' · ') }}</span>
              </div>
            </div>
          </section>

          <!-- 自定义模块 -->
          <section v-else-if="isCustomBlock(section)">
            <h2 class="section-header text-xs tracking-widest uppercase text-center mb-8 font-semibold">
              {{ getSectionTitle(section) }}
            </h2>
             <div class="text-center text-sm leading-loose text-gray-800 max-w-2xl mx-auto rich-text" v-html="getCustomContent(section)"></div>
          </section>
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ResumeData } from '@/types/resume';
import { formatDateRange } from '@/utils/helpers';
import draggable from 'vuedraggable';
import { useResumeStore } from '@/stores/resume';

const props = defineProps<{
  data: ResumeData;
}>();

const resumeStore = useResumeStore();

const sortedSections = computed({
  get: () => props.data.sectionOrder || [],
  set: (val) => resumeStore.updateSectionOrder(val)
});

const isCustomBlock = (id: string) => {
  return !['experience', 'projects', 'education', 'skills'].includes(id);
};

const getSectionTitle = (id: string) => {
  const block = props.data.customBlocks.find(b => b.id === id);
  return block ? block.title : '';
};

const getCustomContent = (id: string) => {
  const block = props.data.customBlocks.find(b => b.id === id);
  return block ? block.content : '';
};

const setActiveSection = (id: string) => {
  resumeStore.setActiveSection(id);
};
</script>

<style scoped>
.minimal-template {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  color: #000;
  background: #fff;
}

section {
  page-break-inside: avoid;
}
</style>
