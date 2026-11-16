<template>
  <div class="tech-template min-h-full bg-gray-900 text-gray-100" data-resume-paper="fixed" :style="{
    '--margin-top': (data.theme?.moduleMargins?.top || 0) + 'px',
    '--margin-bottom': (data.theme?.moduleMargins?.bottom || 24) + 'px',
    '--margin-left': (data.theme?.moduleMargins?.left || 0) + 'px',
    '--margin-right': (data.theme?.moduleMargins?.right || 0) + 'px',
    padding: (data.theme?.pageMargins !== undefined ? data.theme.pageMargins : 24) + 'px',
    fontFamily: data.theme?.fontFamily || 'var(--resume-font-family)',
    fontSize: (data.theme?.fontSize || 14) + 'px',
    lineHeight: data.theme?.lineHeight || 1.6,
    '--primary-color': data.theme?.color || '#4ade80'
  }">
    <!-- 科技头部 -->
    <header 
      class="tech-header cursor-pointer"
      @click="setActiveSection('basic')"
    >
      <img v-if="data.basic.avatar" :src="data.basic.avatar" alt="头像" class="tech-avatar" />
      <div class="min-w-0">
      <h1 class="tech-name">
        {{ data.basic.name || '您的姓名' }}
      </h1>
      <div class="tech-role">{{ data.basic.title || '求职意向' }}</div>
      <div class="tech-contacts">
        <span v-if="data.basic.email" class="flex items-center gap-1">
          <ContactIcon v-if="data.theme?.displayIcons !== false" type="email" :icon="data.basic.iconOverrides?.email" /> {{ data.basic.email }}
        </span>
        <span v-if="data.basic.phone" class="flex items-center gap-1">
          <ContactIcon v-if="data.theme?.displayIcons !== false" type="phone" :icon="data.basic.iconOverrides?.phone" /> {{ data.basic.phone }}
        </span>
        <span v-if="data.basic.location" class="flex items-center gap-1">
          <ContactIcon v-if="data.theme?.displayIcons !== false" type="location" :icon="data.basic.iconOverrides?.location" /> {{ data.basic.location }}
        </span>
        <span
          v-for="contact in data.basic.customContacts?.filter((item) => item.label || item.value) || []"
          :key="contact.id"
          class="flex min-w-0 items-center gap-1"
        >
          <ContactIcon v-if="data.theme?.displayIcons !== false" type="custom" :icon="contact.icon" />
          <span class="truncate"><span v-if="contact.label">{{ contact.label }}：</span>{{ contact.value }}</span>
        </span>
        <ResumeSmartFields :data="data" />
      </div>
      </div>
    </header>

    <div class="space-y-6">
      <!-- 个人简介 -->
      <section 
        v-if="data.basic.summary"
        class="tech-block cursor-pointer"
        @click="setActiveSection('basic')"
      >
        <h2 class="tech-heading">个人简介</h2>
        <div class="tech-copy rich-text" v-html="data.basic.summary"></div>
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
            class="section-item tech-block cursor-pointer"
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
              <h2 class="section-header tech-heading">{{ data.sectionTitles?.experience || '工作经历' }}</h2>
              <div class="tech-entries">
                <div v-for="exp in data.experiences.filter(exp => exp.visible !== false)" :key="exp.id">
                  <div class="flex justify-between items-start mb-1">
                    <h3 class="font-semibold text-white">{{ exp.company }}</h3>
                    <span class="text-xs font-mono" style="color: var(--primary-color)">{{ formatDateRange(exp.startDate, exp.endDate) }}</span>
                  </div>
                  <div class="text-sm mb-1" style="color: var(--primary-color); opacity: 0.8">{{ exp.position }}</div>
                  <div class="text-sm text-gray-400 rich-text" v-html="exp.description"></div>
                  <ul v-if="exp.highlights?.length" class="highlight-list">
                    <li v-for="(highlight, index) in exp.highlights" :key="`${exp.id}-highlight-${index}`">{{ highlight }}</li>
                  </ul>
                </div>
              </div>
            </section>

            <!-- 项目经验 -->
            <section v-else-if="section === 'projects' && data.projects.some(project => project.visible !== false)">
              <h2 class="section-header tech-heading">{{ data.sectionTitles?.projects || '项目经验' }}</h2>
              <div class="tech-entries">
                <div v-for="project in data.projects.filter(project => project.visible !== false)" :key="project.id">
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
                      class="tech-chip"
                    >
                      {{ tech }}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <!-- 教育背景 -->
            <section v-else-if="section === 'education' && data.education.some(edu => edu.visible !== false)">
              <h2 class="section-header tech-heading">{{ data.sectionTitles?.education || '教育背景' }}</h2>
              <div class="tech-entries">
                <div v-for="edu in data.education.filter(edu => edu.visible !== false)" :key="edu.id">
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
            <section v-else-if="section === 'skills' && data.skills.some(skill => skill.visible !== false)">
              <h2 class="section-header tech-heading">{{ data.sectionTitles?.skills || '专业技能' }}</h2>
              <div class="tech-entries">
                <div v-for="skill in data.skills.filter(skill => skill.visible !== false)" :key="skill.id" class="text-sm">
                  <span class="tech-skill-name">{{ skill.category }}</span>
                  <span class="tech-skill-items">{{ skill.items.join(' · ') }}</span>
                </div>
              </div>
            </section>

            <!-- 自定义模块 -->
            <section v-else-if="isCustomBlock(section)">
              <h2 class="section-header tech-heading">
                {{ getSectionTitle(section) }}
              </h2>
              <div v-if="Array.isArray(getCustomContent(section))" class="tech-entries">
                <div v-for="item in getCustomItems(section)" :key="item.id">
                  <div class="flex justify-between items-start mb-1">
                    <h3 v-if="item.title" class="font-semibold text-white">{{ item.title }}</h3>
                    <span v-if="item.date" class="text-xs font-mono" style="color: var(--primary-color)">{{ item.date }}</span>
                  </div>
                  <div v-if="item.subtitle" class="text-sm mb-1" style="color: var(--primary-color); opacity: 0.8">{{ item.subtitle }}</div>
                  <div class="text-sm text-gray-400 rich-text" v-html="item.description"></div>
                </div>
              </div>
              <div v-else class="tech-copy rich-text" v-html="getCustomContent(section)"></div>
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
}

.tech-template {
  /* 深色纸是模板本身的样式，不跟随界面深浅色。 */
  color: #d7dee6;
}

.tech-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.15rem;
  padding: 0.15rem 0 0.9rem;
  border-bottom: 2px solid var(--primary-color);
}

.tech-avatar {
  width: 4.4rem;
  height: 4.4rem;
  flex: 0 0 auto;
  object-fit: cover;
  border: 2px solid var(--primary-color);
  border-radius: 999px;
}

.tech-name {
  margin: 0;
  color: var(--primary-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.85em;
  font-weight: 700;
  line-height: 1.15;
}

.tech-role {
  margin-top: 0.2rem;
  color: #b7f7df;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.tech-contacts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.9rem;
  margin-top: 0.55rem;
  color: #9aa6b2;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.82em;
}

.tech-heading {
  margin: 0 0 0.55rem;
  color: var(--primary-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.86em;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.tech-heading::before {
  content: '// ';
}

.tech-copy,
.tech-entries {
  padding-left: 0.8rem;
  border-left: 1px solid #33404c;
}

.tech-entries {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.tech-chip {
  padding: 0.1rem 0.4rem;
  border: 1px solid color-mix(in srgb, var(--primary-color) 55%, #1a1a1a);
  border-radius: 4px;
  background: #24303a;
  color: var(--primary-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75em;
}

.tech-skill-name {
  color: var(--primary-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.tech-skill-name::after {
  content: '  ';
}

.tech-skill-items {
  color: #d5dde4;
}

.tech-block {
  border-radius: 6px;
  padding: 2px;
}

.tech-block:hover {
  background: rgb(255 255 255 / 4%);
}

@media print {
  .tech-template {
    background: #1a1a1a;
    color: #e5e5e5;
  }
}
</style>
