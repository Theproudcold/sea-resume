<template>
  <div class="modern-template p-12">
    <!-- 基础信息 -->
    <header class="header mb-8">
      <h1 class="name text-4xl font-bold text-gray-900 mb-2">
        {{ data.basic.name || '您的姓名' }}
      </h1>
      <div class="title text-xl text-blue-600 mb-4">
        {{ data.basic.title || '求职意向' }}
      </div>
      <div class="contact-info flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600">
        <div v-if="data.basic.email" class="flex items-center gap-1">
          <span>📧</span>
          <span>{{ data.basic.email }}</span>
        </div>
        <div v-if="data.basic.phone" class="flex items-center gap-1">
          <span>📱</span>
          <span>{{ data.basic.phone }}</span>
        </div>
        <div v-if="data.basic.location" class="flex items-center gap-1">
          <span>📍</span>
          <span>{{ data.basic.location }}</span>
        </div>
        <div v-if="data.basic.website" class="flex items-center gap-1">
          <span>🌐</span>
          <span>{{ data.basic.website }}</span>
        </div>
      </div>
    </header>

    <el-divider />

    <!-- 个人简介 -->
    <section v-if="data.basic.summary" class="section mb-6">
      <h2 class="section-title text-xl font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <span class="w-1 h-6 bg-blue-600 rounded"></span>
        个人简介
      </h2>
      <p class="text-gray-700 leading-relaxed">{{ data.basic.summary }}</p>
    </section>

    <!-- 工作经历 -->
    <section v-if="data.experiences.length > 0" class="section mb-6">
      <h2 class="section-title text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <span class="w-1 h-6 bg-blue-600 rounded"></span>
        工作经历
      </h2>
      <div class="space-y-4">
        <div v-for="exp in data.experiences" :key="exp.id" class="experience-item">
          <div class="flex justify-between items-start mb-2">
            <div>
              <h3 class="font-semibold text-lg text-gray-900">{{ exp.company }}</h3>
              <div class="text-gray-700">{{ exp.position }}</div>
            </div>
            <div class="text-sm text-gray-500 whitespace-nowrap ml-4">
              {{ formatDateRange(exp.startDate, exp.endDate) }}
            </div>
          </div>
          <p class="text-gray-600 text-sm leading-relaxed">{{ exp.description }}</p>
          <ul v-if="exp.highlights && exp.highlights.length" class="mt-2 space-y-1">
            <li v-for="(highlight, idx) in exp.highlights" :key="idx" class="text-sm text-gray-600 pl-4">
              • {{ highlight }}
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 项目经验 -->
    <section v-if="data.projects.length > 0" class="section mb-6">
      <h2 class="section-title text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <span class="w-1 h-6 bg-blue-600 rounded"></span>
        项目经验
      </h2>
      <div class="space-y-4">
        <div v-for="project in data.projects" :key="project.id" class="project-item">
          <div class="flex justify-between items-start mb-2">
            <div>
              <h3 class="font-semibold text-lg text-gray-900">{{ project.name }}</h3>
              <div class="text-gray-700">{{ project.role }}</div>
            </div>
            <div class="text-sm text-gray-500 whitespace-nowrap ml-4">
              {{ formatDateRange(project.startDate, project.endDate) }}
            </div>
          </div>
          <p class="text-gray-600 text-sm leading-relaxed">{{ project.description }}</p>
          <div v-if="project.techStack && project.techStack.length" class="mt-2 flex flex-wrap gap-2">
            <span
              v-for="tech in project.techStack"
              :key="tech"
              class="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded"
            >
              {{ tech }}
            </span>
          </div>
          <div v-if="project.link" class="mt-2 text-sm text-blue-600">
            🔗 {{ project.link }}
          </div>
        </div>
      </div>
    </section>

    <!-- 教育背景 -->
    <section v-if="data.education.length > 0" class="section mb-6">
      <h2 class="section-title text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <span class="w-1 h-6 bg-blue-600 rounded"></span>
        教育背景
      </h2>
      <div class="space-y-3">
        <div v-for="edu in data.education" :key="edu.id" class="education-item">
          <div class="flex justify-between items-start">
            <div>
              <h3 class="font-semibold text-gray-900">{{ edu.school }}</h3>
              <div class="text-gray-700 text-sm">
                {{ edu.degree }} · {{ edu.major }}
                <span v-if="edu.gpa" class="ml-2 text-gray-600">GPA: {{ edu.gpa }}</span>
              </div>
            </div>
            <div class="text-sm text-gray-500 whitespace-nowrap ml-4">
              {{ formatDateRange(edu.startDate, edu.endDate) }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 技能 -->
    <section v-if="data.skills.length > 0" class="section mb-6">
      <h2 class="section-title text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <span class="w-1 h-6 bg-blue-600 rounded"></span>
        专业技能
      </h2>
      <div class="space-y-2">
        <div v-for="skill in data.skills" :key="skill.id" class="skill-item">
          <span class="font-medium text-gray-800">{{ skill.category }}:</span>
          <span class="text-gray-700 ml-2">{{ skill.items.join('、') }}</span>
        </div>
      </div>
    </section>
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
.modern-template {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  line-height: 1.6;
  color: #333;
}

.section {
  page-break-inside: avoid;
}

.experience-item,
.education-item,
.project-item {
  margin-bottom: 1rem;
  page-break-inside: avoid;
}

@media print {
  .modern-template {
    padding: 1.5rem;
  }
}
</style>
