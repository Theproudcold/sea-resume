<template>
  <div class="creative-template min-h-full" :style="{
    '--margin-top': (data.theme?.moduleMargins?.top || 0) + 'px',
    '--margin-bottom': (data.theme?.moduleMargins?.bottom || 24) + 'px',
    '--margin-left': (data.theme?.moduleMargins?.left || 0) + 'px',
    '--margin-right': (data.theme?.moduleMargins?.right || 0) + 'px',
    padding: (data.theme?.pageMargins !== undefined ? data.theme.pageMargins : 24) + 'px',
    fontFamily: data.theme?.fontFamily || 'var(--resume-font-family)',
    fontSize: (data.theme?.fontSize || 14) + 'px',
    lineHeight: data.theme?.lineHeight || 1.6,
    '--primary-color': data.theme?.color || '#a84d3d'
  }">
    <!-- 创意头部 -->
    <div 
      class="creative-banner cursor-pointer"
      @click="setActiveSection('basic')"
    >
      <div class="text-center">
        <div class="creative-avatar">
          <img v-if="data.basic.avatar" :src="data.basic.avatar" alt="头像" class="w-full h-full object-cover" />
          <span v-else>{{ (data.basic.name || 'U').charAt(0).toUpperCase() }}</span>
        </div>
        <h1 class="creative-name">
          {{ data.basic.name || '您的姓名' }}
        </h1>
        <div class="creative-role">{{ data.basic.title || '求职意向' }}</div>
        <div class="flex justify-center gap-4 mt-4 text-sm text-gray-600">
          <span v-if="data.basic.email">{{ data.basic.email }}</span>
          <span v-if="data.basic.phone">{{ data.basic.phone }}</span>
          <span
            v-for="contact in data.basic.customContacts?.filter((item) => item.label || item.value) || []"
            :key="contact.id"
            class="inline-flex max-w-full items-center gap-1"
          >
            <ContactIcon v-if="data.theme?.displayIcons !== false" type="custom" :icon="contact.icon" />
            <span class="truncate"><span v-if="contact.label">{{ contact.label }}：</span>{{ contact.value }}</span>
          </span>
        </div>
        <ResumeSmartFields :data="data" class="justify-center mt-3" />
      </div>
    </div>

    <!-- 内容卡片 -->
    <div class="space-y-4">
      <!-- 个人简介 -->
      <div 
        v-if="data.basic.summary" 
        class="card cursor-pointer"
        @click="setActiveSection('basic')"
      >
        <h2 class="card-title">个人简介</h2>
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
            class="section-item cursor-pointer"
            style="
              margin-top: var(--margin-top);
              margin-bottom: var(--margin-bottom);
              margin-left: var(--margin-left);
              margin-right: var(--margin-right);
            "
            @click.stop="setActiveSection(section)"
          >
            <!-- 工作经历 -->
            <div v-if="section === 'experience' && data.experiences.some(exp => exp.visible !== false)" class="card">
              <h2 class="card-header card-title">{{ data.sectionTitles?.experience || '工作经历' }}</h2>
              <div class="space-y-4">
                <div v-for="exp in data.experiences.filter(exp => exp.visible !== false)" :key="exp.id" class="creative-entry">
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
            <div v-else-if="section === 'projects' && data.projects.some(project => project.visible !== false)" class="card">
              <h2 class="card-header card-title">{{ data.sectionTitles?.projects || '项目经验' }}</h2>
              <div class="space-y-4">
                <div v-for="project in data.projects.filter(project => project.visible !== false)" :key="project.id" class="creative-entry">
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
                      class="creative-chip"
                    >
                      {{ tech }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 教育背景 -->
            <div v-else-if="section === 'education' && data.education.some(edu => edu.visible !== false)" class="card">
              <h2 class="card-header card-title">{{ data.sectionTitles?.education || '教育背景' }}</h2>
              <div class="space-y-3">
                <div v-for="edu in data.education.filter(edu => edu.visible !== false)" :key="edu.id" class="creative-entry">
                  <h3 class="font-bold text-gray-900">{{ edu.school }}</h3>
                  <div class="text-sm text-gray-700">{{ edu.degree }} · {{ edu.major }}</div>
                </div>
              </div>
            </div>

            <!-- 技能 -->
            <div v-else-if="section === 'skills' && data.skills.some(skill => skill.visible !== false)" class="card">
              <h2 class="card-header card-title">{{ data.sectionTitles?.skills || '专业技能' }}</h2>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="skill in data.skills.filter(skill => skill.visible !== false).flatMap(s => s.items)"
                  :key="skill"
                  class="creative-chip"
                >
                  {{ skill }}
                </span>
              </div>
            </div>

            <!-- 自定义模块 -->
            <div v-else-if="isCustomBlock(section)" class="card">
              <h2 class="card-header card-title">
                {{ getSectionTitle(section) }}
              </h2>
              <div v-if="Array.isArray(getCustomContent(section))" class="space-y-4">
                <div v-for="item in getCustomItems(section)" :key="item.id" class="creative-entry">
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
import ContactIcon from '@/components/common/ContactIcon.vue';
import draggable from 'vuedraggable';
import { useResumeStore } from '@/stores/resume';

const props = defineProps<{
  data: ResumeData;
}>();

const formatDateRange = (start: string, end: string | 'present') => {
  const format = props.data.theme?.dateFormat || 'YYYY.MM';
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
  if (['experience', 'projects', 'education', 'skills'].includes(id)) return false;
  const block = props.data.customBlocks.find(b => b.id === id);
  if (!block) return false;
  return !Array.isArray(block.content) || block.content.length === 0 || block.content.some(item => item.visible !== false);
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
  return Array.isArray(content) ? content.filter(item => item.visible !== false) : [];
};

const setActiveSection = (id: string) => {
  resumeStore.setActiveSection(id);
};
</script>

<style scoped>
.creative-template {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--primary-color) 8%, var(--resume-paper)), var(--resume-paper) 168px);
  color: var(--resume-ink);
}

.creative-banner {
  margin-bottom: 1rem;
  padding: 1.2rem 1.15rem 1.05rem;
  border-radius: 16px;
  background: var(--primary-color);
  color: #fff;
}

.creative-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.4rem;
  height: 4.4rem;
  margin: 0 auto 0.7rem;
  overflow: hidden;
  border: 2px solid rgb(255 255 255 / 72%);
  border-radius: 999px;
  background: rgb(255 255 255 / 16%);
  font-size: 1.5rem;
  font-weight: 700;
}

.creative-name {
  margin: 0;
  font-size: 1.75em;
  font-weight: 700;
  letter-spacing: 0.03em;
  line-height: 1.15;
}

.creative-role {
  margin-top: 0.28rem;
  color: rgb(255 255 255 / 86%);
}

.creative-banner :deep(span),
.creative-banner :deep(a) {
  color: rgb(255 255 255 / 88%);
}

.card {
  margin-bottom: 0.7rem;
  padding: 0.95rem 1.05rem 1rem;
  border: 1px solid color-mix(in srgb, var(--primary-color) 18%, var(--resume-rule));
  border-radius: 14px;
  background: var(--resume-sheet);
}

.card-title {
  margin: 0 0 0.65rem;
  color: var(--primary-color);
  font-size: 1.02em;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.creative-entry {
  padding-left: 0.75rem;
  border-left: 2px solid color-mix(in srgb, var(--primary-color) 55%, var(--resume-sheet));
}

.creative-chip {
  padding: 0.12rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--primary-color) 30%, var(--resume-rule));
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-color) 8%, var(--resume-sheet));
  color: var(--primary-color);
  font-size: 0.78em;
}

@media print {
  .creative-template {
    background: white;
  }

  .creative-banner {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>
