<template>
  <div class="template-gallery">
    <TemplateGalleryHeader :can-apply-to-current="canApplyToCurrent" @back="handleBack" />

    <main class="template-gallery__content">
      <div class="template-gallery__inner">
        <TemplateGalleryToolbar
          :categories="categories"
          :active-category="activeCategory"
          :search="search"
          :sort-by="sortBy"
          @update:category="activeCategory = $event"
          @update:search="search = $event"
          @update:sort="sortBy = $event"
        />

        <div v-if="displayTemplates.length" class="template-gallery__grid">
          <TemplateCard
            v-for="template in displayTemplates"
            :key="template.id"
            :template="template"
            :demo-data="previewData"
            @preview="openPreview(template.id)"
          />
        </div>

        <el-empty
          v-else
          description="没有找到符合条件的模板，换个关键词或分类试试。"
          class="template-gallery__empty"
        />
      </div>
    </main>

    <TemplatePreviewDialog
      :visible="previewVisible"
      :template="selectedTemplate"
      :preview-data="previewData"
      :can-apply-to-current="canApplyToCurrent"
      @update:visible="previewVisible = $event"
      @create="createResumeFromTemplate"
      @apply="applyTemplateToCurrent"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useResumeStore } from '@/stores/resume';
import { useTemplateStore } from '@/stores/template';
import { useWorkbenchStore } from '@/stores/workbench';
import { templateDemoData as demoResumeData } from '@/data/template-demo';
import TemplateCard from '@/components/template-gallery/TemplateCard.vue';
import TemplateGalleryHeader from '@/components/template-gallery/TemplateGalleryHeader.vue';
import TemplateGalleryToolbar from '@/components/template-gallery/TemplateGalleryToolbar.vue';
import TemplatePreviewDialog from '@/components/template-gallery/TemplatePreviewDialog.vue';
import type { TemplateMetadata } from '@/types/resume';
import { buildTemplateResumeTitle, filterTemplates, sortTemplates, type TemplateSortKey } from '@/utils/template-gallery';
import { getTemplateUsageMap, markTemplateUsed } from '@/utils/template-usage';

const route = useRoute();
const router = useRouter();
const resumeStore = useResumeStore();
const templateStore = useTemplateStore();
const workbenchStore = useWorkbenchStore();

const { data } = storeToRefs(resumeStore);
const { templates } = storeToRefs(templateStore);

const previewVisible = ref(false);
const selectedTemplateId = ref<string>('');
const search = ref('');
const activeCategory = ref<TemplateMetadata['category'] | 'all'>('all');
const sortBy = ref<TemplateSortKey>('recommended');
const usageMap = ref<Record<string, number>>({});

const activeResumeId = computed(() =>
  typeof route.query.resumeId === 'string' ? route.query.resumeId : '',
);

const canApplyToCurrent = computed(() => Boolean(activeResumeId.value));
const previewData = computed(() => ({
  ...demoResumeData,
  templateId: selectedTemplate.value?.id || demoResumeData.templateId,
}));

const selectedTemplate = computed(
  () => templates.value.find((template) => template.id === selectedTemplateId.value) || null,
);

const categories = computed(() => [
  { value: 'all' as const, label: '全部' },
  ...templates.value.map((template) => ({
    value: template.category,
    label: template.categoryLabel,
  })),
].filter((item, index, items) => items.findIndex((current) => current.value === item.value) === index));

const displayTemplates = computed(() => {
  const filteredTemplates = filterTemplates(templates.value, {
    category: activeCategory.value,
    search: search.value,
  });
  return sortTemplates(filteredTemplates, sortBy.value, usageMap.value);
});

onMounted(async () => {
  usageMap.value = getTemplateUsageMap();

  if (activeResumeId.value && data.value.id !== activeResumeId.value) {
    try {
      await resumeStore.loadResume(activeResumeId.value);
    } catch (error) {
      ElMessage.error('当前简历加载失败: ' + (error instanceof Error ? error.message : '未知错误'));
      router.push('/');
    }
  }
});

const syncUsageMap = () => {
  usageMap.value = getTemplateUsageMap();
};

const openPreview = (templateId: string) => {
  selectedTemplateId.value = templateId;
  previewVisible.value = true;
};

const closeDialogs = () => {
  previewVisible.value = false;
};

const createResumeFromTemplate = async () => {
  if (!selectedTemplate.value) {
    return;
  }

  try {
    const template = selectedTemplate.value;
    const newId = await workbenchStore.createResume(
      buildTemplateResumeTitle(template.name, new Date()),
      template.id,
    );
    markTemplateUsed(template.id);
    syncUsageMap();
    closeDialogs();
    ElMessage.success('已创建新简历');
    router.push(`/editor/${newId}`);
  } catch (error) {
    ElMessage.error('创建失败: ' + (error instanceof Error ? error.message : '未知错误'));
  }
};

const applyTemplateToCurrent = async () => {
  if (!selectedTemplate.value || !activeResumeId.value) {
    return;
  }

  try {
    if (data.value.id !== activeResumeId.value) {
      await resumeStore.loadResume(activeResumeId.value);
    }
    resumeStore.setTemplate(selectedTemplate.value.id);
    markTemplateUsed(selectedTemplate.value.id);
    syncUsageMap();
    closeDialogs();
    ElMessage.success('模板已应用到当前简历');
    router.push(`/editor/${activeResumeId.value}`);
  } catch (error) {
    ElMessage.error('应用模板失败: ' + (error instanceof Error ? error.message : '未知错误'));
  }
};

const handleBack = () => {
  if (activeResumeId.value) {
    router.push(`/editor/${activeResumeId.value}`);
    return;
  }
  router.push('/');
};
</script>

<style scoped>
.template-gallery {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--ui-bg-page);
}

.template-gallery__content {
  padding: var(--ui-space-8) var(--ui-page-gutter) 48px;
}

.template-gallery__inner {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-6);
}

.template-gallery__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-6);
}

.template-gallery__empty {
  padding: 60px 0;
  border-radius: var(--ui-radius-lg);
  background: var(--ui-bg-surface);
}

@media (max-width: 1024px) {
  .template-gallery__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .template-gallery__content {
    padding: 20px var(--ui-page-gutter) 40px;
  }

  .template-gallery__grid {
    grid-template-columns: 1fr;
    gap: var(--ui-space-4);
  }
}
</style>
