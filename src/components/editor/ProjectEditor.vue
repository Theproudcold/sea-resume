<template>
  <div class="project-editor">

    <div v-if="projects.length === 0" class="resume-editor-empty">
      <el-icon :size="48"><Folder /></el-icon>
      <p class="mt-2">暂无项目经验，点击上方按钮添加</p>
    </div>

    <div v-for="(project, index) in projects" :key="project.id" class="project-item resume-entry-card" :class="{ 'is-collapsed': isProjectCollapsed(project.id) }">
      <div class="resume-entry-card__header">
        <span class="project-item__title">项目经验 {{ index + 1 }}</span>
        <div class="project-item__actions flex items-center gap-1">
          <el-button
            link
            :type="project.visible === false ? 'info' : ''"
            :icon="project.visible === false ? Hide : View"
            :aria-label="project.visible === false ? '显示此项目' : '隐藏此项目'"
            :title="project.visible === false ? '显示此项目' : '隐藏此项目'"
            @click="updateItem(project.id, { visible: project.visible === false })"
          />
          <el-button
            link
            :icon="isProjectCollapsed(project.id) ? ArrowDown : ArrowUp"
            :aria-expanded="!isProjectCollapsed(project.id)"
            :aria-label="isProjectCollapsed(project.id) ? '展开此项目' : '折叠此项目'"
            :title="isProjectCollapsed(project.id) ? '展开此项目' : '折叠此项目'"
            @click="toggleProjectCollapsed(project.id)"
          />
          <el-button
            type="danger"
            size="small"
            text
            @click="removeItem(project.id)"
            :icon="Delete"
          >
            删除
          </el-button>
        </div>
      </div>

      <div v-show="!isProjectCollapsed(project.id)" class="project-item__body">
        <el-form label-width="84px" size="default">
          <el-form-item label="项目名称">
            <el-input
              v-model="project.name"
              placeholder="例如：电商平台前端开发"
              @change="updateItem(project.id, { name: project.name })"
            />
          </el-form-item>

          <el-form-item label="项目角色">
            <el-input
              v-model="project.role"
              placeholder="例如：前端负责人"
              @change="updateItem(project.id, { role: project.role })"
            />
          </el-form-item>

          <el-form-item label="项目时间">
            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-end">
                <el-checkbox
                  v-model="isPresentEnd[index]"
                  @change="(val: any) => handlePresentChange(project.id, index, val)"
                  label="至今"
                  size="small"
                />
              </div>
              <!-- Range Picker (When NOT Present) -->
              <el-date-picker
                v-if="!isPresentEnd[index]"
                :model-value="[project.startDate, project.endDate]"
                type="monthrange"
                range-separator="至"
                start-placeholder="开始月份"
                end-placeholder="结束月份"
                format="YYYY-MM"
                value-format="YYYY-MM"
                class="!w-full"
                @update:model-value="(val: [string, string] | null) => handleRangeUpdate(project.id, val)"
              />

              <!-- Start Date Only (When Present) -->
              <el-date-picker
                v-else
                v-model="project.startDate"
                type="month"
                placeholder="开始月份"
                format="YYYY-MM"
                value-format="YYYY-MM"
                class="!w-full"
                @change="updateItem(project.id, { startDate: project.startDate })"
              />
            </div>
          </el-form-item>

          <el-form-item label="项目描述">
            <RichTextEditor
              v-model="project.description"
              class="project-item__editor"
              @update:modelValue="(val: string) => updateItem(project.id, { description: val })"
            />
          </el-form-item>

          <el-form-item label="项目链接">
            <el-input
              v-model="project.link"
              placeholder="项目演示地址或代码仓库（选填）"
              @change="updateItem(project.id, { link: project.link })"
            />
          </el-form-item>

          <el-form-item label="技术栈">
            <el-select
              v-model="project.techStack"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="选择或输入技术栈，按回车添加"
              @change="updateItem(project.id, { techStack: project.techStack })"
            >
              <el-option
                v-for="tech in commonTechStack"
                :key="tech"
                :label="tech"
                :value="tech"
              />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { Delete, Folder, Hide, View, ArrowDown, ArrowUp } from '@element-plus/icons-vue';
import type { Project } from '@/types/resume';
import RichTextEditor from '@/components/common/RichTextEditor.vue';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const projects = ref<Project[]>(JSON.parse(JSON.stringify(data.value.projects)));
const collapsedProjectIds = ref<string[]>([]);
const isPresentEnd = ref<boolean[]>([]);

const isProjectCollapsed = (id: string) => collapsedProjectIds.value.includes(id);

const toggleProjectCollapsed = (id: string) => {
  collapsedProjectIds.value = isProjectCollapsed(id)
    ? collapsedProjectIds.value.filter(projectId => projectId !== id)
    : [...collapsedProjectIds.value, id];
};

// 常用技术栈选项
const commonTechStack = [
  'Vue.js', 'React', 'Angular', 'TypeScript', 'JavaScript',
  'Node.js', 'Express', 'Koa', 'Nest.js',
  'Webpack', 'Vite', 'Rollup',
  'Tailwind CSS', 'Element Plus', 'Ant Design',
  'MySQL', 'MongoDB', 'Redis',
  'Docker', 'Kubernetes', 'CI/CD',
];

watch(() => data.value.projects, (newVal) => {
  projects.value = JSON.parse(JSON.stringify(newVal));
  updatePresentFlags();
}, { deep: true });

const updatePresentFlags = () => {
  isPresentEnd.value = projects.value.map(p => p.endDate === 'present');
};

const addNew = () => {
  resumeStore.addProject({
    name: '',
    role: '',
    startDate: '',
    endDate: 'present',
    description: '',
    link: '',
    techStack: [],
  });
  updatePresentFlags();
};

const removeItem = (id: string) => {
  resumeStore.removeProject(id);
};

const updateItem = (id: string, updates: Partial<Project>) => {
  resumeStore.updateProject(id, updates);
};

  const handlePresentChange = (id: string, index: number, isPresent: any) => {
  // isPresent is the new boolean value from checkbox
  const endDate = isPresent ? 'present' : '';
  const project = projects.value[index];
  if (project) {
    project.endDate = endDate;
    updateItem(id, { endDate });
  }
};

const handleRangeUpdate = (id: string, val: any) => {
  if (!val || !Array.isArray(val)) {
    // Cleared
    updateItem(id, { startDate: '', endDate: '' });
    return;
  }
  const [start, end] = val;
  updateItem(id, { startDate: start, endDate: end });
};

// 初始化
updatePresentFlags();
defineExpose({ addNew });
</script>

<style scoped>
.project-editor {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.project-item.resume-entry-card {
  margin: 0;
}

.project-item__title {
  color: var(--ui-text-main);
  font-size: 15px;
  font-weight: 600;
}

.project-item__actions {
  flex-shrink: 0;
}

.project-item__body {
  padding-top: 12px;
}

.project-item__body :deep(.el-form-item) {
  margin-bottom: 16px;
}

.project-item__body :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.project-item__body :deep(.project-item__editor .ql-container) {
  height: 160px;
}

.project-item__body :deep(.project-item__editor .ql-editor) {
  min-height: 120px;
}

@media (max-width: 560px) {
  .resume-entry-card__header {
    align-items: flex-start;
  }

  .project-item__actions :deep(.el-button) {
    margin-left: 4px;
  }
}
</style>
