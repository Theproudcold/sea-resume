<template>
  <div class="education-editor space-y-4">

    <div v-if="education.length === 0" class="resume-editor-empty">
      <el-icon :size="48"><School /></el-icon>
      <p class="mt-2">暂无教育背景，点击上方按钮添加</p>
    </div>

    <div v-for="(edu, index) in education" :key="edu.id" class="education-item resume-entry-card" :class="{ 'is-collapsed': isCollapsed(edu.id) }">
      <div class="resume-entry-card__header">
        <span class="text-sm text-gray-600">教育背景 {{ index + 1 }}</span>
        <div class="flex items-center gap-2">
          <el-button
            link
            :type="edu.visible === false ? 'info' : ''"
            :icon="edu.visible === false ? Hide : View"
            :aria-label="edu.visible === false ? '显示此教育经历' : '隐藏此教育经历'"
            :title="edu.visible === false ? '显示此教育经历' : '隐藏此教育经历'"
            @click="handleUpdate(edu.id, { visible: edu.visible === false })"
          />
          <el-button
            link
            :icon="isCollapsed(edu.id) ? ArrowDown : ArrowUp"
            :aria-expanded="!isCollapsed(edu.id)"
            :aria-label="isCollapsed(edu.id) ? '展开此教育经历' : '折叠此教育经历'"
            :title="isCollapsed(edu.id) ? '展开此教育经历' : '折叠此教育经历'"
            @click="toggleCollapsed(edu.id)"
          />
          <el-button type="danger" size="small" text @click="removeItem(edu.id)" :icon="Delete">删除</el-button>
        </div>
      </div>

      <SmoothCollapse><div v-show="!isCollapsed(edu.id)" class="education-item__body">
        <el-form label-position="top">
        <el-form-item label="学校名称" required>
          <el-input
            :model-value="edu.school"
            placeholder="学校名称"
            @update:model-value="(value: string) => handleUpdate(edu.id, { school: value })"
          />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="学历" required>
              <el-select
                :model-value="edu.degree"
                placeholder="请选择"
                @update:model-value="(value: string) => handleUpdate(edu.id, { degree: value })"
              >
                <el-option label="专科" value="专科" />
                <el-option label="本科" value="本科" />
                <el-option label="硕士" value="硕士" />
                <el-option label="博士" value="博士" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="专业" required>
              <el-input
                :model-value="edu.major"
                placeholder="专业名称"
                @update:model-value="(value: string) => handleUpdate(edu.id, { major: value })"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="入学时间">
              <el-date-picker
                :model-value="edu.startDate"
                type="month"
                placeholder="选择月份"
                format="YYYY-MM"
                value-format="YYYY-MM"
                @update:model-value="(value: string | null) => handleUpdate(edu.id, { startDate: value || '' })"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="毕业时间">
              <el-date-picker
                :model-value="edu.endDate"
                type="month"
                placeholder="选择月份"
                format="YYYY-MM"
                value-format="YYYY-MM"
                @update:model-value="(value: string | null) => handleUpdate(edu.id, { endDate: value || '' })"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="GPA / 绩点（选填）">
          <el-input
            :model-value="edu.gpa"
            placeholder="例如：3.8/4.0"
            @update:model-value="(value: string) => handleUpdate(edu.id, { gpa: value })"
          />
        </el-form-item>
      </el-form>

        <el-divider v-if="index < education.length - 1" />
      </div></SmoothCollapse>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { Delete, School, Hide, View, ArrowDown, ArrowUp } from '@element-plus/icons-vue';
import type { Education } from '@/types/resume';
import SmoothCollapse from '@/components/common/SmoothCollapse.vue';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const education = computed(() => data.value.education);
const collapsedIds = ref<string[]>([]);

const isCollapsed = (id: string) => collapsedIds.value.includes(id);

const toggleCollapsed = (id: string) => {
  collapsedIds.value = isCollapsed(id)
    ? collapsedIds.value.filter(itemId => itemId !== id)
    : [...collapsedIds.value, id];
};


const addNew = () => {
  resumeStore.addEducation({
    school: '',
    degree: '',
    major: '',
    startDate: '',
    endDate: '',
  });
};

const removeItem = (id: string) => {
  resumeStore.removeEducation(id);
};

const handleUpdate = (id: string, updates: Partial<Education>) => {
  resumeStore.updateEducation(id, updates);
};
defineExpose({ addNew });
</script>
