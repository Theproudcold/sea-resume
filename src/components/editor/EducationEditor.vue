<template>
  <div class="education-editor space-y-4">
    <div class="mb-4">
      <el-button type="primary" size="small" @click="addNew" :icon="Plus">
        添加教育背景
      </el-button>
    </div>

    <div v-if="education.length === 0" class="empty-state text-center py-8 text-gray-400">
      <el-icon :size="48"><School /></el-icon>
      <p class="mt-2">暂无教育背景，点击上方按钮添加</p>
    </div>

    <div v-for="(edu, index) in education" :key="edu.id" class="education-item">
      <div class="item-header flex items-center justify-between mb-3">
        <span class="text-sm text-gray-600">教育背景 {{ index + 1 }}</span>
        <el-button
          type="danger"
          size="small"
          text
          @click="removeItem(edu.id)"
          :icon="Delete"
        >
          删除
        </el-button>
      </div>

      <el-form label-position="top">
        <el-form-item label="学校名称" required>
          <el-input
            v-model="edu.school"
            placeholder="学校名称"
            @input="handleUpdate(edu.id, { school: edu.school })"
          />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="学历" required>
              <el-select
                v-model="edu.degree"
                placeholder="请选择"
                @change="handleUpdate(edu.id, { degree: edu.degree })"
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
                v-model="edu.major"
                placeholder="专业名称"
                @input="handleUpdate(edu.id, { major: edu.major })"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="入学时间">
              <el-date-picker
                v-model="edu.startDate"
                type="month"
                placeholder="选择月份"
                format="YYYY-MM"
                value-format="YYYY-MM"
                @change="handleUpdate(edu.id, { startDate: edu.startDate })"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="毕业时间">
              <el-date-picker
                v-model="edu.endDate"
                type="month"
                placeholder="选择月份"
                format="YYYY-MM"
                value-format="YYYY-MM"
                @change="handleUpdate(edu.id, { endDate: edu.endDate })"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="GPA / 绩点（选填）">
          <el-input
            v-model="edu.gpa"
            placeholder="例如：3.8/4.0"
            @input="handleUpdate(edu.id, { gpa: edu.gpa })"
          />
        </el-form-item>
      </el-form>

      <el-divider v-if="index < education.length - 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { Plus, Delete, School } from '@element-plus/icons-vue';
import type { Education } from '@/types/resume';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const education = ref<Education[]>([...data.value.education]);

watch(() => data.value.education, (newVal) => {
  education.value = [...newVal];
}, { deep: true });

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
</script>

<style scoped>
.education-item {
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 16px;
}

.item-header {
  padding-bottom: 8px;
  border-bottom: 1px solid #e5e7eb;
}
</style>
