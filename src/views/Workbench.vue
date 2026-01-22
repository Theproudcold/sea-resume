<template>
  <div class="workbench-view">
    <!-- 头部 -->
    <div class="workbench-header">
      <div class="header-content">
        <div class="logo-section">
          <div class="logo">
            <span class="logo-icon">简</span>
          </div>
          <div>
            <h1 class="title">简历工作台</h1>
            <p class="subtitle">Sea Resume</p>
          </div>
        </div>

        <div class="actions">
          <el-button :icon="Setting" @click="showSettings = true">设置</el-button>
          <el-button type="primary" :icon="Plus" @click="showCreateDialog = true">
            新建简历
          </el-button>
        </div>
      </div>
    </div>

    <!-- 主内容 -->
    <div class="workbench-content">
      <el-container>
        <!-- 简历列表 -->
        <div v-if="loading" class="loading-state">
          <el-icon class="is-loading" :size="48"><Loading /></el-icon>
          <p>加载中...</p>
        </div>

        <el-empty v-else-if="!hasResumes" description="还没有简历，创建第一份吧！">
          <el-button type="primary" :icon="Plus" @click="showCreateDialog = true">
            新建简历
          </el-button>
        </el-empty>

        <div v-else class="resume-grid">
          <ResumeCard
            v-for="resume in resumeList"
            :key="resume.id"
            :resume="resume"
            @click="handleCardClick(resume.id)"
            @edit="handleEdit(resume.id)"
            @rename="handleRename(resume)"
            @duplicate="handleDuplicate(resume.id)"
            @delete="handleDelete(resume)"
          />
        </div>
      </el-container>
    </div>

    <!-- 创建简历对话框 -->
    <el-dialog v-model="showCreateDialog" title="新建简历" width="500px">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="简历名称">
          <el-input
            v-model="createForm.title"
            placeholder="例如：前端工程师简历"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="选择模板">
          <el-select v-model="createForm.templateId" placeholder="选择模板">
            <el-option label="现代简约" value="modern" />
            <el-option label="商务专业" value="professional" />
            <el-option label="创意设计" value="creative" />
            <el-option label="极简主义" value="minimal" />
            <el-option label="科技感" value="tech" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="creating">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 重命名对话框 -->
    <el-dialog v-model="showRenameDialog" title="重命名简历" width="400px">
      <el-input
        v-model="renameForm.title"
        placeholder="输入新名称"
        maxlength="50"
        show-word-limit
        @keyup.enter="confirmRename"
      />
      <template #footer>
        <el-button @click="showRenameDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmRename" :loading="renaming">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Setting, Loading } from '@element-plus/icons-vue';
import { useWorkbenchStore } from '@/stores/workbench';
import { useStorageStore } from '@/stores/storage';
import ResumeCard from '@/components/workbench/ResumeCard.vue';
import type { ResumeMeta } from '@/types/resume';

const router = useRouter();
const workbenchStore = useWorkbenchStore();
const storageStore = useStorageStore();

const loading = ref(false);
const showCreateDialog = ref(false);
const showRenameDialog = ref(false);
const showSettings = ref(false);
const creating = ref(false);
const renaming = ref(false);

const createForm = ref({
  title: '',
  templateId: 'modern',
});

const renameForm = ref({
  id: '',
  title: '',
});

const resumeList = computed(() => workbenchStore.resumeList);
const hasResumes = computed(() => workbenchStore.hasResumes);

onMounted(async () => {
  loading.value = true;
  try {
    // 初始化存储
    await storageStore.init();
    // 加载简历列表
    await workbenchStore.init();
  } catch (error) {
    ElMessage.error('加载失败: ' + (error instanceof Error ? error.message : '未知错误'));
  } finally {
    loading.value = false;
  }
});

const handleCardClick = (id: string) => {
  router.push(`/editor/${id}`);
};

const handleEdit = (id: string) => {
  router.push(`/editor/${id}`);
};

const handleCreate = async () => {
  if (!createForm.value.title.trim()) {
    ElMessage.warning('请输入简历名称');
    return;
  }

  creating.value = true;
  try {
    const id = await workbenchStore.createResume(
      createForm.value.title,
      createForm.value.templateId
    );
    ElMessage.success('创建成功');
    showCreateDialog.value = false;
    createForm.value = { title: '', templateId: 'modern' };
    router.push(`/editor/${id}`);
  } catch (error) {
    ElMessage.error('创建失败: ' + (error instanceof Error ? error.message : '未知错误'));
  } finally {
    creating.value = false;
  }
};

const handleRename = (resume: ResumeMeta) => {
  renameForm.value = {
    id: resume.id,
    title: resume.title,
  };
  showRenameDialog.value = true;
};

const confirmRename = async () => {
  if (!renameForm.value.title.trim()) {
    ElMessage.warning('请输入新名称');
    return;
  }

  renaming.value = true;
  try {
    await workbenchStore.renameResume(renameForm.value.id, renameForm.value.title);
    ElMessage.success('重命名成功');
    showRenameDialog.value = false;
  } catch (error) {
    ElMessage.error('重命名失败: ' + (error instanceof Error ? error.message : '未知错误'));
  } finally {
    renaming.value = false;
  }
};

const handleDuplicate = async (id: string) => {
  try {
    const newId = await workbenchStore.duplicateResume(id);
    ElMessage.success('复制成功');
    router.push(`/editor/${newId}`);
  } catch (error) {
    ElMessage.error('复制失败: ' + (error instanceof Error ? error.message : '未知错误'));
  }
};

const handleDelete = async (resume: ResumeMeta) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除「${resume.title}」吗？此操作不可恢复。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    );

    await workbenchStore.deleteResume(resume.id);
    ElMessage.success('删除成功');
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }
};
</script>

<style scoped>
.workbench-view {
  width: 100%;
  min-height: 100vh;
  background: #f5f5f5;
}

.workbench-header {
  background: white;
  border-bottom: 1px solid #e5e7eb;
  padding: 20px 0;
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-icon {
  color: white;
  font-size: 24px;
  font-weight: bold;
}

.title {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: #1f2937;
}

.subtitle {
  font-size: 13px;
  color: #6b7280;
  margin: 0;
}

.actions {
  display: flex;
  gap: 12px;
}

.workbench-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px 24px;
}

.loading-state {
  text-align: center;
  padding: 80px 20px;
  color: #999;
}

.loading-state p {
  margin-top: 16px;
  font-size: 14px;
}

.resume-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
}

@media (max-width: 768px) {
  .resume-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
  }

  .workbench-content {
    padding: 20px 16px;
  }
}
</style>
