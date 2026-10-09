<template>
  <div class="experience-editor space-y-4">
    <div class="mb-4">
      <el-button type="primary" size="small" @click="addNew" :icon="Plus">
        添加工作经历
      </el-button>
    </div>

    <div v-if="experiences.length === 0" class="resume-editor-empty">
      <el-icon :size="48"><Briefcase /></el-icon>
      <p class="mt-2">暂无工作经历，点击上方按钮添加</p>
    </div>

    <div v-for="(exp, index) in experiences" :key="exp.id" class="experience-item resume-entry-card">
      <div class="resume-entry-card__header">
        <span class="text-sm text-gray-600">工作经历 {{ index + 1 }}</span>
        <el-button
          type="danger"
          size="small"
          text
          @click="removeItem(exp.id)"
          :icon="Delete"
        >
          删除
        </el-button>
      </div>

      <el-form label-position="top">
        <el-form-item label="公司名称" required>
          <el-input
            v-model="exp.company"
            placeholder="公司名称"
            @input="handleUpdate(exp.id, { company: exp.company })"
          />
        </el-form-item>

        <el-form-item label="职位" required>
          <el-input
            v-model="exp.position"
            placeholder="职位名称"
            @input="handleUpdate(exp.id, { position: exp.position })"
          />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="开始时间">
              <el-date-picker
                v-model="exp.startDate"
                type="month"
                placeholder="选择月份"
                format="YYYY-MM"
                value-format="YYYY-MM"
                @change="handleUpdate(exp.id, { startDate: exp.startDate })"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束时间">
              <el-select
                v-if="exp.endDate === 'present'"
                v-model="exp.endDate"
                @change="handleUpdate(exp.id, { endDate: exp.endDate })"
              >
                <el-option label="至今" value="present" />
                <el-option label="选择日期" value="" />
              </el-select>
              <el-date-picker
                v-else
                v-model="exp.endDate"
                type="month"
                placeholder="选择月份"
                format="YYYY-MM"
                value-format="YYYY-MM"
                @change="handleUpdate(exp.id, { endDate: exp.endDate })"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="工作描述">
          <RichTextEditor
            v-model="exp.description"
            @update:modelValue="(val) => handleUpdate(exp.id, { description: val })"
          />
        </el-form-item>
      </el-form>

      <el-divider v-if="index < experiences.length - 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { Plus, Delete, Briefcase } from '@element-plus/icons-vue';
import type { Experience } from '@/types/resume';
import RichTextEditor from '@/components/common/RichTextEditor.vue';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const experiences = ref<Experience[]>(JSON.parse(JSON.stringify(data.value.experiences)));

watch(() => data.value.experiences, (newVal) => {
  experiences.value = JSON.parse(JSON.stringify(newVal));
}, { deep: true });

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
</script>
