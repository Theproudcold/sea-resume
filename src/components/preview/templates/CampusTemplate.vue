<template>
  <div
    class="campus-template"
    :style="{
      '--primary-color': data.theme?.color || '#166534',
      '--font-size': (data.theme?.fontSize || 13) + 'px',
      '--line-height': data.theme?.lineHeight || 1.48,
      '--margin-top': (data.theme?.moduleMargins?.top ?? 0) + 'px',
      '--margin-bottom': (data.theme?.moduleMargins?.bottom ?? 16) + 'px',
      '--margin-left': (data.theme?.moduleMargins?.left ?? 0) + 'px',
      '--margin-right': (data.theme?.moduleMargins?.right ?? 0) + 'px',
      '--spacing': (data.theme?.moduleMargins?.bottom ?? 16) + 'px',
      padding: (data.theme?.pageMargins ?? 26) + 'px',
      fontSize: 'var(--font-size)',
      lineHeight: 'var(--line-height)',
      fontFamily: data.theme?.fontFamily || 'var(--resume-font-family)',
    }"
  >
    <header class="campus-header" @click="setActiveSection('basic')">
      <div class="header-left">
        <img
          v-if="data.basic.avatar"
          :src="data.basic.avatar"
          :alt="`${data.basic.name || '简历'}头像`"
          class="campus-avatar"
          :style="{ borderRadius: avatarBorderRadius(data.basic.avatarShape) }"
        />
        <div>
          <h1 class="campus-name">{{ data.basic.name || '您的姓名' }}</h1>
          <p v-if="data.basic.title" class="campus-target">
            求职意向：{{ data.basic.title }}<template v-if="data.basic.location"> · {{ data.basic.location }}</template>
          </p>
        </div>
      </div>

      <div class="header-contacts">
        <div v-if="data.basic.phone" class="contact-item">
          <ContactIcon v-if="data.theme?.displayIcons !== false" type="phone" :icon="data.basic.iconOverrides?.phone" />
          <span>{{ data.basic.phone }}</span>
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
        <ResumeSmartFields :data="data" align="end" />
      </div>
    </header>

    <section
      v-if="data.basic.summary"
      class="campus-summary rich-text"
      @click.stop="setActiveSection('basic')"
      v-html="data.basic.summary"
    />

    <draggable
      v-model="sortedSections"
      class="campus-sections"
      :item-key="(section: string) => section"
      :animation="200"
      handle=".section-heading"
      group="campus-sections"
    >
      <template #item="{ element: section }">
        <section
          v-if="hasSectionContent(section)"
          class="campus-section"
          @click.stop="setActiveSection(section)"
        >
          <h2 class="section-heading">
            <span>{{ getSectionTitle(section) }}</span>
            <span v-if="getSectionEnTitle(section)" class="section-en">{{ getSectionEnTitle(section) }}</span>
          </h2>

          <div v-if="section === 'education'" class="entry-list">
            <article v-for="edu in visibleEducation" :key="edu.id" class="campus-entry">
              <div class="entry-row">
                <div class="entry-left">
                  <strong class="edu-school">{{ edu.school }}</strong>
                  <span v-if="edu.major || edu.degree" class="edu-major">
                    · {{ [edu.major, edu.degree].filter(Boolean).join('（') + (edu.major && edu.degree ? '）' : '') }}
                  </span>
                  <span v-if="edu.gpa" class="gpa-badge">GPA {{ edu.gpa }}</span>
                </div>
                <span class="entry-date">{{ formatDateRange(edu.startDate, edu.endDate, ' – ') }}</span>
              </div>
            </article>
          </div>

          <div v-else-if="section === 'experience'" class="entry-list">
            <article v-for="exp in visibleExperiences" :key="exp.id" class="campus-entry">
              <div class="entry-row">
                <div class="entry-left">
                  <strong class="entry-title">{{ exp.company }}</strong>
                  <span v-if="exp.position" class="entry-sub"> · {{ exp.position }}</span>
                </div>
                <span class="entry-date">{{ formatDateRange(exp.startDate, exp.endDate, ' – ') }}</span>
              </div>
              <div v-if="exp.description" class="entry-desc rich-text" v-html="exp.description" />
              <ul v-if="exp.highlights?.length" class="highlight-list">
                <li v-for="(highlight, idx) in exp.highlights" :key="`${exp.id}-h-${idx}`">{{ highlight }}</li>
              </ul>
            </article>
          </div>

          <div v-else-if="section === 'projects'" class="entry-list">
            <article v-for="project in visibleProjects" :key="project.id" class="campus-entry">
              <div class="entry-row">
                <div class="entry-left">
                  <strong class="entry-title">{{ project.name }}</strong>
                  <span v-if="project.role" class="entry-sub"> · {{ project.role }}</span>
                  <span v-if="project.techStack?.length" class="entry-tech">（{{ project.techStack.join(' / ') }}）</span>
                </div>
                <span class="entry-date">{{ formatDateRange(project.startDate, project.endDate, ' – ') }}</span>
              </div>
              <div v-if="project.description" class="entry-desc rich-text" v-html="project.description" />
              <a v-if="project.link" class="entry-link" :href="project.link" target="_blank" rel="noreferrer" @click.stop>{{ project.link }}</a>
            </article>
          </div>

          <div v-else-if="section === 'skills'" class="skill-list">
            <p v-for="skill in visibleSkills" :key="skill.id" class="skill-line">
              <strong>{{ skill.category }}：</strong>{{ skill.items.join('、') }}
            </p>
          </div>

          <div v-else-if="isCustomBlock(section)" class="entry-list">
            <template v-if="Array.isArray(getCustomContent(section))">
              <article v-for="item in getCustomItems(section)" :key="item.id" class="campus-entry">
                <div class="entry-row">
                  <div class="entry-left">
                    <strong v-if="item.title" class="entry-title">{{ item.title }}</strong>
                    <span v-if="item.subtitle" class="entry-sub"> · {{ item.subtitle }}</span>
                  </div>
                  <span v-if="item.date" class="entry-date">{{ item.date }}</span>
                </div>
                <div v-if="item.description" class="entry-desc rich-text" v-html="item.description" />
              </article>
            </template>
            <div v-else class="entry-desc rich-text" v-html="getCustomContent(section)" />
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
.campus-template {
  box-sizing: border-box;
  min-height: var(--a4-height);
  background: var(--resume-paper);
  color: var(--resume-ink);
}

.campus-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 2px solid var(--primary-color);
  margin-bottom: 14px;
  cursor: pointer;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.campus-avatar {
  width: 60px;
  height: 72px;
  flex: 0 0 60px;
  object-fit: cover;
  border: 1px solid color-mix(in srgb, var(--primary-color) 28%, var(--resume-rule));
}

.campus-name {
  margin: 0 0 4px;
  font-size: 26px;
  font-weight: 700;
  color: var(--primary-color);
  line-height: 1.2;
}

.campus-target {
  margin: 0;
  font-size: 0.96em;
  color: var(--resume-ink-body);
}

.header-contacts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  font-size: 0.88em;
  color: var(--resume-ink-body);
  text-align: right;
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

.campus-summary {
  margin: var(--margin-top) var(--margin-right) var(--margin-bottom) var(--margin-left);
  color: var(--resume-ink-body);
  cursor: pointer;
}

.campus-sections {
  display: flex;
  flex-direction: column;
}

.campus-section {
  margin: var(--margin-top) var(--margin-right) var(--margin-bottom) var(--margin-left);
  cursor: pointer;
  scroll-margin-top: 12px;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 0 8px;
  padding: 4px 10px;
  background: color-mix(in srgb, var(--primary-color) 11%, var(--resume-paper));
  border-left: 3.5px solid var(--primary-color);
  font-size: calc(var(--font-size) + 1px);
  font-weight: 700;
  color: var(--primary-color);
  cursor: grab;
  break-after: avoid;
}

.section-en {
  font-size: 0.8em;
  font-weight: 500;
  letter-spacing: 0.08em;
  opacity: 0.8;
}

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.campus-entry {
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

.edu-school,
.entry-title {
  font-size: calc(var(--font-size) + 0.5px);
  color: var(--resume-ink-title);
}

.edu-major,
.entry-sub {
  color: var(--resume-ink-body);
}

.entry-tech {
  font-size: 0.9em;
  color: var(--resume-ink-soft);
}

.gpa-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: 3px;
  font-size: 0.85em;
  font-weight: 600;
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 16%, var(--resume-paper));
}

.entry-date {
  flex: 0 0 auto;
  font-size: 0.9em;
  color: var(--resume-ink-soft);
  white-space: nowrap;
}

.entry-desc {
  margin-top: 3px;
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
  font-size: 0.88em;
  color: var(--resume-ink-soft);
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
  .campus-template {
    min-height: 0;
    background: #fff;
  }
}
</style>
