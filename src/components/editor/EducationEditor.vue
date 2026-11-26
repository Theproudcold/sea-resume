<template>
  <div class="education-editor">

    <div v-if="education.length === 0" class="resume-editor-empty">
      <el-icon :size="24" aria-hidden="true"><School /></el-icon>
      <p>添加教育背景</p>
    </div>

    <div v-for="(edu, index) in education" :key="edu.id" class="education-item resume-entry-card" :class="{ 'is-collapsed': isCollapsed(edu.id) }" :data-entry-id="edu.id">
      <div class="resume-entry-card__header">
        <span>教育背景 {{ index + 1 }}</span>
        <div class="flex items-center gap-1">
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
          <EntryDeleteButton :label="edu.school.trim() || '未命名教育经历'" @confirm="removeItem(edu.id)" />
        </div>
      </div>

      <SmoothCollapse><div v-show="!isCollapsed(edu.id)" class="education-item__body">
        <el-form label-position="top">
        <el-form-item label="学校名称" required :data-quality-id="`education-school-${edu.id}`">
          <el-input
            :model-value="edu.school"
            placeholder="学校名称"
            data-entry-focus
            @update:model-value="(value: string) => handleUpdate(edu.id, { school: value })"
          />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="学历" required :data-quality-id="`education-degree-${edu.id}`">
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
            <el-form-item label="专业" required :data-quality-id="`education-major-${edu.id}`">
              <el-input
                :model-value="edu.major"
                placeholder="专业名称"
                @update:model-value="(value: string) => handleUpdate(edu.id, { major: value })"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="起止时间" :data-quality-id="`education-date-${edu.id}`">
          <MonthRangeField
            :start="edu.startDate"
            :end="edu.endDate === 'present' ? '' : edu.endDate"
            :present="edu.endDate === 'present'"
            start-placeholder="入学月份"
            end-placeholder="毕业月份"
            @update:start="(value) => handleUpdate(edu.id, { startDate: value })"
            @update:end="(value) => handleUpdate(edu.id, { endDate: value })"
            @update:present="(value) => handleUpdate(edu.id, { endDate: value ? 'present' : '' })"
          />
        </el-form-item>

        <el-form-item label="GPA / 排名（选填）">
          <el-input
            :model-value="edu.gpa"
            placeholder="例如：3.8/4.0（专业前 10%）"
            @update:model-value="(value: string) => handleUpdate(edu.id, { gpa: value })"
          />
          <p class="edu-hint">所有高等教育经历请与学信网保持一致；校招/实习时有亮眼排名可附百分比。</p>
        </el-form-item>
      </el-form>
      </div></SmoothCollapse>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { School, Hide, View, ArrowDown, ArrowUp } from '@element-plus/icons-vue';
import type { Education } from '@/types/resume';
import SmoothCollapse from '@/components/common/SmoothCollapse.vue';
import EntryDeleteButton from './EntryDeleteButton.vue';
import MonthRangeField from './MonthRangeField.vue';
import { focusNewEntry } from '@/utils/focusNewEntry';

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
  const before = new Set(education.value.map(item => item.id));
  resumeStore.addEducation({
    school: '',
    degree: '',
    major: '',
    startDate: '',
    endDate: '',
  });
  const created = education.value.find(item => !before.has(item.id));
  if (created) void nextTick(() => focusNewEntry(created.id));
};

const removeItem = (id: string) => {
  resumeStore.removeEducation(id);
};

const handleUpdate = (id: string, updates: Partial<Education>) => {
  resumeStore.updateEducation(id, updates);
};
defineExpose({ addNew });
</script>

<style scoped>
.edu-hint {
  margin: 4px 0 0;
  color: var(--color-muted);
  font-size: var(--text-xs);
  line-height: 1.45;
}
</style>
