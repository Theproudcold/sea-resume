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
            :demo-data="cardPreviewData(template)"
            @preview="openPreview(template.id)"
            @rename="renameCustomTemplate(template.id)"
            @remove="removeCustomTemplate(template.id)"
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
import { ElMessage, ElMessageBox } from 'element-plus';
import { useResumeStore } from '@/stores/resume';
import { useTemplateStore } from '@/stores/template';
import { useWorkbenchStore } from '@/stores/workbench';
import { templateDemoData as demoResumeData } from '@/data/template-demo';
import TemplateCard from '@/components/template-gallery/TemplateCard.vue';
import TemplateGalleryHeader from '@/components/template-gallery/TemplateGalleryHeader.vue';
import TemplateGalleryToolbar from '@/components/template-gallery/TemplateGalleryToolbar.vue';
import TemplatePreviewDialog from '@/components/template-gallery/TemplatePreviewDialog.vue';
import type { TemplateMetadata } from '@/types/resume';
import { resumeFromCustomTemplate } from '@/utils/custom-template';
import { buildTemplateResumeTitle, filterTemplates, sortTemplates, type TemplateSortKey } from '@/utils/template-gallery';
import { getTemplateUsageMap, markTemplateUsed } from '@/utils/template-usage';
import { describeError } from '@/utils/globalErrorReporting';

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

const cardPreviewData = (template: TemplateMetadata) => {
  if (template.source !== 'custom') {
    return { ...demoResumeData, templateId: template.id };
  }
  const custom = templateStore.findCustomTemplate(template.id);
  return custom ? resumeFromCustomTemplate(custom) : { ...demoResumeData, templateId: 'modern' };
};

const previewData = computed(() => {
  const template = selectedTemplate.value;
  if (!template) return { ...demoResumeData };
  return cardPreviewData(template);
});

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
  try {
    templateStore.loadCustomTemplates();
  } catch (error) {
    ElMessage.error(describeError(error));
  }
  usageMap.value = getTemplateUsageMap();

  if (activeResumeId.value && data.value.id !== activeResumeId.value) {
    try {
      await resumeStore.loadResume(activeResumeId.value);
    } catch (error) {
      ElMessage.error('当前简历加载失败: ' + (describeError(error)));
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
    const custom = template.source === 'custom' ? templateStore.findCustomTemplate(template.id) : undefined;
    const newId = custom
      ? await workbenchStore.createResumeFromData(
        resumeFromCustomTemplate(custom),
        buildTemplateResumeTitle(template.name, new Date()),
        custom.baseTemplateId,
      )
      : await workbenchStore.createResume(
        buildTemplateResumeTitle(template.name, new Date()),
        template.id,
      );
    markTemplateUsed(template.id);
    syncUsageMap();
    closeDialogs();
    ElMessage.success('已创建新简历');
    router.push(`/editor/${newId}`);
  } catch (error) {
    ElMessage.error('创建失败: ' + (describeError(error)));
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
    const template = selectedTemplate.value;
    const custom = template.source === 'custom' ? templateStore.findCustomTemplate(template.id) : undefined;
    if (custom) {
      resumeStore.applyTemplateSnapshot(resumeFromCustomTemplate(custom));
    } else {
      resumeStore.setTemplate(template.id);
    }
    markTemplateUsed(template.id);
    syncUsageMap();
    closeDialogs();
    ElMessage.success('模板已应用到当前简历');
    router.push(`/editor/${activeResumeId.value}`);
  } catch (error) {
    ElMessage.error('应用模板失败: ' + (describeError(error)));
  }
};

const renameCustomTemplate = async (templateId: string) => {
  const template = templateStore.findCustomTemplate(templateId);
  if (!template) return;
  try {
    const { value } = await ElMessageBox.prompt('给这个模板起个新名字。', '重命名模板', {
      inputValue: template.name,
      inputValidator: (input) => input.trim() ? true : '请填写模板名称',
      confirmButtonText: '保存',
      cancelButtonText: '取消',
    });
    templateStore.renameCustomTemplate(templateId, value);
    ElMessage.success('模板已重命名');
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(describeError(error));
  }
};

const removeCustomTemplate = async (templateId: string) => {
  const template = templateStore.findCustomTemplate(templateId);
  if (!template) return;
  try {
    await ElMessageBox.confirm(
      `删除「${template.name}」后，已经用它创建的简历不会受影响。`,
      '删除自定义模板',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    );
    templateStore.deleteCustomTemplate(templateId);
    if (selectedTemplateId.value === templateId) closeDialogs();
    ElMessage.success('模板已删除');
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(describeError(error));
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
  background: var(--color-paper);
}

.template-gallery__content {
  padding: var(--space-xl) var(--ui-page-gutter) var(--space-2xl);
}

.template-gallery__inner {
  display: flex;
  max-width: var(--ui-content-max-width);
  flex-direction: column;
  gap: var(--space-lg);
  margin: 0 auto;
}

.template-gallery__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-lg);
}

.template-gallery__empty {
  padding: var(--space-2xl) 0;
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper-3);
}

@media (max-width: 1024px) {
  .template-gallery__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .template-gallery__content {
    padding: var(--space-lg) var(--ui-page-gutter) var(--space-xl);
  }

  .template-gallery__grid {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-md);
  }
}
</style>
