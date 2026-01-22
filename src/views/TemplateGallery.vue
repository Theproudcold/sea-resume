<template>
  <div class="template-gallery">
    <AppHeader @export="() => {}" />

    <div class="gallery-container p-8">
      <div class="max-w-6xl mx-auto">
        <div class="mb-8">
          <h2 class="text-3xl font-bold text-gray-800 mb-2">选择简历模板</h2>
          <p class="text-gray-600">选择一个适合你的模板开始制作简历</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="template in templates"
            :key="template.id"
            class="template-card cursor-pointer"
            :class="{ active: template.id === currentTemplateId }"
            @click="selectTemplate(template.id)"
          >
            <div class="card-preview h-64 bg-gray-100 rounded-t-lg flex items-center justify-center">
              <span class="text-6xl">📄</span>
            </div>
            <div class="card-info p-4">
              <h3 class="font-semibold text-lg mb-1">{{ template.name }}</h3>
              <p class="text-sm text-gray-600">{{ template.description }}</p>
              <el-button
                v-if="template.id === currentTemplateId"
                type="primary"
                size="small"
                class="mt-3"
                @click.stop="goToEditor"
              >
                当前模板 - 开始编辑
              </el-button>
              <el-button
                v-else
                size="small"
                class="mt-3"
                @click.stop="selectTemplate(template.id)"
              >
                使用此模板
              </el-button>
            </div>
          </div>
        </div>

        <div class="mt-8 text-center">
          <el-button @click="goToEditor">返回编辑器</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useTemplateStore } from '@/stores/template';
import { useResumeStore } from '@/stores/resume';
import AppHeader from '@/components/common/AppHeader.vue';

const router = useRouter();
const templateStore = useTemplateStore();
const resumeStore = useResumeStore();

const { templates } = storeToRefs(templateStore);
const { data } = storeToRefs(resumeStore);

const currentTemplateId = computed(() => data.value.templateId);

const selectTemplate = (id: string) => {
  resumeStore.setTemplate(id);
  ElMessage.success(`已切换到「${templates.value.find(t => t.id === id)?.name}」模板`);
};

const goToEditor = () => {
  router.push('/');
};
</script>

<script lang="ts">
import { computed } from 'vue';
export default {
  name: 'TemplateGallery',
};
</script>

<style scoped>
.template-gallery {
  width: 100%;
  min-height: 100vh;
  background: #f5f5f5;
}

.gallery-container {
  width: 100%;
}

.template-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.template-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.template-card.active {
  border-color: #3b82f6;
}

.card-preview {
  position: relative;
}
</style>
