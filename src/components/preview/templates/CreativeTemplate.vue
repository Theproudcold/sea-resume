<template>
  <div class="creative-template p-10 bg-gradient-to-br from-purple-50 to-pink-50">
    <!-- 创意头部 -->
    <div class="header bg-white rounded-2xl shadow-lg p-8 mb-6">
      <div class="text-center">
        <div class="w-24 h-24 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 mx-auto mb-4 flex items-center justify-center text-white text-3xl font-bold">
          {{ (data.basic.name || 'U').charAt(0).toUpperCase() }}
        </div>
        <h1 class="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
          {{ data.basic.name || '您的姓名' }}
        </h1>
        <div class="text-lg text-gray-700">{{ data.basic.title || '求职意向' }}</div>
        <div class="flex justify-center gap-4 mt-4 text-sm text-gray-600">
          <span v-if="data.basic.email">{{ data.basic.email }}</span>
          <span v-if="data.basic.phone">{{ data.basic.phone }}</span>
        </div>
      </div>
    </div>

    <!-- 内容卡片 -->
    <div class="space-y-4">
      <!-- 个人简介 -->
      <div v-if="data.basic.summary" class="card bg-white rounded-xl shadow p-6">
        <h2 class="text-xl font-bold text-purple-600 mb-3">✨ 个人简介</h2>
        <p class="text-gray-700">{{ data.basic.summary }}</p>
      </div>

      <!-- 工作经历 -->
      <div v-if="data.experiences.length > 0" class="card bg-white rounded-xl shadow p-6">
        <h2 class="text-xl font-bold text-purple-600 mb-4">💼 工作经历</h2>
        <div class="space-y-4">
          <div v-for="exp in data.experiences" :key="exp.id" class="border-l-4 border-purple-400 pl-4">
            <div class="flex justify-between items-start mb-1">
              <h3 class="font-bold text-gray-900">{{ exp.company }}</h3>
              <span class="text-xs text-gray-500">{{ formatDateRange(exp.startDate, exp.endDate) }}</span>
            </div>
            <div class="text-sm text-purple-600 mb-1">{{ exp.position }}</div>
            <p class="text-sm text-gray-600">{{ exp.description }}</p>
          </div>
        </div>
      </div>

      <!-- 项目经验 -->
      <div v-if="data.projects.length > 0" class="card bg-white rounded-xl shadow p-6">
        <h2 class="text-xl font-bold text-purple-600 mb-4">🚀 项目经验</h2>
        <div class="space-y-4">
          <div v-for="project in data.projects" :key="project.id" class="border-l-4 border-pink-400 pl-4">
            <div class="flex justify-between items-start mb-1">
              <h3 class="font-bold text-gray-900">{{ project.name }}</h3>
              <span class="text-xs text-gray-500">{{ formatDateRange(project.startDate, project.endDate) }}</span>
            </div>
            <div class="text-sm text-purple-600 mb-1">{{ project.role }}</div>
            <p class="text-sm text-gray-600">{{ project.description }}</p>
            <div v-if="project.techStack && project.techStack.length" class="mt-2 flex flex-wrap gap-2">
              <span
                v-for="tech in project.techStack"
                :key="tech"
                class="px-2 py-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded text-xs"
              >
                {{ tech }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 教育背景 -->
      <div v-if="data.education.length > 0" class="card bg-white rounded-xl shadow p-6">
        <h2 class="text-xl font-bold text-purple-600 mb-4">🎓 教育背景</h2>
        <div class="space-y-3">
          <div v-for="edu in data.education" :key="edu.id" class="border-l-4 border-pink-400 pl-4">
            <h3 class="font-bold text-gray-900">{{ edu.school }}</h3>
            <div class="text-sm text-gray-700">{{ edu.degree }} · {{ edu.major }}</div>
          </div>
        </div>
      </div>

      <!-- 技能 -->
      <div v-if="data.skills.length > 0" class="card bg-white rounded-xl shadow p-6">
        <h2 class="text-xl font-bold text-purple-600 mb-4">⭐ 专业技能</h2>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="skill in data.skills.flatMap(s => s.items)"
            :key="skill"
            class="px-3 py-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded-full text-sm"
          >
            {{ skill }}
          </span>
        </div>
      </div>
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
.creative-template {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.card {
  transition: transform 0.2s;
}

@media print {
  .creative-template {
    background: white;
  }
}
</style>
