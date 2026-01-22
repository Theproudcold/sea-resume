<template>
  <div class="tech-template p-10 bg-gray-900 text-gray-100">
    <!-- 科技头部 -->
    <header class="border-l-4 border-green-500 pl-6 mb-8">
      <h1 class="text-4xl font-mono font-bold text-green-400 mb-2">
        {{ data.basic.name || 'YOUR_NAME' }}
      </h1>
      <div class="text-lg text-green-300 font-mono">{{ data.basic.title || 'POSITION' }}</div>
      <div class="flex gap-4 mt-3 text-sm text-gray-400 font-mono">
        <span v-if="data.basic.email">📧 {{ data.basic.email }}</span>
        <span v-if="data.basic.phone">📱 {{ data.basic.phone }}</span>
        <span v-if="data.basic.location">📍 {{ data.basic.location }}</span>
      </div>
    </header>

    <div class="space-y-6">
      <!-- 个人简介 -->
      <section v-if="data.basic.summary">
        <h2 class="text-green-400 font-mono text-sm mb-2">// ABOUT</h2>
        <p class="text-gray-300 text-sm leading-relaxed pl-4 border-l border-gray-700">
          {{ data.basic.summary }}
        </p>
      </section>

      <!-- 工作经历 -->
      <section v-if="data.experiences.length > 0">
        <h2 class="text-green-400 font-mono text-sm mb-3">// EXPERIENCE</h2>
        <div class="space-y-4 pl-4 border-l border-gray-700">
          <div v-for="exp in data.experiences" :key="exp.id">
            <div class="flex justify-between items-start mb-1">
              <h3 class="font-semibold text-white">{{ exp.company }}</h3>
              <span class="text-xs text-green-400 font-mono">{{ formatDateRange(exp.startDate, exp.endDate) }}</span>
            </div>
            <div class="text-sm text-green-300 mb-1">{{ exp.position }}</div>
            <p class="text-sm text-gray-400">{{ exp.description }}</p>
          </div>
        </div>
      </section>

      <!-- 项目经验 -->
      <section v-if="data.projects.length > 0">
        <h2 class="text-green-400 font-mono text-sm mb-3">// PROJECTS</h2>
        <div class="space-y-4 pl-4 border-l border-gray-700">
          <div v-for="project in data.projects" :key="project.id">
            <div class="flex justify-between items-start mb-1">
              <h3 class="font-semibold text-white">{{ project.name }}</h3>
              <span class="text-xs text-green-400 font-mono">{{ formatDateRange(project.startDate, project.endDate) }}</span>
            </div>
            <div class="text-sm text-green-300 mb-1">{{ project.role }}</div>
            <p class="text-sm text-gray-400">{{ project.description }}</p>
            <div v-if="project.techStack && project.techStack.length" class="mt-2 flex flex-wrap gap-2">
              <span
                v-for="tech in project.techStack"
                :key="tech"
                class="px-2 py-1 bg-gray-800 text-green-400 text-xs font-mono rounded border border-green-500"
              >
                {{ tech }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- 教育背景 -->
      <section v-if="data.education.length > 0">
        <h2 class="text-green-400 font-mono text-sm mb-3">// EDUCATION</h2>
        <div class="space-y-3 pl-4 border-l border-gray-700">
          <div v-for="edu in data.education" :key="edu.id">
            <div class="flex justify-between">
              <div>
                <h3 class="font-semibold text-white">{{ edu.school }}</h3>
                <div class="text-sm text-gray-300">{{ edu.degree }} · {{ edu.major }}</div>
              </div>
              <span class="text-xs text-green-400 font-mono">{{ formatDateRange(edu.startDate, edu.endDate) }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 技能 -->
      <section v-if="data.skills.length > 0">
        <h2 class="text-green-400 font-mono text-sm mb-3">// SKILLS</h2>
        <div class="pl-4 border-l border-gray-700 space-y-2">
          <div v-for="skill in data.skills" :key="skill.id" class="text-sm">
            <span class="text-green-300 font-mono">const {{ skill.category.replace(/\s/g, '_') }} =</span>
            <span class="text-gray-300"> [{{ skill.items.map(i => `"${i}"`).join(', ') }}]</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ResumeData } from '@/types/resume';
import { formatDateRange } from '@/utils/helpers';

defineProps<{
  data: ResumeData;
}>();
</script>

<style scoped>
.tech-template {
  font-family: 'Courier New', 'Monaco', monospace;
}

@media print {
  .tech-template {
    background: #1a1a1a;
    color: #e5e5e5;
  }
}
</style>
