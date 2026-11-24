<template>
  <div
    class="editorial-template"
    :style="{
      '--primary-color': data.theme?.color || '#0f766e',
      '--font-size': (data.theme?.fontSize || 13.5) + 'px',
      '--line-height': data.theme?.lineHeight || 1.55,
      '--spacing': (data.theme?.moduleMargins?.bottom ?? 20) + 'px',
      '--page-pad': (data.theme?.pageMargins ?? 28) + 'px',
      fontSize: 'var(--font-size)',
      lineHeight: 'var(--line-height)',
      fontFamily: data.theme?.fontFamily || 'var(--resume-font-family)',
    }"
  >
    <header class="editorial-header" @click="setActiveSection('basic')">
      <div class="header-identity">
        <img
          v-if="data.basic.avatar"
          :src="data.basic.avatar"
          :alt="`${data.basic.name || '简历'}头像`"
          class="editorial-avatar"
          :style="{ borderRadius: avatarBorderRadius(data.basic.avatarShape) }"
        />
        <div>
          <h1 class="editorial-name">{{ data.basic.name || '您的姓名' }}</h1>
          <p v-if="data.basic.title" class="editorial-role">{{ data.basic.title }}</p>
        </div>
      </div>

      <div class="header-contacts">
        <div v-if="data.basic.location || data.basic.phone" class="contact-line">
          <span v-if="data.basic.location" class="contact-item">
            <ContactIcon v-if="data.theme?.displayIcons !== false" type="location" :icon="data.basic.iconOverrides?.location" />
            <span>{{ data.basic.location }}</span>
          </span>
          <span v-if="data.basic.phone" class="contact-item">
            <ContactIcon v-if="data.theme?.displayIcons !== false" type="phone" :icon="data.basic.iconOverrides?.phone" />
            <span>{{ data.basic.phone }}</span>
          </span>
        </div>
        <div v-if="data.basic.email" class="contact-item">
          <ContactIcon v-if="data.theme?.displayIcons !== false" type="email" :icon="data.basic.iconOverrides?.email" />
          <a :href="`mailto:${data.basic.email}`" @click.stop>{{ data.basic.email }}</a>
        </div>
        <div v-if="data.basic.website" class="contact-item">
          <ContactIcon v-if="data.theme?.displayIcons !== false" type="website" :icon="data.basic.iconOverrides?.website" />
          <a :href="data.basic.website" target="_blank" rel="noreferrer" @click.stop>{{ data.basic.website }}</a>
        </div>
        <div v-for="contact in visibleCustomContacts" :key="contact.id" class="contact-item">
          <ContactIcon v-if="data.theme?.displayIcons !== false" type="custom" :icon="contact.icon" />
          <span><template v-if="contact.label">{{ contact.label }}：</template>{{ contact.value }}</span>
        </div>
        <ResumeSmartFields :data="data" />
      </div>
    </header>

    <div class="editorial-body">
      <main class="editorial-main">
        <draggable
          v-model="sortedSections"
          class="main-sections"
          :item-key="(section: string) => section"
          :animation="200"
          handle=".section-heading"
          group="editorial-main-sections"
        >
          <template #item="{ element: section }">
            <section
              v-if="hasSectionContent(section)"
              class="editorial-section"
              @click.stop="setActiveSection(section)"
            >
              <h2 class="section-heading">{{ getSectionTitle(section) }}</h2>

              <div v-if="section === 'experience'" class="entry-list">
                <article v-for="exp in visibleExperiences" :key="exp.id" class="editorial-entry">
                  <div class="entry-head">
                    <h3 class="entry-title">{{ exp.company }}</h3>
                    <span class="entry-date">{{ formatDateRange(exp.startDate, exp.endDate, ' – ') }}</span>
                  </div>
                  <div v-if="exp.position" class="entry-role">{{ exp.position }}</div>
                  <div v-if="exp.description" class="entry-desc rich-text" v-html="exp.description" />
                  <ul v-if="exp.highlights?.length" class="highlight-list">
                    <li v-for="(highlight, idx) in exp.highlights" :key="`${exp.id}-h-${idx}`">{{ highlight }}</li>
                  </ul>
                </article>
              </div>

              <div v-else-if="section === 'projects'" class="entry-list">
                <article v-for="project in visibleProjects" :key="project.id" class="editorial-entry">
                  <div class="entry-head">
                    <h3 class="entry-title">{{ project.name }}</h3>
                    <span class="entry-date">{{ formatDateRange(project.startDate, project.endDate, ' – ') }}</span>
                  </div>
                  <div v-if="project.role || project.techStack?.length" class="entry-role">
                    {{ [project.role, project.techStack?.join(' / ')].filter(Boolean).join(' · ') }}
                  </div>
                  <div v-if="project.description" class="entry-desc rich-text" v-html="project.description" />
                  <a v-if="project.link" class="entry-link" :href="project.link" target="_blank" rel="noreferrer" @click.stop>{{ project.link }}</a>
                </article>
              </div>

              <div v-else-if="isCustomBlock(section)" class="entry-list">
                <template v-if="Array.isArray(getCustomContent(section))">
                  <article v-for="item in getCustomItems(section)" :key="item.id" class="editorial-entry">
                    <div class="entry-head">
                      <h3 v-if="item.title" class="entry-title">{{ item.title }}</h3>
                      <span v-if="item.date" class="entry-date">{{ item.date }}</span>
                    </div>
                    <div v-if="item.subtitle" class="entry-role">{{ item.subtitle }}</div>
                    <div v-if="item.description" class="entry-desc rich-text" v-html="item.description" />
                  </article>
                </template>
                <div v-else class="entry-desc rich-text" v-html="getCustomContent(section)" />
              </div>
            </section>
          </template>
        </draggable>
      </main>

      <aside class="editorial-sidebar">
        <section
          v-if="data.basic.summary"
          class="side-section"
          @click.stop="setActiveSection('basic')"
        >
          <h2 class="section-heading">简介</h2>
          <div class="side-desc rich-text" v-html="data.basic.summary" />
        </section>

        <template v-for="section in sortedSidebarSections" :key="section">
          <section
            v-if="section === 'skills' && visibleSkills.length"
            class="side-section"
            @click.stop="setActiveSection('skills')"
          >
            <h2 class="section-heading">{{ getSectionTitle('skills') }}</h2>
            <div v-for="skill in visibleSkills" :key="skill.id" class="skill-group">
              <div class="skill-cat">{{ skill.category }}</div>
              <div class="skill-pills">
                <span v-for="(item, idx) in skill.items" :key="`${skill.id}-${idx}`" class="skill-pill">{{ item }}</span>
              </div>
            </div>
          </section>

          <section
            v-else-if="section === 'education' && visibleEducation.length"
            class="side-section"
            @click.stop="setActiveSection('education')"
          >
            <h2 class="section-heading">{{ getSectionTitle('education') }}</h2>
            <div v-for="edu in visibleEducation" :key="edu.id" class="edu-item">
              <div class="edu-school">{{ edu.school }}</div>
              <div class="edu-meta">{{ [edu.major, edu.degree].filter(Boolean).join(' · ') }}</div>
              <div class="edu-date">
                {{ formatDateRange(edu.startDate, edu.endDate, ' – ') }}
                <template v-if="edu.gpa"> · GPA {{ edu.gpa }}</template>
              </div>
            </div>
          </section>
        </template>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import draggable from 'vuedraggable';
import ContactIcon from '@/components/common/ContactIcon.vue';
import ResumeSmartFields from '@/components/preview/ResumeSmartFields.vue';
import { useResumeTemplate } from '@/composables/useResumeTemplate';
import type { ResumeData } from '@/types/resume';
import { avatarBorderRadius } from '@/utils/avatarShape';

const props = defineProps<{ data: ResumeData }>();

const {
  visibleEducation,
  visibleExperiences,
  visibleProjects,
  visibleSkills,
  visibleCustomContacts,
  sortedSections,
  sortedSidebarSections,
  isCustomBlock,
  getCustomContent,
  getCustomItems,
  hasSectionContent,
  getSectionTitle,
  formatDateRange,
  setActiveSection,
} = useResumeTemplate(props, {
  sidebarSectionIds: ['skills', 'education'],
  defaultDateFormat: 'YYYY.MM',
});
</script>

<style scoped>
.editorial-template {
  box-sizing: border-box;
  min-height: var(--a4-height);
  display: flex;
  flex-direction: column;
  background: var(--resume-paper);
  color: var(--resume-ink);
}

.editorial-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  padding: var(--page-pad) var(--page-pad) 18px;
  border-bottom: 1px solid var(--resume-rule);
  cursor: pointer;
}

.header-identity {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.editorial-avatar {
  width: 64px;
  height: 64px;
  flex: 0 0 64px;
  object-fit: cover;
}

.editorial-name {
  margin: 0 0 4px;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--resume-ink-strong);
  line-height: 1.2;
}

.editorial-role {
  margin: 0;
  font-size: calc(var(--font-size) + 1px);
  font-weight: 600;
  color: var(--primary-color);
}

.header-contacts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  font-size: 0.88em;
  color: var(--resume-ink-body);
  text-align: right;
  min-width: 0;
}

.contact-line {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.contact-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  overflow-wrap: anywhere;
}

.contact-item :deep(svg) {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  color: var(--primary-color);
}

.contact-item a,
.entry-link {
  color: inherit;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.contact-item a:hover,
.entry-link:hover {
  color: var(--primary-color);
  text-decoration: underline;
}

.editorial-body {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 66% 34%;
}

.editorial-main {
  padding: 20px 24px var(--page-pad) var(--page-pad);
  min-width: 0;
}

.editorial-sidebar {
  background: var(--resume-hover);
  border-left: 1px solid var(--resume-rule);
  padding: 20px var(--page-pad) var(--page-pad) 20px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing);
}

.main-sections {
  display: flex;
  flex-direction: column;
  gap: var(--spacing);
}

.editorial-section,
.side-section {
  cursor: pointer;
  scroll-margin-top: 12px;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 11px;
  font-size: 0.92em;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--primary-color);
  cursor: grab;
  break-after: avoid;
}

.side-section .section-heading {
  cursor: pointer;
}

.section-heading::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--resume-rule);
}

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.editorial-entry {
  break-inside: avoid;
}

.entry-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}

.entry-title {
  margin: 0;
  font-size: calc(var(--font-size) + 1px);
  font-weight: 700;
  color: var(--resume-ink-title);
}

.entry-date {
  flex: 0 0 auto;
  font-size: 0.88em;
  color: var(--resume-ink-soft);
  white-space: nowrap;
}

.entry-role {
  margin: 2px 0 5px;
  font-size: 0.94em;
  font-weight: 500;
  color: var(--primary-color);
}

.entry-desc,
.side-desc {
  color: var(--resume-ink-body);
  overflow-wrap: anywhere;
}

.highlight-list {
  margin: 5px 0 0;
  padding-left: 1.2em;
  color: var(--resume-ink-body);
}

.highlight-list li + li {
  margin-top: 3px;
}

.entry-link {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.9em;
  color: var(--resume-ink-soft);
}

.skill-group + .skill-group {
  margin-top: 10px;
}

.skill-cat {
  font-size: 0.94em;
  font-weight: 700;
  color: var(--resume-ink-heading);
  margin-bottom: 5px;
}

.skill-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.skill-pill {
  font-size: 0.86em;
  padding: 2px 7px;
  border-radius: 3px;
  background: var(--resume-sheet);
  border: 1px solid var(--resume-rule);
  color: var(--resume-ink-body);
}

.edu-item + .edu-item {
  margin-top: 10px;
}

.edu-school {
  font-weight: 700;
  color: var(--resume-ink-title);
}

.edu-meta {
  font-size: 0.94em;
  color: var(--resume-ink-body);
  margin-top: 2px;
}

.edu-date {
  font-size: 0.86em;
  color: var(--resume-ink-soft);
  margin-top: 2px;
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

@media print {
  .editorial-template {
    min-height: 0;
    background: #fff;
  }
}
</style>
