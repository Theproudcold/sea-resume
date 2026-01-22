<template>
  <el-card class="resume-card" :class="{ 'is-selected': selected }" shadow="hover">
    <div class="card-content" @click="$emit('click')">
      <!-- 缩略图 -->
      <div class="thumbnail">
        <div class="placeholder">
          <el-icon :size="48"><Document /></el-icon>
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
import { computed } from 'vue';
import { Document, MoreFilled, Edit, EditPen, CopyDocument, Delete } from '@element-plus/icons-vue';
import type { ResumeMeta } from '@/types/resume';
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
  transition: all 0.3s ease;
}

.resume-card:hover {
  transform: translateY(-4px);
}

.resume-card.is-selected {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.thumbnail {
  width: 100%;
  aspect-ratio: 210 / 297; /* A4 比例 */
  background: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder {
  color: #ccc;
}

.info {
  flex: 1;
}

.title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #666;
}

.actions {
  position: absolute;
  top: 12px;
  right: 12px;
  opacity: 0;
  transition: opacity 0.2s;
}

.resume-card:hover .actions {
  opacity: 1;
}
</style>
