<template>
  <div
    class="ai-agent-template"
    :style="{
      '--primary-color': data.theme?.color || '#243447',
      '--font-size': (data.theme?.fontSize || 13) + 'px',
      '--line-height': data.theme?.lineHeight || 1.45,
      '--section-gap': (data.theme?.moduleMargins?.bottom ?? 18) + 'px',
      padding: (data.theme?.pageMargins ?? 24) + 'px',
      fontFamily: data.theme?.fontFamily || 'var(--resume-font-family)',
    }"
  >
    <header class="profile-header" @click="setActiveSection('basic')">
      <img v-if="data.basic.avatar" :src="data.basic.avatar" :alt="`${data.basic.name || '简历'}头像`" class="profile-avatar" />
      <div class="profile-main">
        <div class="profile-topline">
          <div class="identity">
            <h1>{{ data.basic.name || '您的姓名' }}</h1>
            <p v-if="data.basic.title" class="job-title">{{ data.basic.title }}</p>
          </div>
          <div class="contact-grid">
            <div v-if="data.basic.phone" class="contact-item">
              <ContactIcon v-if="data.theme.displayIcons !== false" type="phone" :icon="data.basic.iconOverrides?.phone" />
              <span>{{ data.basic.phone }}</span>
            </div>
            <div v-if="data.basic.email" class="contact-item">
              <ContactIcon v-if="data.theme.displayIcons !== false" type="email" :icon="data.basic.iconOverrides?.email" />
              <a :href="`mailto:${data.basic.email}`" @click.stop>{{ data.basic.email }}</a>
            </div>
            <div v-if="data.basic.location" class="contact-item">
              <ContactIcon v-if="data.theme.displayIcons !== false" type="location" :icon="data.basic.iconOverrides?.location" />
              <span>{{ data.basic.location }}</span>
            </div>
            <div v-if="data.basic.website" class="contact-item">
              <ContactIcon v-if="data.theme.displayIcons !== false" type="website" :icon="data.basic.iconOverrides?.website" />
              <a :href="data.basic.website" :title="data.basic.website" target="_blank" rel="noreferrer" @click.stop>{{ data.basic.website }}</a>
            </div>
            <div
              v-for="contact in data.basic.customContacts?.filter((item) => item.label || item.value) || []"
              :key="contact.id"
              class="contact-item"
            >
              <ContactIcon v-if="data.theme.displayIcons !== false" type="custom" :icon="contact.icon" />
              <span class="contact-copy"><span v-if="contact.label" class="contact-label">{{ contact.label }}：</span>{{ contact.value }}</span>
            </div>
            <ResumeSmartFields :data="data" />
          </div>
        </div>
      </div>
    </header>

    <section
      v-if="data.basic.summary"
      class="summary-block rich-text"
      @click.stop="setActiveSection('basic')"
      v-html="data.basic.summary"
    />

    <draggable
      v-model="sortedSections"
      class="resume-sections"
      :item-key="(section: string) => section"
      :animation="200"
      handle=".section-title"
      group="ai-agent-sections"
    >
      <template #item="{ element: section }">
        <section
          v-if="hasSectionContent(section)"
          class="resume-section"
          @click.stop="setActiveSection(section)"
        >
          <h2 class="section-title">{{ getSectionTitle(section) }}</h2>

          <div v-if="section === 'education'" class="entry-list">
            <article v-for="education in visibleEducation" :key="education.id" class="resume-entry">
              <div class="entry-heading">
                <div class="entry-primary">{{ education.school }}</div>
                <span class="entry-date">{{ formatDateRange(education.startDate, education.endDate) }}</span>
              </div>
              <div class="entry-subtitle">{{ [education.degree, education.major].filter(Boolean).join(' · ') }}</div>
              <div v-if="education.gpa" class="entry-note">GPA：{{ education.gpa }}</div>
            </article>
          </div>

          <div v-else-if="section === 'experience'" class="entry-list">
            <article v-for="experience in visibleExperiences" :key="experience.id" class="resume-entry">
              <div class="entry-heading">
                <div class="entry-primary">{{ experience.company }}</div>
                <span class="entry-date">{{ formatDateRange(experience.startDate, experience.endDate) }}</span>
              </div>
              <div class="entry-subtitle">{{ experience.position }}</div>
              <div v-if="experience.description" class="entry-description rich-text" v-html="experience.description" />
              <ul v-if="experience.highlights?.length" class="highlight-list">
                <li v-for="(highlight, index) in experience.highlights" :key="`${experience.id}-highlight-${index}`">{{ highlight }}</li>
              </ul>
            </article>
          </div>

          <div v-else-if="section === 'projects'" class="entry-list">
            <article v-for="project in visibleProjects" :key="project.id" class="resume-entry">
              <div class="entry-heading">
                <div class="entry-primary">{{ project.name }}</div>
                <span class="entry-date">{{ formatDateRange(project.startDate, project.endDate) }}</span>
              </div>
              <div v-if="project.role" class="entry-subtitle">{{ project.role }}</div>
              <div v-if="project.techStack?.length" class="entry-description">
                <strong>技术架构：</strong>{{ project.techStack.join(' + ') }}
              </div>
              <div v-if="project.description" class="entry-description rich-text" v-html="project.description" />
              <a v-if="project.link" class="project-link" :href="project.link" target="_blank" rel="noreferrer" @click.stop>{{ project.link }}</a>
            </article>
          </div>

          <div v-else-if="section === 'skills'" class="skill-list">
            <p v-for="skill in visibleSkills" :key="skill.id" class="skill-line">
              <strong>{{ skill.category }}：</strong>{{ skill.items.join('、') }}
            </p>
          </div>

          <div v-else-if="isCustomBlock(section)" class="entry-list">
            <template v-if="Array.isArray(getCustomContent(section))">
              <article v-for="item in getCustomItems(section)" :key="item.id" class="resume-entry">
                <div class="entry-heading">
                  <div class="entry-primary">{{ item.title }}</div>
                  <span v-if="item.date" class="entry-date">{{ item.date }}</span>
                </div>
                <div v-if="item.subtitle" class="entry-subtitle">{{ item.subtitle }}</div>
                <div v-if="item.description" class="entry-description rich-text" v-html="item.description" />
              </article>
            </template>
            <div v-else class="entry-description rich-text" v-html="getCustomContent(section)" />
          </div>
        </section>
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import draggable from 'vuedraggable';
import ContactIcon from '@/components/common/ContactIcon.vue';
import ResumeSmartFields from '@/components/preview/ResumeSmartFields.vue';
import { useResumeStore } from '@/stores/resume';
import type { ResumeData } from '@/types/resume';

const props = defineProps<{ data: ResumeData }>();
const resumeStore = useResumeStore();

const visibleEducation = computed(() => props.data.education.filter((item) => item.visible !== false));
const visibleExperiences = computed(() => props.data.experiences.filter((item) => item.visible !== false));
const visibleProjects = computed(() => props.data.projects.filter((item) => item.visible !== false));
const visibleSkills = computed(() => props.data.skills.filter((item) => item.visible !== false));

const sortedSections = computed({
  get: () => (props.data.sectionOrder || []).filter((id) => !props.data.hiddenSections?.includes(id)),
  set: (order: string[]) => {
    const hiddenSections = props.data.hiddenSections || [];
    resumeStore.updateSectionOrder([...order, ...hiddenSections]);
  },
});

const formatDate = (value: string) => {
  if (!value) return '';
  const match = value.match(/^(\d{4})[-/.](\d{1,2})/);
  if (!match) return value;
  const year = match[1];
  const monthValue = match[2];
  if (!year || !monthValue) return value;
  const month = monthValue.padStart(2, '0');
  const abbreviatedMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1];
  switch (props.data.theme?.dateFormat || 'YYYY/MM') {
    case 'YYYY-MM': return `${year}-${month}`;
    case 'YYYY.MM': return `${year}.${month}`;
    case 'MM/YYYY': return `${month}/${year}`;
    case 'MMM YYYY': return `${abbreviatedMonth} ${year}`;
    case 'YYYY/MM': default: return `${year}/${month}`;
  }
};

const formatDateRange = (start: string, end: string | 'present') => {
  const formattedStart = formatDate(start);
  const formattedEnd = end === 'present' ? '至今' : formatDate(end);
  return [formattedStart, formattedEnd].filter(Boolean).join(' - ');
};

const isCustomBlock = (id: string) => !['education', 'experience', 'projects', 'skills'].includes(id)
  && props.data.customBlocks.some((block) => block.id === id);

const getCustomContent = (id: string) => props.data.customBlocks.find((block) => block.id === id)?.content ?? '';
const getCustomItems = (id: string) => {
  const content = getCustomContent(id);
  return Array.isArray(content) ? content.filter((item) => item.visible !== false) : [];
};

const hasSectionContent = (id: string) => {
  if (id === 'education') return visibleEducation.value.length > 0;
  if (id === 'experience') return visibleExperiences.value.length > 0;
  if (id === 'projects') return visibleProjects.value.length > 0;
  if (id === 'skills') return visibleSkills.value.length > 0;
  if (!isCustomBlock(id)) return false;
  const content = getCustomContent(id);
  return !Array.isArray(content) || content.some((item) => item.visible !== false);
};

const getSectionTitle = (id: string) => {
  const defaults: Record<string, string> = {
    education: '教育经历',
    experience: '工作经验',
    projects: '项目经历',
    skills: '专业技能',
  };
  return props.data.sectionTitles?.[id] || props.data.customBlocks.find((block) => block.id === id)?.title || defaults[id] || id;
};

const setActiveSection = (id: string) => resumeStore.setActiveSection(id);
</script>

<style scoped>
.ai-agent-template {
  box-sizing: border-box;
  min-height: var(--a4-height);
  color: #252a30;
  font-size: var(--font-size);
  line-height: var(--line-height);
  background: #fff;
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: 112px;
  padding-bottom: 18px;
  border-bottom: 1px solid #d6dbe0;
  cursor: pointer;
}

.profile-avatar {
  width: 84px;
  height: 112px;
  flex: 0 0 84px;
  object-fit: cover;
  border-radius: 2px;
  background: #f1f3f5;
}

.profile-main {
  min-width: 0;
  flex: 1;
}

.profile-topline {
  display: grid;
  grid-template-columns: minmax(130px, 0.8fr) minmax(250px, 1.5fr);
  align-items: center;
  gap: 20px;
}

.identity h1 {
  margin: 0;
  color: #20262d;
  font-size: 30px;
  font-weight: 750;
  line-height: 1.2;
  letter-spacing: 0.02em;
}

.job-title {
  margin: 6px 0 0;
  color: var(--primary-color);
  font-size: 14px;
  font-weight: 600;
}

.contact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  color: #39414a;
  font-size: 12px;
}

.contact-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.contact-item :deep(svg) {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
  color: #39414a;
}

.contact-item > span,
.contact-item > a,
.contact-copy {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.contact-item a,
.project-link {
  color: inherit;
  text-decoration: none;
}

.contact-item a:hover,
.project-link:hover {
  color: var(--primary-color);
  text-decoration: underline;
}

.summary-block {
  margin: 16px 0 4px;
  padding: 0 0 14px;
  border-bottom: 1px solid #e2e5e8;
  color: #424a52;
  cursor: pointer;
}

.resume-sections {
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);
  padding-top: 16px;
}

.resume-section {
  min-width: 0;
  cursor: pointer;
  scroll-margin-top: 12px;
  break-inside: auto;
}

.section-title {
  position: relative;
  margin: 0 0 12px;
  padding: 0 0 7px 14px;
  border-bottom: 1px solid #d9dee3;
  color: #252b32;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  cursor: grab;
  break-after: avoid;
}

.section-title::before {
  position: absolute;
  top: 1px;
  bottom: 8px;
  left: 0;
  width: 3px;
  border-radius: 2px;
  background: var(--primary-color);
  content: '';
}

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.resume-entry {
  min-width: 0;
  color: #30363d;
  break-inside: avoid;
}

.entry-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.entry-primary {
  min-width: 0;
  color: #242a30;
  font-size: calc(var(--font-size) + 1px);
  font-weight: 700;
}

.entry-date {
  flex: 0 0 auto;
  color: #555e67;
  font-size: 0.92em;
  white-space: nowrap;
}

.entry-subtitle {
  margin-top: 2px;
  color: #4a535c;
  font-weight: 500;
}

.entry-note {
  margin-top: 3px;
  color: #626b74;
  font-size: 0.94em;
}

.entry-description {
  margin-top: 5px;
  color: #343b42;
  overflow-wrap: anywhere;
}

.highlight-list {
  margin: 5px 0 0;
  padding-left: 1.15em;
}

.highlight-list li + li {
  margin-top: 2px;
}

.project-link {
  display: inline-block;
  margin-top: 4px;
  color: #4a535c;
  font-size: 0.92em;
  overflow-wrap: anywhere;
}

.skill-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.skill-line {
  margin: 0;
  overflow-wrap: anywhere;
}

.skill-line strong {
  color: #252b32;
}

.rich-text :deep(p) {
  margin: 0 0 0.35em;
}

.rich-text :deep(p:last-child) {
  margin-bottom: 0;
}

.rich-text :deep(ul),
.rich-text :deep(ol) {
  margin: 0.25em 0;
  padding-left: 1.2em;
}

.rich-text :deep(li + li) {
  margin-top: 2px;
}

@media (max-width: 620px) {
  .profile-header {
    align-items: flex-start;
    gap: 14px;
  }

  .profile-avatar {
    width: 68px;
    height: 90px;
    flex-basis: 68px;
  }

  .profile-topline {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .identity h1 {
    font-size: 26px;
  }

  .contact-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}

@media print {
  .ai-agent-template {
    min-height: 0;
    color: #20252b;
  }

  .profile-header,
  .resume-entry {
    break-inside: avoid;
  }

  .section-title {
    color: #20252b;
  }
}
</style>
