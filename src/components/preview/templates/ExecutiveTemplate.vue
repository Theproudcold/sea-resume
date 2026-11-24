<template>
  <div
    class="executive-template"
    :style="{
      '--primary-color': data.theme?.color || '#b45309',
      '--font-size': (data.theme?.fontSize || 13.5) + 'px',
      '--line-height': data.theme?.lineHeight || 1.55,
      '--spacing': (data.theme?.moduleMargins?.bottom ?? 20) + 'px',
      '--page-pad': (data.theme?.pageMargins ?? 28) + 'px',
      fontSize: 'var(--font-size)',
      lineHeight: 'var(--line-height)',
      fontFamily: data.theme?.fontFamily || 'var(--resume-font-family)',
    }"
  >
    <div class="executive-topbar" aria-hidden="true" />
    <div class="executive-inner">
      <header class="executive-header" @click="setActiveSection('basic')">
        <div class="header-identity">
          <img
            v-if="data.basic.avatar"
            :src="data.basic.avatar"
            :alt="`${data.basic.name || '简历'}头像`"
            class="executive-avatar"
            :style="{ borderRadius: avatarBorderRadius(data.basic.avatarShape) }"
          />
          <div>
            <h1 class="executive-name">{{ data.basic.name || '您的姓名' }}</h1>
            <p v-if="data.basic.title" class="executive-role">{{ data.basic.title }}</p>
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

      <section
        v-if="data.basic.summary"
        class="executive-summary rich-text"
        @click.stop="setActiveSection('basic')"
        v-html="data.basic.summary"
      />

      <draggable
        v-model="sortedSections"
        class="executive-sections"
        :item-key="(section: string) => section"
        :animation="200"
        handle=".section-heading"
        group="executive-sections"
      >
        <template #item="{ element: section }">
          <section
            v-if="hasSectionContent(section)"
            class="executive-section"
            @click.stop="setActiveSection(section)"
          >
            <h2 class="section-heading">{{ getSectionTitle(section) }}</h2>

            <div v-if="section === 'experience'" class="entry-list">
              <article v-for="exp in visibleExperiences" :key="exp.id" class="executive-entry">
                <div class="entry-head">
                  <div class="entry-left">
                    <strong class="entry-company">{{ exp.company }}</strong>
                    <span v-if="exp.position" class="entry-pos">{{ exp.position }}</span>
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
              <article v-for="project in visibleProjects" :key="project.id" class="executive-entry">
                <div class="entry-head">
                  <div class="entry-left">
                    <strong class="entry-company">{{ project.name }}</strong>
                    <span v-if="project.role" class="entry-pos">{{ project.role }}</span>
                  </div>
                  <span class="entry-date">{{ formatDateRange(project.startDate, project.endDate, ' – ') }}</span>
                </div>
                <div v-if="project.description" class="entry-desc rich-text" v-html="project.description" />
                <div v-if="project.techStack?.length" class="entry-tech">
                  核心技术 / 领域：{{ project.techStack.join(' · ') }}
                </div>
                <a v-if="project.link" class="entry-link" :href="project.link" target="_blank" rel="noreferrer" @click.stop>{{ project.link }}</a>
              </article>
            </div>

            <div v-else-if="section === 'education'" class="edu-list">
              <article v-for="edu in visibleEducation" :key="edu.id" class="edu-entry">
                <div class="entry-head">
                  <div class="entry-left">
                    <strong class="entry-company">{{ edu.school }}</strong>
                    <span class="entry-sub">{{ [edu.major, edu.degree, edu.gpa ? `GPA ${edu.gpa}` : ''].filter(Boolean).join(' · ') }}</span>
                  </div>
                  <span class="entry-date">{{ formatDateRange(edu.startDate, edu.endDate, ' – ') }}</span>
                </div>
              </article>
            </div>

            <div v-else-if="section === 'skills'" class="skill-grid">
              <div v-for="skill in visibleSkills" :key="skill.id" class="skill-card">
                <strong class="skill-cat">{{ skill.category }}</strong>
                <div class="skill-items">{{ skill.items.join(' / ') }}</div>
              </div>
            </div>

            <div v-else-if="isCustomBlock(section)" class="entry-list">
              <template v-if="Array.isArray(getCustomContent(section))">
                <article v-for="item in getCustomItems(section)" :key="item.id" class="executive-entry">
                  <div class="entry-head">
                    <div class="entry-left">
                      <strong v-if="item.title" class="entry-company">{{ item.title }}</strong>
                      <span v-if="item.subtitle" class="entry-pos">{{ item.subtitle }}</span>
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
  formatDateRange,
  setActiveSection,
} = useResumeTemplate(props, { defaultDateFormat: 'YYYY.MM' });
</script>

<style scoped>
.executive-template {
  box-sizing: border-box;
  min-height: var(--a4-height);
  background: var(--resume-paper);
  color: var(--resume-ink);
}

.executive-topbar {
  height: 7px;
  background: linear-gradient(90deg, var(--resume-ink-strong) 0%, var(--resume-ink-heading) 68%, var(--primary-color) 68%, var(--primary-color) 100%);
}

.executive-inner {
  padding: var(--page-pad);
}

.executive-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  margin-bottom: 16px;
  cursor: pointer;
}

.header-identity {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.executive-avatar {
  width: 64px;
  height: 64px;
  flex: 0 0 64px;
  object-fit: cover;
}

.executive-name {
  margin: 0 0 4px;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--resume-ink-strong);
  line-height: 1.2;
}

.executive-role {
  margin: 0;
  font-size: calc(var(--font-size) + 1px);
  font-weight: 600;
  color: var(--primary-color);
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
  color: var(--resume-ink-heading);
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

.executive-summary {
  padding: 11px 14px;
  background: color-mix(in srgb, var(--primary-color) 9%, var(--resume-paper));
  border-left: 3.5px solid var(--primary-color);
  color: var(--resume-ink-body);
  margin-bottom: var(--spacing);
  cursor: pointer;
}

.executive-sections {
  display: flex;
  flex-direction: column;
  gap: var(--spacing);
}

.executive-section {
  cursor: pointer;
  scroll-margin-top: 12px;
}

.section-heading {
  margin: 0 0 10px;
  padding-left: 10px;
  border-left: 3.5px solid var(--resume-ink-strong);
  font-size: calc(var(--font-size) + 1.5px);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--resume-ink-title);
  cursor: grab;
  break-after: avoid;
}

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.executive-entry {
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--resume-rule);
  break-inside: avoid;
}

.executive-entry:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.entry-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 4px;
}

.entry-left {
  min-width: 0;
  overflow-wrap: anywhere;
}

.entry-company {
  font-size: calc(var(--font-size) + 1px);
  color: var(--resume-ink-title);
}

.entry-pos {
  margin-left: 8px;
  font-size: 0.94em;
  font-weight: 600;
  color: var(--primary-color);
}

.entry-sub {
  margin-left: 8px;
  font-size: 0.94em;
  color: var(--resume-ink-body);
}

.entry-date {
  flex: 0 0 auto;
  font-size: 0.9em;
  color: var(--resume-ink-soft);
  white-space: nowrap;
}

.entry-desc {
  color: var(--resume-ink);
  overflow-wrap: anywhere;
}

.highlight-list {
  margin: 5px 0 0;
  padding-left: 1.2em;
  color: var(--resume-ink);
}

.highlight-list li + li {
  margin-top: 3px;
}

.entry-tech {
  margin-top: 4px;
  font-size: 0.9em;
  color: var(--resume-ink-soft);
}

.entry-link {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.9em;
  color: var(--resume-ink-body);
}

.edu-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edu-entry {
  break-inside: avoid;
}

.skill-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.skill-card {
  padding: 9px 12px;
  background: var(--resume-hover);
  border: 1px solid var(--resume-rule);
  border-top: 2px solid var(--resume-ink-strong);
  break-inside: avoid;
}

.skill-cat {
  display: block;
  font-size: 0.94em;
  color: var(--resume-ink-title);
  margin-bottom: 3px;
}

.skill-items {
  font-size: 0.92em;
  color: var(--resume-ink-body);
  overflow-wrap: anywhere;
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
  .executive-template {
    min-height: 0;
    background: #fff;
  }
}
</style>
