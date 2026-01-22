<template>
  <div class="basic-info-editor space-y-4">
    <el-form label-position="top">
      <el-form-item label="姓名" required>
        <el-input
          v-model="localBasic.name"
          placeholder="请输入姓名"
          @input="handleUpdate"
        />
      </el-form-item>

      <el-form-item label="求职意向" required>
        <el-input
          v-model="localBasic.title"
          placeholder="例如：前端工程师"
          @input="handleUpdate"
        />
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="邮箱" required>
            <el-input
              v-model="localBasic.email"
              placeholder="your@email.com"
              type="email"
              @input="handleUpdate"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="电话" required>
            <el-input
              v-model="localBasic.phone"
              placeholder="手机号码"
              @input="handleUpdate"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="所在城市">
        <el-input
          v-model="localBasic.location"
          placeholder="例如：北京"
          @input="handleUpdate"
        />
      </el-form-item>

      <el-form-item label="个人网站">
        <el-input
          v-model="localBasic.website"
          placeholder="https://..."
          @input="handleUpdate"
        />
      </el-form-item>

      <el-form-item label="个人简介">
        <el-input
          v-model="localBasic.summary"
          type="textarea"
          :rows="4"
          placeholder="简要介绍你的背景和优势..."
          @input="handleUpdate"
        />
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import type { BasicInfo } from '@/types/resume';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const localBasic = ref<BasicInfo>({ ...data.value.basic });

// 监听 store 变化更新本地数据
watch(() => data.value.basic, (newVal) => {
  localBasic.value = { ...newVal };
}, { deep: true });

const handleUpdate = () => {
  resumeStore.updateBasic(localBasic.value);
};
</script>

<style scoped>
.basic-info-editor {
  width: 100%;
}
</style>
