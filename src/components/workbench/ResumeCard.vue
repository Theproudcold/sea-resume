<template>
  <article class="resume-card" :class="{ 'is-selected': selected }">
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
      <div ref="thumbnailRef" class="thumbnail" aria-hidden="true">
        <ResumeCoverPreview v-if="resumeData && coverVisible" :data="resumeData" />
        <div v-else class="placeholder" :class="{ 'is-loading': previewLoading || !coverVisible }" role="status">
          {{ previewLoading || !coverVisible ? '' : '封面暂不可用' }}
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
        <el-button text :icon="MoreFilled" :aria-label="`${resume.title}的操作菜单`" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="interview">
              <el-icon><ChatDotRound /></el-icon>
              模拟面试
            </el-dropdown-item>
            <el-dropdown-item command="rename">
              <el-icon><EditPen /></el-icon>
              重命名
            </el-dropdown-item>
            <el-dropdown-item command="duplicate">
              <el-icon><CopyDocument /></el-icon>
              复制
            </el-dropdown-item>
            <el-dropdown-item command="delete" divided class="danger-menu-item">
              <el-icon><Delete /></el-icon>
              删除
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { MoreFilled, EditPen, CopyDocument, Delete, ChatDotRound } from '@element-plus/icons-vue';
import type { ResumeData, ResumeMeta } from '@/types/resume';
import { storageManager } from '@/services/storage/StorageManager';
import ResumeCoverPreview from './ResumeCoverPreview.vue';
import { formatDate } from '@/utils/helpers';
import { useWhenVisible } from '@/composables/useWhenVisible';

const props = defineProps<{
  resume: ResumeMeta;
  selected?: boolean;
}>();

const emit = defineEmits<{
  click: [];
  edit: [];
  interview: [];
  rename: [];
  duplicate: [];
  delete: [];
}>();

const thumbnailRef = ref<HTMLElement | null>(null);
const coverVisible = useWhenVisible(thumbnailRef);
const resumeData = ref<ResumeData | null>(null);
const previewLoading = ref(false);
let previewReadGeneration = 0;

watch(() => [props.resume.id, props.resume.updatedAt, coverVisible.value] as const, async ([resumeId, , visible]) => {
  if (!visible) return;
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
    case 'interview':
      emit('interview');
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px;
  align-items: center;
  column-gap: var(--space-lg);
  border-bottom: var(--rule-hair) solid var(--color-rule);
  background: transparent;
  transition: background-color var(--dur-micro) var(--ease-out);
}

@media (hover: hover) {
  .resume-card:hover {
    background: var(--color-paper-3);
  }

  .resume-card:hover .thumbnail {
    border-color: var(--color-accent);
  }
}

.resume-card.is-selected {
  background: var(--color-accent-wash);
}

.card-content {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-lg);
  min-width: 0;
  padding: var(--space-md) 0 var(--space-md) var(--space-md);
  cursor: pointer;
}

.card-content:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: -2px;
}

.card-content:active .title {
  color: var(--color-accent);
}

.thumbnail {
  position: relative;
  width: 96px;
  aspect-ratio: 210 / 297;
  overflow: hidden;
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-s);
  background: var(--resume-paper);
  box-shadow: var(--shadow-card);
  transition: border-color var(--dur-micro) var(--ease-out);
}

.placeholder {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  padding: var(--space-xs);
  background: var(--color-paper-2);
  color: var(--color-muted);
  font-size: var(--text-xs);
  text-align: center;
}

.placeholder.is-loading {
  background: linear-gradient(90deg, var(--color-paper-2), var(--color-paper-3), var(--color-paper-2));
  background-size: 200% 100%;
  animation: cover-loading 1.2s ease-in-out infinite;
}

@keyframes cover-loading {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .placeholder.is-loading { animation: none; }
}

.info {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 10rem 8rem;
  align-items: center;
  gap: var(--space-lg);
  min-width: 0;
}

.title {
  max-width: none;
  margin: 0;
  overflow: hidden;
  color: var(--color-ink);
  font-size: var(--text-lg);
  font-weight: 600;
  letter-spacing: var(--tracking-display);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  display: contents;
}

.template,
.date {
  color: var(--color-ink-2);
  font-size: var(--text-sm);
  font-weight: 500;
}

.date {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.actions {
  display: flex;
  justify-content: center;
}

.actions :deep(.el-button) {
  width: 44px;
  height: 44px;
}

@media (max-width: 768px) {
  .card-content {
    grid-template-columns: 64px minmax(0, 1fr);
    gap: var(--space-md);
    padding-left: 0;
  }

  .thumbnail {
    width: 64px;
  }

  .info {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2xs);
  }

  .title {
    font-size: var(--text-md);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs) var(--space-md);
  }

  .date {
    text-align: left;
  }
}
</style>
