<template>
  <div class="template-gallery">
    <AppHeader @export="() => {}" />

    <div class="gallery-container p-8">
      <div class="max-w-7xl mx-auto">
        <div class="mb-8 flex items-center gap-4">
          <h2 class="text-3xl font-bold text-gray-800">模板</h2>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div
            v-for="template in templates"
            :key="template.id"
            class="template-card bg-white rounded-xl overflow-hidden hover:shadow-xl transition-all duration-300 border border-gray-100"
          >
            <!-- Preview Image Area -->
            <div class="card-preview aspect-[210/297] bg-gray-50 relative group overflow-hidden border-b border-gray-100">
              <!-- Placeholder for Template Snapshot -->
              <div class="absolute inset-0 flex items-center justify-center bg-white">
                <img 
                  v-if="template.thumbnail" 
                  :src="template.thumbnail" 
                  class="w-full h-full object-cover" 
                  alt="Template Preview"
                />
                <div v-else class="text-center p-6">
                  <span class="text-6xl mb-4 block">📄</span>
                  <span class="text-gray-400 font-medium">{{ template.name }}</span>
                </div>
              </div>

              <!-- Hover Overlay with Buttons -->
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-[2px]">
                <el-button color="white" round @click="openPreview(template.id)">
                  预览
                </el-button>
                <el-button type="primary" round class="!bg-gray-900 !border-gray-900" @click="handleUseTemplate(template.id)">
                  使用此模板
                </el-button>
              </div>

              <!-- Top Right Badge -->
               <div class="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded text-xs font-medium text-gray-600 shadow-sm">
                 {{ template.name }}
               </div>
            </div>
            
            <!-- Removed bottom meta info to match the clean look in screenshot, 
                 or keep minimal if needed. The screenshot shows name inside the card on top right. 
                 Let's stick to the screenshot style. -->
          </div>
        </div>

        <div class="mt-12 text-center">
          <el-button @click="goToEditor" plain>返回编辑器</el-button>
        </div>
      </div>
    </div>

    <!-- Preview Modal (Placeholder) -->
    <el-dialog v-model="showPreview" :title="previewTemplateName" width="800px" align-center>
      <div class="h-[600px] bg-gray-100 flex items-center justify-center">
        <p class="text-gray-500">预览功能开发中...</p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useTemplateStore } from '@/stores/template';
import { useResumeStore } from '@/stores/resume';
import { useWorkbenchStore } from '@/stores/workbench';
import AppHeader from '@/components/common/AppHeader.vue';

const router = useRouter();
const templateStore = useTemplateStore();
const resumeStore = useResumeStore();
const workbenchStore = useWorkbenchStore();

const { templates } = storeToRefs(templateStore);
const { data } = storeToRefs(resumeStore);

const showPreview = ref(false);
const previewTemplateId = ref('');
const previewTemplateName = computed(() => {
  return templates.value.find(t => t.id === previewTemplateId.value)?.name || '';
});

const openPreview = (id: string) => {
  previewTemplateId.value = id;
  showPreview.value = true;
};

const handleUseTemplate = async (id: string) => {
  try {
    // Optimization: Don't switch live resume immediately which causes lag.
    // Instead, ask if they want to apply to current or create new.
    await ElMessageBox.confirm(
      '您想如何使用此模板？',
      '选择操作',
      {
        confirmButtonText: '创建新简历',
        cancelButtonText: '应用到当前简历',
        distinguishCancelAndClose: true,
        type: 'info',
      }
    ).then(async () => {
      // Create New
      const newId = await workbenchStore.createResume(`${data.value.basic.name || '我的'}简历 - ${new Date().toLocaleDateString()}`, id);
      // Wait a tick to ensure store updates if needed, though createResume returns id
      router.push(`/editor/${newId}`);
      ElMessage.success('已创建新简历');
    }).catch(async (action) => {
      if (action === 'cancel') {
         // Apply to Current
         resumeStore.setTemplate(id);
         ElMessage.success('已应用模板');
         router.push(`/editor/${data.value.id}`);
      }
    });
  } catch (e) {
    // Dialog closed
  }
};

const goToEditor = () => {
  router.push('/');
};
</script>

<style scoped>
.template-gallery {
  width: 100%;
  min-height: 100vh;
  background: #fff;
}

.gallery-container {
  width: 100%;
}
</style>
