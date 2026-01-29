<template>
  <div class="editor-view">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-wrapper">
      <el-icon class="is-loading" :size="48"><Loading /></el-icon>
      <p class="mt-4">加载简历中...</p>
    </div>

    <!-- 编辑器主体 -->
    <template v-else>
      <AppHeader @export="handleExport" @back="handleBack" @fullscreen="showFullscreen = true" />

      <!-- 移动端 Tab 切换 -->
      <div class="mobile-tabs lg:hidden">
        <el-radio-group v-model="activeTab" class="w-full">
          <el-radio-button value="edit" class="w-1/2">编辑</el-radio-button>
          <el-radio-button value="preview" class="w-1/2">预览</el-radio-button>
        </el-radio-group>
      </div>

      <div class="editor-container">
        <EditorPanel class="no-print" :class="{ 'mobile-hidden': activeTab === 'preview' }" />
        <PreviewPanel :class="{ 'mobile-hidden': activeTab === 'edit' }" />
      </div>

      <!-- 全屏预览对话框 -->
      <el-dialog
        v-model="showFullscreen"
        title="全屏预览"
        fullscreen
        :show-close="true"
        class="fullscreen-dialog"
      >
        <div class="fullscreen-preview">
          <ResumeCanvas>
            <component :is="currentTemplate" v-if="currentTemplate" :data="data" />
          </ResumeCanvas>
        </div>
      </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, defineAsyncComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElLoading } from 'element-plus';
import { Loading } from '@element-plus/icons-vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import AppHeader from '@/components/common/AppHeader.vue';
import EditorPanel from '@/components/editor/EditorPanel.vue';
import PreviewPanel from '@/components/preview/PreviewPanel.vue';
import ResumeCanvas from '@/components/preview/ResumeCanvas.vue';
import { exportToPDF } from '@/utils/export-pdf';
import { exportToImage } from '@/utils/export-image';
import { exportToJSON } from '@/utils/export-json';

const route = useRoute();
const router = useRouter();
const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const loading = ref(true);
const showFullscreen = ref(false);
const activeTab = ref<'edit' | 'preview'>('edit');

// 模板组件映射
const templateComponents: Record<string, any> = {
  modern: defineAsyncComponent(() => import('@/components/preview/templates/ModernTemplate.vue')),
  professional: defineAsyncComponent(() => import('@/components/preview/templates/ProfessionalTemplate.vue')),
  creative: defineAsyncComponent(() => import('@/components/preview/templates/CreativeTemplate.vue')),
  minimal: defineAsyncComponent(() => import('@/components/preview/templates/MinimalTemplate.vue')),
  tech: defineAsyncComponent(() => import('@/components/preview/templates/TechTemplate.vue')),
};

const currentTemplate = computed(() => {
  return templateComponents[data.value.templateId];
});

onMounted(async () => {
  const id = route.params.id as string;

  if (!id) {
    ElMessage.error('简历 ID 不存在');
    router.push('/');
    return;
  }

  try {
    await resumeStore.loadResume(id);
  } catch (error) {
    ElMessage.error('加载简历失败: ' + (error instanceof Error ? error.message : '未知错误'));
    router.push('/');
  } finally {
    loading.value = false;
  }
});

const handleBack = () => {
  router.push('/');
};

const handleExport = async (type: 'pdf' | 'image' | 'json' | 'print') => {
  const loadingInstance = ElLoading.service({
    lock: true,
    text: '正在导出...',
    background: 'rgba(0, 0, 0, 0.7)',
  });

  const filename = data.value.title || data.value.basic.name || 'resume';

  try {
    switch (type) {
      case 'pdf':
        await exportToPDF('resume-canvas', filename);
        ElMessage.success('PDF 导出成功！');
        break;
      case 'image':
        await exportToImage('resume-canvas', filename, 'png');
        ElMessage.success('图片导出成功！');
        break;
      case 'json':
        exportToJSON(data.value, filename);
        ElMessage.success('JSON 导出成功！');
        break;
      case 'print':
        loadingInstance.close();
        window.print();
        return;
    }
  } catch (error) {
    console.error('导出失败:', error);
    ElMessage.error('导出失败，请重试');
  } finally {
    loadingInstance.close();
  }
};
</script>

<style scoped>
.editor-view {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.loading-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: #999;
}

.editor-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.mobile-tabs {
  background: white;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
}

.mobile-tabs :deep(.el-radio-group) {
  display: flex;
  width: 100%;
}

.mobile-tabs :deep(.el-radio-button) {
  flex: 1;
}

.mobile-tabs :deep(.el-radio-button__inner) {
  width: 100%;
}

@media (max-width: 1024px) {
  .editor-container {
    flex-direction: column;
  }

  .mobile-hidden {
    display: none !important;
  }
}

@media print {
  .editor-view {
    height: auto;
  }

  .editor-container {
    display: block;
  }
}

.fullscreen-preview {
  height: 100%;
  overflow-y: auto;
  background: #f5f5f5;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 20px;
}

:deep(.fullscreen-dialog .el-dialog__body) {
  padding: 0;
  height: calc(100vh - 54px);
}

</style>
