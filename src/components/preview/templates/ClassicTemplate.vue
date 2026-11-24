<template>
  <div
    class="classic-template"
    :style="{
      '--primary-color': data.theme?.color || '#111827',
      '--font-size': (data.theme?.fontSize || 13) + 'px',
      '--line-height': data.theme?.lineHeight || 1.5,
      '--spacing': (data.theme?.moduleMargins?.bottom ?? 18) + 'px',
      padding: (data.theme?.pageMargins ?? 28) + 'px',
      fontSize: 'var(--font-size)',
      lineHeight: 'var(--line-height)',
      fontFamily: data.theme?.fontFamily || 'var(--resume-font-family)',
    }"
  >
    <header class="classic-header" @click="setActiveSection('basic')">
      <img
        v-if="data.basic.avatar"
        :src="data.basic.avatar"
        :alt="`${data.basic.name || '简历'}头像`"
        class="classic-avatar"
        :style="{ borderRadius: avatarBorderRadius(data.basic.avatarShape) }"
      />
      <h1 class="classic-name">{{ data.basic.name || '您的姓名' }}</h1>
      <p v-if="data.basic.title" class="classic-role">{{ data.basic.title }}</p>
      <div class="classic-contacts">
        <span v-if="data.basic.location" class="contact-piece">
          <ContactIcon v-if="data.theme?.displayIcons !== false" type="location" :icon="data.basic.iconOverrides?.location" />
          <span>{{ data.basic.location }}</span>
        </span>
        <span v-if="data.basic.phone" class="contact-piece">
          <ContactIcon v-if="data.theme?.displayIcons !== false" type="phone" :icon="data.basic.iconOverrides?.phone" />
          <span>{{ data.basic.phone }}</span>
        </span>
        <span v-if="data.basic.email" class="contact-piece">
          <ContactIcon v-if="data.theme?.displayIcons !== false" type="email" :icon="data.basic.iconOverrides?.email" />
          <a :href="`mailto:${data.basic.email}`" @click.stop>{{ data.basic.email }}</a>
        </span>
        <span v-if="data.basic.website" class="contact-piece">
          <ContactIcon v-if="data.theme?.displayIcons !== false" type="website" :icon="data.basic.iconOverrides?.website" />
          <a :href="data.basic.website" target="_blank" rel="noreferrer" @click.stop>{{ data.basic.website }}</a>
        </span>
        <span v-for="contact in visibleCustomContacts" :key="contact.id" class="contact-piece">
          <ContactIcon v-if="data.theme?.displayIcons !== false" type="custom" :icon="contact.icon" />
          <span><template v-if="contact.label">{{ contact.label }}：</template>{{ contact.value }}</span>
        </span>
        <ResumeSmartFields :data="data" />
      </div>
    </header>

    <section
      v-if="data.basic.summary"
      class="classic-section"
      @click.stop="setActiveSection('basic')"
    >
      <h2 class="section-heading">
        <span>个人简介</span>
        <span class="section-en">SUMMARY</span>
      </h2>
      <div class="entry-description rich-text" v-html="data.basic.summary" />
    </section>

    <draggable
      v-model="sortedSections"
      class="classic-sections"
      :item-key="(section: string) => section"
      :animation="200"
      handle=".section-heading"
      group="classic-sections"
    >
      <template #item="{ element: section }">
        <section
          v-if="hasSectionContent(section)"
          class="classic-section"
          @click.stop="setActiveSection(section)"
        >
          <h2 class="section-heading">
            <span>{{ getSectionTitle(section) }}</span>
            <span v-if="getSectionEnTitle(section)" class="section-en">{{ getSectionEnTitle(section) }}</span>
          </h2>

          <div v-if="section === 'experience'" class="entry-list">
            <article v-for="exp in visibleExperiences" :key="exp.id" class="classic-entry">
              <div class="entry-row">
                <div class="entry-left">
                  <strong class="entry-org">{{ exp.company }}</strong>
                  <span v-if="exp.position" class="entry-sep">·</span>
                  <span v-if="exp.position" class="entry-sub">{{ exp.position }}</span>
                </div>
                <span class="entry-date">{{ formatDateRange(exp.startDate, exp.endDate, ' – ') }}</span>
              </div>
              <div v-if="exp.description" class="entry-description rich-text" v-html="exp.description" />
              <ul v-if="exp.highlights?.length" class="highlight-list">
                <li v-for="(highlight, idx) in exp.highlights" :key="`${exp.id}-h-${idx}`">{{ highlight }}</li>
              </ul>
            </article>
          </div>

          <div v-else-if="section === 'projects'" class="entry-list">
            <article v-for="project in visibleProjects" :key="project.id" class="classic-entry">
              <div class="entry-row">
                <div class="entry-left">
                  <strong class="entry-org">{{ project.name }}</strong>
                  <span v-if="project.role" class="entry-sep">·</span>
                  <span v-if="project.role" class="entry-sub">{{ project.role }}</span>
                </div>
                <span class="entry-date">{{ formatDateRange(project.startDate, project.endDate, ' – ') }}</span>
              </div>
              <div v-if="project.techStack?.length" class="entry-tech">
                技术栈：{{ project.techStack.join(' / ') }}
              </div>
              <div v-if="project.description" class="entry-description rich-text" v-html="project.description" />
              <a v-if="project.link" class="entry-link" :href="project.link" target="_blank" rel="noreferrer" @click.stop>{{ project.link }}</a>
            </article>
          </div>

          <div v-else-if="section === 'education'" class="entry-list">
            <article v-for="edu in visibleEducation" :key="edu.id" class="classic-entry">
              <div class="entry-row">
                <div class="entry-left">
                  <strong class="entry-org">{{ edu.school }}</strong>
                  <span v-if="edu.degree || edu.major" class="entry-sep">·</span>
                  <span v-if="edu.degree || edu.major" class="entry-sub">{{ [edu.degree, edu.major].filter(Boolean).join(' · ') }}</span>
                  <span v-if="edu.gpa" class="entry-gpa">（GPA {{ edu.gpa }}）</span>
                </div>
                <span class="entry-date">{{ formatDateRange(edu.startDate, edu.endDate, ' – ') }}</span>
              </div>
            </article>
          </div>

          <div v-else-if="section === 'skills'" class="skill-list">
            <p v-for="skill in visibleSkills" :key="skill.id" class="skill-line">
              <strong>{{ skill.category }}：</strong>{{ skill.items.join('、') }}
            </p>
          </div>

          <div v-else-if="isCustomBlock(section)" class="entry-list">
            <template v-if="Array.isArray(getCustomContent(section))">
              <article v-for="item in getCustomItems(section)" :key="item.id" class="classic-entry">
                <div class="entry-row">
                  <div class="entry-left">
                    <strong v-if="item.title" class="entry-org">{{ item.title }}</strong>
                    <span v-if="item.title && item.subtitle" class="entry-sep">·</span>
                    <span v-if="item.subtitle" class="entry-sub">{{ item.subtitle }}</span>
                  </div>
                  <span v-if="item.date" class="entry-date">{{ item.date }}</span>
                </div>
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
  isCustomBlock,
  getCustomContent,
  getCustomItems,
  hasSectionContent,
  getSectionTitle,
  getSectionEnTitle,
  formatDateRange,
  setActiveSection,
} = useResumeTemplate(props, { defaultDateFormat: 'YYYY.MM' });
</script>

<style scoped>
.classic-template {
  box-sizing: border-box;
  min-height: var(--a4-height);
  background: var(--resume-paper);
  color: var(--resume-ink);
}

.classic-header {
  text-align: center;
  padding-bottom: 14px;
  border-bottom: 1.5px solid var(--resume-ink-strong);
  margin-bottom: 16px;
  cursor: pointer;
}

.classic-avatar {
  width: 68px;
  height: 68px;
  object-fit: cover;
  display: block;
  margin: 0 auto 10px;
}

.classic-name {
  margin: 0 0 4px;
  font-family: "Songti SC", "Noto Serif SC", Georgia, "Times New Roman", serif;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--resume-ink-strong);
  line-height: 1.25;
}

.classic-role {
  margin: 0 0 8px;
  font-size: calc(var(--font-size) + 0.5px);
  color: var(--resume-ink-body);
}

.classic-contacts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 4px 0;
  font-size: 0.9em;
  color: var(--resume-ink-body);
}

.contact-piece {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow-wrap: anywhere;
}

.contact-piece + .contact-piece::before {
  content: "|";
  margin: 0 8px;
  color: var(--resume-ink-soft);
}

.contact-piece :deep(svg) {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  color: var(--resume-ink-body);
}

.contact-piece a,
.entry-link {
  color: inherit;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.contact-piece a:hover,
.entry-link:hover {
  color: var(--primary-color);
  text-decoration: underline;
}

.classic-sections {
  display: flex;
  flex-direction: column;
  gap: var(--spacing);
}

.classic-section {
  cursor: pointer;
  scroll-margin-top: 12px;
}

.classic-section + .classic-sections {
  margin-top: var(--spacing);
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 0 0 9px;
  padding: 0 0 5px;
  border-bottom: 1px solid var(--resume-ink-strong);
  font-family: "Songti SC", "Noto Serif SC", Georgia, "Times New Roman", serif;
  font-size: calc(var(--font-size) + 2px);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--resume-ink-strong);
  cursor: grab;
  break-after: avoid;
}

.section-en {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 0.78em;
  font-weight: 400;
  letter-spacing: 0.12em;
  color: var(--resume-ink-soft);
}

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.classic-entry {
  break-inside: avoid;
}

.entry-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.entry-left {
  min-width: 0;
  overflow-wrap: anywhere;
}

.entry-org {
  font-size: calc(var(--font-size) + 0.5px);
  color: var(--resume-ink-title);
}

.entry-sep {
  margin: 0 5px;
  color: var(--resume-ink-soft);
}

.entry-sub {
  font-style: italic;
  color: var(--resume-ink-body);
}

.entry-gpa {
  color: var(--resume-ink-soft);
  font-size: 0.92em;
}

.entry-date {
  flex: 0 0 auto;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 0.92em;
  color: var(--resume-ink-soft);
  white-space: nowrap;
}

.entry-tech {
  margin-top: 2px;
  font-size: 0.92em;
  color: var(--resume-ink-soft);
}

.entry-description {
  margin-top: 4px;
  color: var(--resume-ink);
  overflow-wrap: anywhere;
}

.highlight-list {
  margin: 4px 0 0;
  padding-left: 1.2em;
  color: var(--resume-ink);
}

.highlight-list li + li {
  margin-top: 2px;
}

.entry-link {
  display: inline-block;
  margin-top: 3px;
  font-size: 0.9em;
  color: var(--resume-ink-body);
}

.skill-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skill-line {
  margin: 0;
  color: var(--resume-ink);
  overflow-wrap: anywhere;
}

.skill-line strong {
  color: var(--resume-ink-heading);
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
  .classic-template {
    min-height: 0;
    background: #fff;
  }
}
</style>
