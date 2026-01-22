<template>
  <div class="skill-editor space-y-4">
    <div class="mb-4">
      <el-button type="primary" size="small" @click="addNew" :icon="Plus">
        添加技能分类
      </el-button>
    </div>

    <div v-if="skills.length === 0" class="empty-state text-center py-8 text-gray-400">
      <el-icon :size="48"><Star /></el-icon>
      <p class="mt-2">暂无技能信息，点击上方按钮添加</p>
    </div>

    <div v-for="(skill, index) in skills" :key="skill.id" class="skill-item">
      <div class="item-header flex items-center justify-between mb-3">
        <span class="text-sm text-gray-600">技能分类 {{ index + 1 }}</span>
        <el-button
          type="danger"
          size="small"
          text
          @click="removeItem(skill.id)"
          :icon="Delete"
        >
          删除
        </el-button>
      </div>

      <el-form label-position="top">
        <el-form-item label="分类名称" required>
          <el-input
            v-model="skill.category"
            placeholder="例如：编程语言、前端框架"
            @input="handleUpdate(skill.id, { category: skill.category })"
          />
        </el-form-item>

        <el-form-item label="具体技能" required>
          <el-input
            :model-value="skill.items.join(', ')"
            type="textarea"
            :rows="2"
            placeholder="多个技能请用逗号分隔，例如：JavaScript, TypeScript, Vue.js"
            @input="(val: string) => handleItemsUpdate(skill.id, val)"
          />
        </el-form-item>

        <el-form-item label="熟练程度（选填）">
          <el-select
            v-model="skill.level"
            placeholder="选择熟练程度"
            @change="handleUpdate(skill.id, { level: skill.level })"
          >
            <el-option label="入门" value="beginner" />
            <el-option label="中级" value="intermediate" />
            <el-option label="高级" value="advanced" />
            <el-option label="专家" value="expert" />
          </el-select>
        </el-form-item>
      </el-form>

      <el-divider v-if="index < skills.length - 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { Plus, Delete, Star } from '@element-plus/icons-vue';
import type { Skill } from '@/types/resume';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const skills = ref<Skill[]>([...data.value.skills]);

watch(() => data.value.skills, (newVal) => {
  skills.value = [...newVal];
}, { deep: true });

const addNew = () => {
  resumeStore.addSkill({
    category: '',
    items: [],
  });
};

const removeItem = (id: string) => {
  resumeStore.removeSkill(id);
};

const handleUpdate = (id: string, updates: Partial<Skill>) => {
  resumeStore.updateSkill(id, updates);
};

const handleItemsUpdate = (id: string, value: string) => {
  const items = value.split(',').map(item => item.trim()).filter(item => item);
  handleUpdate(id, { items });
};
</script>

<style scoped>
.skill-item {
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
