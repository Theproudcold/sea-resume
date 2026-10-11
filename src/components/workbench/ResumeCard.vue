<template>
  <el-card class="resume-card" :class="{ 'is-selected': selected }" shadow="hover">
    <div
      class="card-content"
      role="button"
      tabindex="0"
      :aria-label="`编辑简历：${resume.title}`"
      @click="$emit('click')"
      @keyup.enter="$emit('click')"
      @keydown.space.prevent="$event.preventDefault()"
      @keyup.space="$emit('click')"
    >
      <!-- 缩略图 -->
      <div class="thumbnail" aria-hidden="true">
        <ResumeCoverPreview v-if="resumeData" :data="resumeData" />
        <div v-else class="placeholder">
          {{ previewLoading ? '正在加载简历预览…' : '暂时无法显示预览' }}
        </div>
      </div>

      <!-- 信息 -->
      <div class="info">
        <h3 class="title">{{ resume.title }}</h3>
        <div class="meta">
          <span class="template">{{ templateName }}</span>
          <span class="date">{{ formattedDate }}</span>
        </div>
      </div>
    </div>

    <!-- 操作菜单 -->
    <div class="actions" @click.stop>
      <el-dropdown @command="handleCommand">
        <el-button text :icon="MoreFilled" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="edit">
              <el-icon><Edit /></el-icon>
              编辑
            </el-dropdown-item>
            <el-dropdown-item command="rename">
              <el-icon><EditPen /></el-icon>
              重命名
            </el-dropdown-item>
            <el-dropdown-item command="duplicate">
              <el-icon><CopyDocument /></el-icon>
              复制
            </el-dropdown-item>
            <el-dropdown-item command="delete" divided>
              <el-icon><Delete /></el-icon>
              删除
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { MoreFilled, Edit, EditPen, CopyDocument, Delete } from '@element-plus/icons-vue';
import type { ResumeData, ResumeMeta } from '@/types/resume';
import { storageManager } from '@/services/storage/StorageManager';
import ResumeCoverPreview from './ResumeCoverPreview.vue';
import { formatDate } from '@/utils/helpers';

const props = defineProps<{
  resume: ResumeMeta;
  selected?: boolean;
}>();

const emit = defineEmits<{
  click: [];
  edit: [];
  rename: [];
  duplicate: [];
  delete: [];
}>();

const resumeData = ref<ResumeData | null>(null);
const previewLoading = ref(false);
let previewReadGeneration = 0;

watch(() => [props.resume.id, props.resume.updatedAt] as const, async ([resumeId]) => {
  const generation = ++previewReadGeneration;
  resumeData.value = null;
  previewLoading.value = true;

  try {
    const loadedResume = await storageManager.read(resumeId);
    if (generation === previewReadGeneration) resumeData.value = loadedResume;
  } catch {
    if (generation === previewReadGeneration) resumeData.value = null;
  } finally {
    if (generation === previewReadGeneration) previewLoading.value = false;
  }
}, { immediate: true });

onBeforeUnmount(() => {
  previewReadGeneration++;
});

const templateName = computed(() => {
  const names: Record<string, string> = {
    modern: '现代简约',
    professional: '商务专业',
    creative: '创意设计',
    minimal: '极简主义',
    tech: '科技感',
  };
  return names[props.resume.templateId] || '未知模板';
});

const formattedDate = computed(() => {
  const date = new Date(props.resume.updatedAt);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return '今天';
  } else if (days === 1) {
    return '昨天';
  } else if (days < 7) {
    return `${days} 天前`;
  } else {
    return formatDate(date);
  }
});

const handleCommand = (command: string) => {
  switch (command) {
    case 'edit':
      emit('edit');
      break;
    case 'rename':
      emit('rename');
      break;
    case 'duplicate':
      emit('duplicate');
      break;
    case 'delete':
      emit('delete');
      break;
  }
};
</script>

<style scoped>
.resume-card {
  position: relative;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

@media (hover: hover) {
  .resume-card:hover {
    transform: translateY(-3px);
  }
}

.resume-card.is-selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.card-content:focus-visible {
  border-radius: var(--ui-radius-md);
}

.thumbnail {
  position: relative;
  width: 100%;
  aspect-ratio: 210 / 297;
  background: var(--ui-bg-subtle);
  border-radius: var(--ui-radius-md);
  overflow: hidden;
}

.placeholder {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  padding: var(--ui-space-4);
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-sm);
  text-align: center;
}

.info {
  flex: 1;
}

.title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 var(--ui-space-2) 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  display: flex;
  justify-content: space-between;
  gap: var(--ui-space-2);
  font-size: 13px;
  color: var(--ui-text-secondary);
}

.actions {
  position: absolute;
  top: 12px;
  right: 12px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.resume-card:hover .actions,
.resume-card:focus-within .actions {
  opacity: 1;
}

@media (hover: none) {
  .actions {
    opacity: 1;
  }
}
</style>
