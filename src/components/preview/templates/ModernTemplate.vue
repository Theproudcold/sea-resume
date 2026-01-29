<template>
  <div class="modern-template p-12" :style="{
    '--primary-color': data.theme?.color || '#2563eb',
    '--font-size': (data.theme?.fontSize || 14) + 'px',
    '--line-height': data.theme?.lineHeight || 1.6,
    '--spacing': (data.theme?.spacing || 24) + 'px'
  }">
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
      <div class="text-gray-700 leading-relaxed ql-editor px-0" v-html="data.basic.summary"></div>
    </section>

    <!-- 动态排序模块 -->
    <template v-for="section in sortedSections" :key="section">
      <!-- 个人简介 -->
      <section v-if="section === 'experience' && data.basic.summary" class="section mb-6">
        <!-- Note: Summary is usually part of basic info, but if treated as a section, handle here. 
             However, typically summary is fixed at top. Let's keep summary fixed at top? 
             Wait, the user wants Drag & Drop for SECTIONS. 
             Layout: Header -> Summary -> [Experience, Projects, Education, Skills] sorted.
        -->
      </section>

      <!-- 个人简介 (Fixed position or dynamic? Let's keep it fixed for now as it's part of basic info usually, 
           but if we want to sort it, we need to treat it as a section. 
           In the data structure, summary is in BasicInfo. 
           Let's assume Body Sections are: Experience, Projects, Education, Skills. 
      -->

      <!-- 工作经历 -->
      <section v-if="section === 'experience' && data.experiences.length > 0" class="section mb-6">
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
            <div class="text-gray-600 text-sm leading-relaxed ql-editor px-0" v-html="exp.description"></div>
          </div>
        </div>
      </section>

      <!-- 项目经验 -->
      <section v-if="section === 'projects' && data.projects.length > 0" class="section mb-6">
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
            <div class="text-gray-600 text-sm leading-relaxed ql-editor px-0" v-html="project.description"></div>
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
      <section v-if="section === 'education' && data.education.length > 0" class="section mb-6">
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
      <section v-if="section === 'skills' && data.skills.length > 0" class="section mb-6">
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ResumeData } from '@/types/resume';
import { formatDateRange } from '@/utils/helpers';
import '@vueup/vue-quill/dist/vue-quill.snow.css'; // For basic content styles

const props = defineProps<{
  data: ResumeData;
}>();

const sortedSections = computed(() => {
  return props.data.sectionOrder || ['experience', 'projects', 'education', 'skills'];
});
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
