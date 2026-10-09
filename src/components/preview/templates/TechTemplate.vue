<template>
  <div class="tech-template min-h-full bg-gray-900 text-gray-100" :style="{
    '--margin-top': (data.theme?.moduleMargins?.top || 0) + 'px',
    '--margin-bottom': (data.theme?.moduleMargins?.bottom || 24) + 'px',
    '--margin-left': (data.theme?.moduleMargins?.left || 0) + 'px',
    '--margin-right': (data.theme?.moduleMargins?.right || 0) + 'px',
    padding: (data.theme?.pageMargins !== undefined ? data.theme.pageMargins : 24) + 'px',
    fontFamily: data.theme?.fontFamily || 'monospace',
    fontSize: (data.theme?.fontSize || 14) + 'px',
    lineHeight: data.theme?.lineHeight || 1.6,
    '--primary-color': data.theme?.color || '#4ade80'
  }">
    <!-- 科技头部 -->
    <header 
      class="border-l-4 pl-6 mb-8 cursor-pointer hover:bg-gray-800 p-2 -m-2 rounded transition-colors"
      style="border-color: var(--primary-color)"
      @click="setActiveSection('basic')"
    >
      <img v-if="data.basic.avatar" :src="data.basic.avatar" alt="头像" class="w-20 h-20 rounded-full object-cover mb-4 border-2" style="border-color: var(--primary-color)" />
      <h1 class="text-4xl font-mono font-bold mb-2" style="color: var(--primary-color)">
        {{ data.basic.name || 'YOUR_NAME' }}
      </h1>
      <div class="text-lg text-green-300 font-mono">{{ data.basic.title || 'POSITION' }}</div>
      <div class="flex gap-4 mt-3 text-sm text-gray-400 font-mono">
        <span v-if="data.basic.email" class="flex items-center gap-1">
          <ContactIcon v-if="data.theme.displayIcons !== false" type="email" :icon="data.basic.iconOverrides?.email" /> {{ data.basic.email }}
        </span>
        <span v-if="data.basic.phone" class="flex items-center gap-1">
          <ContactIcon v-if="data.theme.displayIcons !== false" type="phone" :icon="data.basic.iconOverrides?.phone" /> {{ data.basic.phone }}
        </span>
        <span v-if="data.basic.location" class="flex items-center gap-1">
          <ContactIcon v-if="data.theme.displayIcons !== false" type="location" :icon="data.basic.iconOverrides?.location" /> {{ data.basic.location }}
        </span>
        <ResumeSmartFields :data="data" />
      </div>
    </header>

    <div class="space-y-6">
      <!-- 个人简介 -->
      <section 
        v-if="data.basic.summary"
        class="cursor-pointer hover:bg-gray-800 p-2 -m-2 rounded transition-colors"
        @click="setActiveSection('basic')"
      >
        <h2 class="font-mono text-sm mb-2" style="color: var(--primary-color)">// ABOUT</h2>
        <div class="text-gray-300 text-sm leading-relaxed pl-4 border-l border-gray-700 rich-text" v-html="data.basic.summary"></div>
      </section>

      <!-- 动态排序模块 -->
      <draggable
        v-model="sortedSections"
        :item-key="(section: string) => section"
        :animation="200"
        handle=".section-header"
        group="resume-sections"
      >
        <template #item="{ element: section }">
          <div 
            class="section-item cursor-pointer hover:ring-1 hover:ring-green-500 hover:ring-offset-2 hover:ring-offset-gray-900 rounded transition-all"
            style="
              margin-top: var(--margin-top);
              margin-bottom: var(--margin-bottom);
              margin-left: var(--margin-left);
              margin-right: var(--margin-right);
            "
            @click.stop="setActiveSection(section)"
          >
            <!-- 工作经历 -->
            <section v-if="section === 'experience' && data.experiences.length > 0">
              <h2 class="section-header font-mono text-sm mb-3" style="color: var(--primary-color)">// EXPERIENCE</h2>
              <div class="space-y-4 pl-4 border-l border-gray-700">
                <div v-for="exp in data.experiences" :key="exp.id">
                  <div class="flex justify-between items-start mb-1">
                    <h3 class="font-semibold text-white">{{ exp.company }}</h3>
                    <span class="text-xs font-mono" style="color: var(--primary-color)">{{ formatDateRange(exp.startDate, exp.endDate) }}</span>
                  </div>
                  <div class="text-sm mb-1" style="color: var(--primary-color); opacity: 0.8">{{ exp.position }}</div>
                  <div class="text-sm text-gray-400 rich-text" v-html="exp.description"></div>
                </div>
              </div>
            </section>

            <!-- 项目经验 -->
            <section v-else-if="section === 'projects' && data.projects.length > 0">
              <h2 class="section-header font-mono text-sm mb-3" style="color: var(--primary-color)">// PROJECTS</h2>
              <div class="space-y-4 pl-4 border-l border-gray-700">
                <div v-for="project in data.projects" :key="project.id">
                  <div class="flex justify-between items-start mb-1">
                    <h3 class="font-semibold text-white">{{ project.name }}</h3>
                    <span class="text-xs font-mono" style="color: var(--primary-color)">{{ formatDateRange(project.startDate, project.endDate) }}</span>
                  </div>
                  <div class="text-sm mb-1" style="color: var(--primary-color); opacity: 0.8">{{ project.role }}</div>
                  <div class="text-sm text-gray-400 rich-text" v-html="project.description"></div>
                  <div v-if="project.techStack && project.techStack.length" class="mt-2 flex flex-wrap gap-2">
                    <span
                      v-for="tech in project.techStack"
                      :key="tech"
                      class="px-2 py-1 bg-gray-800 text-xs font-mono rounded border"
                      style="color: var(--primary-color); border-color: var(--primary-color)"
                    >
                      {{ tech }}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <!-- 教育背景 -->
            <section v-else-if="section === 'education' && data.education.length > 0">
              <h2 class="section-header font-mono text-sm mb-3" style="color: var(--primary-color)">// EDUCATION</h2>
              <div class="space-y-3 pl-4 border-l border-gray-700">
                <div v-for="edu in data.education" :key="edu.id">
                  <div class="flex justify-between">
                    <div>
                      <h3 class="font-semibold text-white">{{ edu.school }}</h3>
                      <div class="text-sm text-gray-300">{{ edu.degree }} · {{ edu.major }}</div>
                    </div>
                    <span class="text-xs font-mono" style="color: var(--primary-color)">{{ formatDateRange(edu.startDate, edu.endDate) }}</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- 技能 -->
            <section v-else-if="section === 'skills' && data.skills.length > 0">
              <h2 class="section-header font-mono text-sm mb-3" style="color: var(--primary-color)">// SKILLS</h2>
              <div class="pl-4 border-l border-gray-700 space-y-2">
                <div v-for="skill in data.skills" :key="skill.id" class="text-sm">
                  <span class="font-mono" style="color: var(--primary-color); opacity: 0.8">const {{ skill.category.replace(/\s/g, '_') }} =</span>
                  <span class="text-gray-300"> [{{ skill.items.map(i => `"${i}"`).join(', ') }}]</span>
                </div>
              </div>
            </section>

            <!-- 自定义模块 -->
            <section v-else-if="isCustomBlock(section)">
              <h2 class="section-header font-mono text-sm mb-3" style="color: var(--primary-color)">
                // {{ getSectionTitle(section).toUpperCase() }}
              </h2>
              <div v-if="Array.isArray(getCustomContent(section))" class="pl-4 border-l border-gray-700 space-y-4">
                <div v-for="item in getCustomItems(section)" :key="item.id">
                  <div class="flex justify-between items-start mb-1">
                    <h3 v-if="item.title" class="font-semibold text-white">{{ item.title }}</h3>
                    <span v-if="item.date" class="text-xs font-mono" style="color: var(--primary-color)">{{ item.date }}</span>
                  </div>
                  <div v-if="item.subtitle" class="text-sm mb-1" style="color: var(--primary-color); opacity: 0.8">// {{ item.subtitle }}</div>
                  <div class="text-sm text-gray-400 rich-text" v-html="item.description"></div>
                </div>
              </div>
              <div v-else class="pl-4 border-l border-gray-700 text-gray-300 text-sm rich-text" v-html="getCustomContent(section)"></div>
            </section>
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
import ContactIcon from '@/components/common/ContactIcon.vue';
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
  return `${formatFn(start)} - ${end === 'present' ? 'PRESENT' : formatFn(end)}`;
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
.tech-template {
  /* font-family via inline style */
}

@media print {
  .tech-template {
    background: #1a1a1a;
    color: #e5e5e5;
  }
}
</style>
