<template>
  <div class="minimal-template" :style="{
    color: 'var(--resume-ink)',
    '--margin-top': (data.theme?.moduleMargins?.top ?? 0) + 'px',
    '--margin-bottom': (data.theme?.moduleMargins?.bottom ?? 24) + 'px',
    '--margin-left': (data.theme?.moduleMargins?.left ?? 0) + 'px',
    '--margin-right': (data.theme?.moduleMargins?.right ?? 0) + 'px',
    padding: (data.theme?.pageMargins !== undefined ? data.theme.pageMargins : 24) + 'px',
    fontFamily: data.theme?.fontFamily || 'var(--resume-font-family)',
    fontSize: (data.theme?.fontSize || 14) + 'px',
    lineHeight: data.theme?.lineHeight || 1.6,
    '--primary-color': data.theme?.color || '#000000'
  }">
    <!-- 极简头部 -->
    <header 
      class="minimal-header text-center cursor-pointer"
      @click="setActiveSection('basic')"
    >
      <img v-if="data.basic.avatar" :src="data.basic.avatar" alt="头像" class="w-16 h-16 object-cover mx-auto mb-4" :style="{ borderRadius: avatarBorderRadius(data.basic.avatarShape) }" />
      <h1 class="minimal-name">{{ data.basic.name || '您的姓名' }}</h1>
      <div class="minimal-role">{{ data.basic.title || '求职意向' }}</div>
    </header>

    <!-- 联系方式 -->
    <div class="minimal-contacts text-center">
      <span v-if="data.basic.email">{{ data.basic.email }}</span>
      <span v-if="data.basic.phone">{{ data.basic.phone }}</span>
      <span v-if="data.basic.location">{{ data.basic.location }}</span>
      <span
        v-for="contact in data.basic.customContacts?.filter((item) => item.label || item.value) || []"
        :key="contact.id"
        class="inline-flex max-w-full items-center gap-1"
      >
        <ContactIcon v-if="data.theme?.displayIcons !== false" type="custom" :icon="contact.icon" />
        <span class="truncate"><span v-if="contact.label">{{ contact.label }}：</span>{{ contact.value }}</span>
      </span>
      <ResumeSmartFields :data="data" align="center" class="mt-2" />
    </div>

    <!-- 简介 -->
    <section 
      v-if="data.basic.summary" 
      class="minimal-summary cursor-pointer"
      @click="setActiveSection('basic')"
    >
      <div class="text-center text-sm text-gray-700 max-w-2xl mx-auto rich-text" v-html="data.basic.summary"></div>
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
          class="section-item cursor-pointer hover:bg-gray-50 rounded transition-all p-2 -m-2"
          style="
            margin-top: var(--margin-top);
            margin-bottom: var(--margin-bottom);
            margin-left: var(--margin-left);
            margin-right: var(--margin-right);
          "
          @click.stop="setActiveSection(section)"
        >
          <!-- 工作经历 -->
          <section v-if="section === 'experience' && data.experiences.some(exp => exp.visible !== false)">
            <h2 class="section-header">{{ data.sectionTitles?.experience || '工作经历' }}</h2>
            <div class="minimal-entries">
              <div v-for="exp in data.experiences.filter(exp => exp.visible !== false)" :key="exp.id" class="text-center">
                <h3 class="font-semibold text-lg mb-1">{{ exp.company }}</h3>
                <div class="text-sm text-gray-600 mb-1">{{ exp.position }}</div>
                <div class="text-xs text-gray-500 mb-3">{{ formatDateRange(exp.startDate, exp.endDate) }}</div>
                <div class="text-sm text-gray-700 max-w-2xl mx-auto rich-text" v-html="exp.description"></div>
                <ul v-if="exp.highlights?.length" class="highlight-list">
                  <li v-for="(highlight, index) in exp.highlights" :key="`${exp.id}-highlight-${index}`">{{ highlight }}</li>
                </ul>
              </div>
            </div>
          </section>

          <!-- 项目经验 -->
          <section v-else-if="section === 'projects' && data.projects.some(project => project.visible !== false)">
            <h2 class="section-header">{{ data.sectionTitles?.projects || '项目经验' }}</h2>
            <div class="minimal-entries">
              <div v-for="project in data.projects.filter(project => project.visible !== false)" :key="project.id" class="text-center">
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
          <section v-else-if="section === 'education' && data.education.some(edu => edu.visible !== false)">
            <h2 class="section-header">{{ data.sectionTitles?.education || '教育背景' }}</h2>
            <div class="minimal-entries">
              <div v-for="edu in data.education.filter(edu => edu.visible !== false)" :key="edu.id" class="text-center">
                <h3 class="font-semibold">{{ edu.school }}</h3>
                <div class="text-sm text-gray-600">{{ edu.degree }} · {{ edu.major }}</div>
                <div class="text-xs text-gray-500">{{ formatDateRange(edu.startDate, edu.endDate) }}</div>
              </div>
            </div>
          </section>

          <!-- 技能 -->
          <section v-else-if="section === 'skills' && data.skills.some(skill => skill.visible !== false)">
            <h2 class="section-header">{{ data.sectionTitles?.skills || '专业技能' }}</h2>
            <div class="text-center space-y-2">
              <div v-for="skill in data.skills.filter(skill => skill.visible !== false)" :key="skill.id" class="text-sm">
                <span class="font-medium">{{ skill.category }}</span>
                <span class="text-gray-600"> · {{ skill.items.join(' · ') }}</span>
              </div>
            </div>
          </section>

          <!-- 自定义模块 -->
          <section v-else-if="isCustomBlock(section)">
            <h2 class="section-header">
              {{ getSectionTitle(section) }}
            </h2>
            <div v-if="Array.isArray(getCustomContent(section))" class="space-y-6">
              <div v-for="item in getCustomItems(section)" :key="item.id" class="text-center">
                <h3 v-if="item.title" class="font-semibold text-lg mb-1">{{ item.title }}</h3>
                <div v-if="item.subtitle" class="text-sm text-gray-600 mb-1">{{ item.subtitle }}</div>
                <div v-if="item.date" class="text-xs text-gray-500 mb-3">{{ item.date }}</div>
                <div class="text-sm text-gray-700 max-w-2xl mx-auto rich-text" v-html="item.description"></div>
              </div>
            </div>
            <div v-else class="text-center text-sm leading-loose text-gray-800 max-w-2xl mx-auto rich-text" v-html="getCustomContent(section)"></div>
          </section>
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ResumeData } from '@/types/resume';
import { avatarBorderRadius } from '@/utils/avatarShape';
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
.highlight-list {
  margin: 4px 0 0;
  padding-left: 1.2em;
  text-align: left;
}

.minimal-template {
  background: var(--resume-paper);
  color: var(--resume-ink);
}

.minimal-header {
  margin-bottom: 1.35rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid var(--resume-ink);
}

.minimal-name {
  margin: 0;
  font-size: 2.15em;
  font-weight: 450;
  letter-spacing: 0.08em;
  line-height: 1.15;
}

.minimal-role {
  margin-top: 0.45rem;
  color: var(--resume-ink-soft);
  font-size: 0.92em;
  letter-spacing: 0.16em;
}

.minimal-contacts {
  margin-bottom: 1.35rem;
  color: var(--resume-ink-soft);
  font-size: 0.78em;
  letter-spacing: 0.04em;
}

.minimal-contacts > span + span {
  margin-left: 1.1rem;
}

.minimal-summary {
  margin: var(--margin-top) var(--margin-right) var(--margin-bottom) var(--margin-left);
  padding: 2px;
}

.section-header {
  margin: 0 0 0.85rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--resume-rule);
  color: var(--resume-ink);
  font-size: 0.82em;
  font-weight: 650;
  letter-spacing: 0.22em;
  text-align: center;
}

.minimal-entries {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
}

section {
  page-break-inside: avoid;
}
</style>
