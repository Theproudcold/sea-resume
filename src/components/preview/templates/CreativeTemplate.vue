<template>
  <div class="creative-template min-h-full bg-gradient-to-br from-purple-50 to-pink-50" :style="{
    '--margin-top': (data.theme?.moduleMargins?.top || 0) + 'px',
    '--margin-bottom': (data.theme?.moduleMargins?.bottom || 24) + 'px',
    '--margin-left': (data.theme?.moduleMargins?.left || 0) + 'px',
    '--margin-right': (data.theme?.moduleMargins?.right || 0) + 'px',
    padding: (data.theme?.pageMargins !== undefined ? data.theme.pageMargins : 24) + 'px',
    fontFamily: data.theme?.fontFamily || 'sans-serif',
    fontSize: (data.theme?.fontSize || 14) + 'px',
    lineHeight: data.theme?.lineHeight || 1.6,
    '--primary-color': data.theme?.color || '#9333ea'
  }">
    <!-- 创意头部 -->
    <div 
      class="header bg-white rounded-2xl shadow-lg p-8 mb-6 cursor-pointer hover:ring-2 hover:ring-pink-300 transition-all"
      @click="setActiveSection('basic')"
    >
      <div class="text-center">
        <div class="w-24 h-24 rounded-full mx-auto mb-4 overflow-hidden bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white text-3xl font-bold">
          <img v-if="data.basic.avatar" :src="data.basic.avatar" alt="头像" class="w-full h-full object-cover" />
          <span v-else>{{ (data.basic.name || 'U').charAt(0).toUpperCase() }}</span>
        </div>
        <h1 class="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
          {{ data.basic.name || '您的姓名' }}
        </h1>
        <div class="text-lg text-gray-700">{{ data.basic.title || '求职意向' }}</div>
        <div class="flex justify-center gap-4 mt-4 text-sm text-gray-600">
          <span v-if="data.basic.email">{{ data.basic.email }}</span>
          <span v-if="data.basic.phone">{{ data.basic.phone }}</span>
        </div>
        <ResumeSmartFields :data="data" class="justify-center mt-3" />
      </div>
    </div>

    <!-- 内容卡片 -->
    <div class="space-y-4">
      <!-- 个人简介 -->
      <div 
        v-if="data.basic.summary" 
        class="card bg-white rounded-xl shadow p-6 cursor-pointer hover:ring-2 hover:ring-pink-300 transition-all"
        @click="setActiveSection('basic')"
      >
        <h2 class="text-xl font-bold mb-3" style="color: var(--primary-color)">✨ 个人简介</h2>
        <div class="text-gray-700 rich-text" v-html="data.basic.summary"></div>
      </div>

      <!-- 动态排序模块 -->
      <draggable
        v-model="sortedSections"
        :item-key="(section: string) => section"
        :animation="200"
        handle=".card-header"
        group="resume-sections"
      >
        <template #item="{ element: section }">
          <div 
            class="section-item cursor-pointer hover:ring-2 hover:ring-pink-300 hover:ring-offset-2 rounded-xl transition-all"
            style="
              margin-top: var(--margin-top);
              margin-bottom: var(--margin-bottom);
              margin-left: var(--margin-left);
              margin-right: var(--margin-right);
            "
            @click.stop="setActiveSection(section)"
          >
            <!-- 工作经历 -->
            <div v-if="section === 'experience' && data.experiences.length > 0" class="card bg-white rounded-xl shadow p-6">
              <h2 class="card-header text-xl font-bold mb-4" style="color: var(--primary-color)">💼 工作经历</h2>
              <div class="space-y-4">
                <div v-for="exp in data.experiences" :key="exp.id" class="border-l-4 pl-4" style="border-color: var(--primary-color); opacity: 0.8">
                  <div class="flex justify-between items-start mb-1">
                    <h3 class="font-bold text-gray-900">{{ exp.company }}</h3>
                    <span class="text-xs text-gray-500">{{ formatDateRange(exp.startDate, exp.endDate) }}</span>
                  </div>
                  <div class="text-sm mb-1" style="color: var(--primary-color)">{{ exp.position }}</div>
                  <div class="text-sm text-gray-600 rich-text" v-html="exp.description"></div>
                </div>
              </div>
            </div>

            <!-- 项目经验 -->
            <div v-else-if="section === 'projects' && data.projects.length > 0" class="card bg-white rounded-xl shadow p-6">
              <h2 class="card-header text-xl font-bold mb-4" style="color: var(--primary-color)">🚀 项目经验</h2>
              <div class="space-y-4">
                <div v-for="project in data.projects" :key="project.id" class="border-l-4 pl-4" style="border-color: var(--primary-color); opacity: 0.8">
                  <div class="flex justify-between items-start mb-1">
                    <h3 class="font-bold text-gray-900">{{ project.name }}</h3>
                    <span class="text-xs text-gray-500">{{ formatDateRange(project.startDate, project.endDate) }}</span>
                  </div>
                  <div class="text-sm mb-1" style="color: var(--primary-color)">{{ project.role }}</div>
                  <div class="text-sm text-gray-600 rich-text" v-html="project.description"></div>
                  <div v-if="project.techStack && project.techStack.length" class="mt-2 flex flex-wrap gap-2">
                    <span
                      v-for="tech in project.techStack"
                      :key="tech"
                      class="px-2 py-1 rounded text-xs"
                      style="color: var(--primary-color); background: #fdf2f8; border: 1px solid var(--primary-color);"
                    >
                      {{ tech }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 教育背景 -->
            <div v-else-if="section === 'education' && data.education.length > 0" class="card bg-white rounded-xl shadow p-6">
              <h2 class="card-header text-xl font-bold mb-4" style="color: var(--primary-color)">🎓 教育背景</h2>
              <div class="space-y-3">
                <div v-for="edu in data.education" :key="edu.id" class="border-l-4 pl-4" style="border-color: var(--primary-color); opacity: 0.8">
                  <h3 class="font-bold text-gray-900">{{ edu.school }}</h3>
                  <div class="text-sm text-gray-700">{{ edu.degree }} · {{ edu.major }}</div>
                </div>
              </div>
            </div>

            <!-- 技能 -->
            <div v-else-if="section === 'skills' && data.skills.length > 0" class="card bg-white rounded-xl shadow p-6">
              <h2 class="card-header text-xl font-bold mb-4" style="color: var(--primary-color)">⭐ 专业技能</h2>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="skill in data.skills.flatMap(s => s.items)"
                  :key="skill"
                  class="px-3 py-1 rounded-full text-sm"
                  style="color: var(--primary-color); background: #fdf2f8; border: 1px solid var(--primary-color);"
                >
                  {{ skill }}
                </span>
              </div>
            </div>

            <!-- 自定义模块 -->
            <div v-else-if="isCustomBlock(section)" class="card bg-white rounded-xl shadow p-6">
              <h2 class="card-header text-xl font-bold mb-4" style="color: var(--primary-color)">
                📌 {{ getSectionTitle(section) }}
              </h2>
              <div v-if="Array.isArray(getCustomContent(section))" class="space-y-4">
                <div v-for="item in getCustomItems(section)" :key="item.id" class="border-l-4 pl-4" style="border-color: var(--primary-color); opacity: 0.8">
                  <div class="flex justify-between items-start mb-1">
                    <h3 v-if="item.title" class="font-bold text-gray-900">{{ item.title }}</h3>
                    <span v-if="item.date" class="text-xs text-gray-500">{{ item.date }}</span>
                  </div>
                  <div v-if="item.subtitle" class="text-sm mb-1" style="color: var(--primary-color)">{{ item.subtitle }}</div>
                  <div class="text-sm text-gray-600 rich-text" v-html="item.description"></div>
                </div>
              </div>
              <div v-else class="text-gray-700 rich-text" v-html="getCustomContent(section)"></div>
            </div>
          </div>
        </template>
      </draggable>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ResumeData } from '@/types/resume';
import ResumeSmartFields from '@/components/preview/ResumeSmartFields.vue';
import draggable from 'vuedraggable';
import { useResumeStore } from '@/stores/resume';

const props = defineProps<{
  data: ResumeData;
}>();

const formatDateRange = (start: string, end: string | 'present') => {
  const format = props.data.theme.dateFormat || 'YYYY.MM';
  const formatFn = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const y = date.getFullYear();
      const m = date.getMonth() + 1;
      const mm = m.toString().padStart(2, '0');
      const mmm = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
      switch (format) {
        case 'YYYY-MM': return `${y}-${mm}`;
        case 'YYYY/MM': return `${y}/${mm}`;
        case 'MM/YYYY': return `${mm}/${y}`;
        case 'MMM YYYY': return `${mmm} ${y}`;
        case 'YYYY.MM': default: return `${y}.${mm}`;
      }
    } catch { return dateStr; }
  };
  return `${formatFn(start)} - ${end === 'present' ? '至今' : formatFn(end)}`;
};

const resumeStore = useResumeStore();

const isSectionHidden = (id: string) => {
  return props.data.hiddenSections?.includes(id) || false;
};

const sortedSections = computed({
  get: () => {
    return (props.data.sectionOrder || []).filter(id => !isSectionHidden(id));
  },
  set: (val) => {
    const newOrder = [...val, ...(props.data.hiddenSections || [])];
    resumeStore.updateSectionOrder(Array.from(new Set(newOrder)));
  }
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

const getCustomItems = (id: string): import('@/types/resume').CustomItem[] => {
  const content = getCustomContent(id);
  return Array.isArray(content) ? content : [];
};

const setActiveSection = (id: string) => {
  resumeStore.setActiveSection(id);
};
</script>

<style scoped>
.creative-template {
  /* font-family via inline style */
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
