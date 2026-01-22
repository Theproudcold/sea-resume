<template>
  <div class="professional-template p-12">
    <!-- 双栏布局 -->
    <div class="grid grid-cols-3 gap-8">
      <!-- 左侧栏 -->
      <div class="col-span-1 space-y-6">
        <!-- 基础信息 -->
        <div>
          <h1 class="text-2xl font-bold text-gray-900 mb-1">{{ data.basic.name || '您的姓名' }}</h1>
          <div class="text-sm text-gray-600">{{ data.basic.title || '求职意向' }}</div>
        </div>

        <div class="border-t border-gray-300 pt-4">
          <h2 class="text-sm font-bold text-gray-800 mb-3">联系方式</h2>
          <div class="space-y-2 text-xs text-gray-700">
            <div v-if="data.basic.email">{{ data.basic.email }}</div>
            <div v-if="data.basic.phone">{{ data.basic.phone }}</div>
            <div v-if="data.basic.location">{{ data.basic.location }}</div>
          </div>
        </div>

        <!-- 技能 -->
        <div v-if="data.skills.length > 0" class="border-t border-gray-300 pt-4">
          <h2 class="text-sm font-bold text-gray-800 mb-3">专业技能</h2>
          <div class="space-y-2">
            <div v-for="skill in data.skills" :key="skill.id" class="text-xs">
              <div class="font-semibold text-gray-800">{{ skill.category }}</div>
              <div class="text-gray-600">{{ skill.items.join(', ') }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧主内容区 -->
      <div class="col-span-2 space-y-6">
        <!-- 个人简介 -->
        <div v-if="data.basic.summary">
          <h2 class="text-lg font-bold text-gray-900 mb-2 border-b-2 border-gray-900 pb-1">个人简介</h2>
          <p class="text-sm text-gray-700">{{ data.basic.summary }}</p>
        </div>

        <!-- 工作经历 -->
        <div v-if="data.experiences.length > 0">
          <h2 class="text-lg font-bold text-gray-900 mb-3 border-b-2 border-gray-900 pb-1">工作经历</h2>
          <div class="space-y-4">
            <div v-for="exp in data.experiences" :key="exp.id">
              <div class="flex justify-between mb-1">
                <h3 class="font-bold text-gray-900">{{ exp.company }}</h3>
                <span class="text-xs text-gray-600">{{ formatDateRange(exp.startDate, exp.endDate) }}</span>
              </div>
              <div class="text-sm text-gray-700 mb-1">{{ exp.position }}</div>
              <p class="text-xs text-gray-600">{{ exp.description }}</p>
            </div>
          </div>
        </div>

        <!-- 项目经验 -->
        <div v-if="data.projects.length > 0">
          <h2 class="text-lg font-bold text-gray-900 mb-3 border-b-2 border-gray-900 pb-1">项目经验</h2>
          <div class="space-y-4">
            <div v-for="project in data.projects" :key="project.id">
              <div class="flex justify-between mb-1">
                <h3 class="font-bold text-gray-900">{{ project.name }}</h3>
                <span class="text-xs text-gray-600">{{ formatDateRange(project.startDate, project.endDate) }}</span>
              </div>
              <div class="text-sm text-gray-700 mb-1">{{ project.role }}</div>
              <p class="text-xs text-gray-600">{{ project.description }}</p>
              <div v-if="project.techStack && project.techStack.length" class="mt-1 flex flex-wrap gap-1">
                <span v-for="tech in project.techStack" :key="tech" class="text-xs text-gray-600">{{ tech }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 教育背景 -->
        <div v-if="data.education.length > 0">
          <h2 class="text-lg font-bold text-gray-900 mb-3 border-b-2 border-gray-900 pb-1">教育背景</h2>
          <div class="space-y-3">
            <div v-for="edu in data.education" :key="edu.id">
              <div class="flex justify-between">
                <div>
                  <h3 class="font-bold text-gray-900">{{ edu.school }}</h3>
                  <div class="text-sm text-gray-700">{{ edu.degree }} · {{ edu.major }}</div>
                </div>
                <span class="text-xs text-gray-600">{{ formatDateRange(edu.startDate, edu.endDate) }}</span>
              </div>
            </div>
          </div>
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
.professional-template {
  font-family: 'Georgia', serif;
  color: #1a1a1a;
}
</style>
