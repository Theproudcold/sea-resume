<template>
  <div class="layout-template" :class="`is-${recipe.paper}`" :style="sheetStyle">
    <header class="sheet-header" :class="headerClass">
      <img v-if="avatarFirst" :src="data.basic.avatar" alt="" class="avatar" :style="avatarStyle" />
      <div class="identity">
        <h1>{{ data.basic.name || '您的姓名' }}</h1>
        <p v-if="data.basic.title" class="headline">{{ data.basic.title }}</p>
        <div v-if="contactsInHeader" class="contacts">
          <template v-for="contact in contacts" :key="contact.key">
            <span><ContactIcon v-if="showIcons" :type="contact.type" :icon="contact.icon" />{{ contact.text }}</span>
          </template>
          <ResumeSmartFields :data="data" />
        </div>
      </div>
      <img v-if="avatarLast" :src="data.basic.avatar" alt="" class="avatar" :style="avatarStyle" />
    </header>

    <div class="sheet-body" :class="`is-${recipe.structure}`">
      <aside v-if="recipe.structure !== 'single'" class="sidebar" data-region="sidebar" :style="{ flexBasis: `${recipe.sidebarWidth}%` }">
        <section v-if="summaryInSidebar && data.basic.summary" class="summary" data-section="summary" @click="activate('basic')">
          <h2>个人简介</h2>
          <div class="rich-text" v-html="data.basic.summary" />
        </section>
        <section v-if="!contactsInHeader && contacts.length" class="summary" data-section="contacts">
          <h2>联系方式</h2>
          <div class="contacts contacts--stack">
            <span v-for="contact in contacts" :key="contact.key"><ContactIcon v-if="showIcons" :type="contact.type" :icon="contact.icon" />{{ contact.text }}</span>
          </div>
        </section>
        <draggable :model-value="sidebarIds" :item-key="sectionKey" handle=".section-title" :animation="200" @update:model-value="reorder(sidebarIds, $event)">
          <template #item="{ element }">
            <LayoutSection :id="element" :data="data" :heading="recipe.heading" @activate="activate" />
          </template>
        </draggable>
      </aside>

      <div class="main" data-region="main">
        <section v-if="summaryInMain && data.basic.summary" class="summary" data-section="summary" @click="activate('basic')">
          <div class="rich-text" v-html="data.basic.summary" />
        </section>
        <draggable :model-value="mainIds" :item-key="sectionKey" handle=".section-title" :animation="200" @update:model-value="reorder(mainIds, $event)">
          <template #item="{ element }">
            <LayoutSection :id="element" :data="data" :heading="recipe.heading" @activate="activate" />
          </template>
        </draggable>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import draggable from 'vuedraggable';
import type { LayoutRecipe } from '@/types/layout-template';
import type { ResumeData } from '@/types/resume';
import ContactIcon from '@/components/common/ContactIcon.vue';
import ResumeSmartFields from '@/components/preview/ResumeSmartFields.vue';
import { avatarBorderRadius } from '@/utils/avatarShape';
import { builtinToRecipe, readLayoutRecipe, reorderColumn, splitSections } from '@/utils/layout-template';
import { useResumeStore } from '@/stores/resume';
import LayoutSection from './LayoutSection.vue';

const props = defineProps<{ data: ResumeData }>();
const resumeStore = useResumeStore();

const recipe = computed<LayoutRecipe>(() => readLayoutRecipe(props.data.layout) ?? builtinToRecipe('modern', props.data.theme));
const columns = computed(() => splitSections(recipe.value, props.data.sectionOrder || [], props.data.hiddenSections || []));
const mainIds = computed(() => columns.value.main);
const sidebarIds = computed(() => columns.value.sidebar);
const single = computed(() => recipe.value.structure === 'single');
const summaryInSidebar = computed(() => !single.value && recipe.value.summaryPlacement === 'sidebar');
const summaryInMain = computed(() => recipe.value.summaryPlacement === 'main' || (single.value && recipe.value.summaryPlacement === 'sidebar'));
const contactsInHeader = computed(() => single.value || recipe.value.contactsPlacement === 'header');
const showIcons = computed(() => props.data.theme?.displayIcons !== false);
const avatarFirst = computed(() => !!props.data.basic.avatar && recipe.value.header.avatar === 'start');
const avatarLast = computed(() => !!props.data.basic.avatar && recipe.value.header.avatar === 'end');

const contacts = computed(() => {
  const basic = props.data.basic;
  return [
    basic.email ? { key: 'email', type: 'email' as const, icon: basic.iconOverrides?.email, text: basic.email } : null,
    basic.phone ? { key: 'phone', type: 'phone' as const, icon: basic.iconOverrides?.phone, text: basic.phone } : null,
    basic.location ? { key: 'location', type: 'location' as const, icon: basic.iconOverrides?.location, text: basic.location } : null,
    basic.website ? { key: 'website', type: 'website' as const, icon: basic.iconOverrides?.website, text: basic.website } : null,
    ...(basic.customContacts ?? []).filter((item) => item.label || item.value).map((item) => ({
      key: item.id, type: 'custom' as const, icon: item.icon, text: item.label ? `${item.label}：${item.value}` : item.value,
    })),
  ].filter((item) => item !== null);
});

const sheetStyle = computed(() => {
  const theme = props.data.theme;
  const tokens = recipe.value.tokens;
  const dark = recipe.value.paper === 'dark';
  return {
    '--accent': theme?.color || tokens.accent,
    '--ink': tokens.ink,
    '--muted': tokens.muted,
    '--sheet': dark ? '#18232d' : '#ffffff',
    '--font-size': `${theme?.fontSize || tokens.fontSize}px`,
    '--line-height': theme?.lineHeight || tokens.lineHeight,
    '--section-gap': `${theme?.moduleMargins?.bottom ?? tokens.moduleMargins.bottom}px`,
    '--page-margin': `${theme?.pageMargins ?? tokens.pageMargins}px`,
    padding: 'var(--page-margin)',
    fontFamily: theme?.fontFamily || tokens.fontFamily,
    fontSize: 'var(--font-size)',
    lineHeight: 'var(--line-height)',
    color: 'var(--ink)',
    background: 'var(--sheet)',
  };
});
const headerClass = computed(() => [
  `is-${recipe.value.header.variant}`,
  `align-${recipe.value.header.align}`,
  { 'has-fill': recipe.value.header.fill === 'accent' },
]);
const avatarStyle = computed(() => ({ borderRadius: avatarBorderRadius(props.data.basic.avatarShape) }));

const sectionKey = (id: string) => id;

function activate(id: string) {
  resumeStore.setActiveSection(id);
}
function reorder(column: string[], next: string[]) {
  resumeStore.updateSectionOrder(reorderColumn(props.data.sectionOrder || [], column, next));
}
</script>

<style scoped>
.layout-template { min-height: 100%; }
.sheet-header, .identity, .contacts, .contacts span { display: flex; align-items: center; gap: 8px 14px; }
.sheet-header { align-items: flex-start; margin-bottom: calc(var(--section-gap) * 0.8); }
.sheet-header.is-stacked { flex-direction: column; }
.sheet-header.align-center, .sheet-header.align-center .identity { align-items: center; text-align: center; }
.sheet-header.has-fill { margin: calc(var(--page-margin) * -1) calc(var(--page-margin) * -1) var(--section-gap); padding: var(--page-margin); background: var(--accent); color: #fff; }
.identity { min-width: 0; flex: 1; flex-direction: column; align-items: flex-start; gap: 4px; }
.identity h1 { margin: 0; font-size: 1.8em; line-height: 1.15; }
.headline { margin: 0; color: var(--accent); }
.has-fill .headline, .has-fill .contacts { color: inherit; }
.avatar { width: 76px; height: 76px; object-fit: cover; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 24%, var(--sheet)); }
.contacts { flex-wrap: wrap; color: var(--muted); font-size: 0.92em; }
.contacts--stack { flex-direction: column; align-items: flex-start; }
.sheet-body { display: flex; align-items: flex-start; gap: 22px; }
.sheet-body.is-sidebar-right { flex-direction: row-reverse; }
.sheet-body.is-single { display: block; }
.sidebar, .main { min-width: 0; }
.main { flex: 1; }
.summary { margin-bottom: var(--section-gap); }
.summary h2, :deep(.section-title) { margin: 0 0 0.45em; color: var(--ink); font-size: 1.05em; font-weight: 650; line-height: 1.3; }
:deep(.heading-underline), .summary h2 { border-bottom: 1.5px solid var(--accent); padding-bottom: 0.2em; }
:deep(.heading-accent) { color: var(--accent); border-bottom: 0; }
:deep(.heading-plain) { border-bottom: 0; }
:deep(.layout-section) { margin-bottom: var(--section-gap); }
:deep(.entry) { display: flex; justify-content: space-between; gap: 12px; }
:deep(.entry p), :deep(.rich-text) { margin: 0.2em 0 0; }
:deep(.when) { color: var(--muted); white-space: nowrap; }
</style>
