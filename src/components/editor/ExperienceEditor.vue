<template>
  <div class="experience-editor space-y-4">

    <div v-if="experiences.length === 0" class="resume-editor-empty">
      <el-icon :size="48"><Briefcase /></el-icon>
      <p class="mt-2">暂无工作经历，点击上方按钮添加</p>
    </div>

    <div v-for="(exp, index) in experiences" :key="exp.id" class="experience-item resume-entry-card" :class="{ 'is-collapsed': isCollapsed(exp.id) }">
      <div class="resume-entry-card__header">
        <span class="text-sm text-gray-600">工作经历 {{ index + 1 }}</span>
        <div class="flex items-center gap-2">
          <el-button
            link
            :type="exp.visible === false ? 'info' : ''"
            :icon="exp.visible === false ? Hide : View"
            :aria-label="exp.visible === false ? '显示此工作经历' : '隐藏此工作经历'"
            :title="exp.visible === false ? '显示此工作经历' : '隐藏此工作经历'"
            @click="handleUpdate(exp.id, { visible: exp.visible === false })"
          />
          <el-button
            link
            :icon="isCollapsed(exp.id) ? ArrowDown : ArrowUp"
            :aria-expanded="!isCollapsed(exp.id)"
            :aria-label="isCollapsed(exp.id) ? '展开此工作经历' : '折叠此工作经历'"
            :title="isCollapsed(exp.id) ? '展开此工作经历' : '折叠此工作经历'"
            @click="toggleCollapsed(exp.id)"
          />
          <el-button type="danger" size="small" text @click="removeItem(exp.id)" :icon="Delete">删除</el-button>
        </div>
      </div>

      <SmoothCollapse><div v-show="!isCollapsed(exp.id)" class="experience-item__body">
        <el-form label-position="top">
        <el-form-item label="公司名称" required>
          <el-input
            :model-value="exp.company"
            placeholder="公司名称"
            @update:model-value="(value: string) => handleUpdate(exp.id, { company: value })"
          />
        </el-form-item>

        <el-form-item label="职位" required>
          <el-input
            :model-value="exp.position"
            placeholder="职位名称"
            @update:model-value="(value: string) => handleUpdate(exp.id, { position: value })"
          />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="开始时间">
              <el-date-picker
                :model-value="exp.startDate"
                type="month"
                placeholder="选择月份"
                format="YYYY-MM"
                value-format="YYYY-MM"
                @update:model-value="(value: string | null) => handleUpdate(exp.id, { startDate: value || '' })"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束时间">
              <el-select
                v-if="exp.endDate === 'present'"
                :model-value="exp.endDate"
                @update:model-value="(value: string) => handleUpdate(exp.id, { endDate: value })"
              >
                <el-option label="至今" value="present" />
                <el-option label="选择日期" value="" />
              </el-select>
              <el-date-picker
                v-else
                :model-value="exp.endDate"
                type="month"
                placeholder="选择月份"
                format="YYYY-MM"
                value-format="YYYY-MM"
                @update:model-value="(value: string | null) => handleUpdate(exp.id, { endDate: value || '' })"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="工作描述">
          <RichTextEditor
            :model-value="exp.description"
            @update:modelValue="(val) => handleUpdate(exp.id, { description: val })"
          />
        </el-form-item>
      </el-form>

        <el-divider v-if="index < experiences.length - 1" />
      </div></SmoothCollapse>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { Delete, Briefcase, Hide, View, ArrowDown, ArrowUp } from '@element-plus/icons-vue';
import type { Experience } from '@/types/resume';
import RichTextEditor from '@/components/common/RichTextEditor.vue';
import SmoothCollapse from '@/components/common/SmoothCollapse.vue';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const experiences = computed(() => data.value.experiences);
const collapsedIds = ref<string[]>([]);

const isCollapsed = (id: string) => collapsedIds.value.includes(id);

const toggleCollapsed = (id: string) => {
  collapsedIds.value = isCollapsed(id)
    ? collapsedIds.value.filter(itemId => itemId !== id)
    : [...collapsedIds.value, id];
};


const addNew = () => {
  resumeStore.addExperience({
    company: '',
    position: '',
    startDate: '',
    endDate: 'present',
    description: '',
  });
};

const removeItem = (id: string) => {
  resumeStore.removeExperience(id);
};

const handleUpdate = (id: string, updates: Partial<Experience>) => {
  resumeStore.updateExperience(id, updates);
};
defineExpose({ addNew });
</script>
