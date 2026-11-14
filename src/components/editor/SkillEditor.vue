<template>
  <div class="skill-editor">

    <div v-if="skills.length === 0" class="resume-editor-empty">
      <el-icon :size="24" aria-hidden="true"><Star /></el-icon>
      <p>添加技能分类</p>
    </div>

    <div v-for="(skill, index) in skills" :key="skill.id" class="skill-item resume-entry-card" :class="{ 'is-collapsed': isCollapsed(skill.id) }" :data-entry-id="skill.id">
      <div class="resume-entry-card__header">
        <span>技能分类 {{ index + 1 }}</span>
        <div class="flex items-center gap-1">
          <el-button
            link
            :type="skill.visible === false ? 'info' : ''"
            :icon="skill.visible === false ? Hide : View"
            :aria-label="skill.visible === false ? '显示此技能分类' : '隐藏此技能分类'"
            :title="skill.visible === false ? '显示此技能分类' : '隐藏此技能分类'"
            @click="handleUpdate(skill.id, { visible: skill.visible === false })"
          />
          <el-button
            link
            :icon="isCollapsed(skill.id) ? ArrowDown : ArrowUp"
            :aria-expanded="!isCollapsed(skill.id)"
            :aria-label="isCollapsed(skill.id) ? '展开此技能分类' : '折叠此技能分类'"
            :title="isCollapsed(skill.id) ? '展开此技能分类' : '折叠此技能分类'"
            @click="toggleCollapsed(skill.id)"
          />
          <EntryDeleteButton :label="skill.category.trim() || '未命名技能分类'" @confirm="removeItem(skill.id)" />
        </div>
      </div>

      <SmoothCollapse><div v-show="!isCollapsed(skill.id)" class="skill-item__body">
        <el-form label-position="top">
        <el-form-item label="分类名称" required :data-quality-id="`skill-category-${skill.id}`">
          <el-input
            :model-value="skill.category"
            placeholder="例如：编程语言、前端框架"
            data-entry-focus
            @update:model-value="(value: string) => handleUpdate(skill.id, { category: value })"
          />
        </el-form-item>

        <el-form-item label="具体技能" required :data-quality-id="`skill-items-${skill.id}`">
          <SkillTagInput :items="skill.items" @update:items="(items) => handleUpdate(skill.id, { items })" />
        </el-form-item>

        <el-form-item label="熟练程度（选填）">
          <el-select
            :model-value="skill.level"
            placeholder="选择熟练程度"
            @update:model-value="(value: Skill['level']) => handleUpdate(skill.id, { level: value })"
          >
            <el-option label="入门" value="beginner" />
            <el-option label="中级" value="intermediate" />
            <el-option label="高级" value="advanced" />
            <el-option label="专家" value="expert" />
          </el-select>
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
import { Star, Hide, View, ArrowDown, ArrowUp } from '@element-plus/icons-vue';
import type { Skill } from '@/types/resume';
import SmoothCollapse from '@/components/common/SmoothCollapse.vue';
import EntryDeleteButton from './EntryDeleteButton.vue';
import SkillTagInput from './SkillTagInput.vue';
import { focusNewEntry } from '@/utils/focusNewEntry';

const resumeStore = useResumeStore();
const { data } = storeToRefs(resumeStore);

const skills = computed(() => data.value.skills);
const collapsedIds = ref<string[]>([]);

const isCollapsed = (id: string) => collapsedIds.value.includes(id);

const toggleCollapsed = (id: string) => {
  collapsedIds.value = isCollapsed(id)
    ? collapsedIds.value.filter(itemId => itemId !== id)
    : [...collapsedIds.value, id];
};

const addNew = () => {
  const before = new Set(skills.value.map(item => item.id));
  resumeStore.addSkill({
    category: '',
    items: [],
  });
  const created = skills.value.find(item => !before.has(item.id));
  if (created) void nextTick(() => focusNewEntry(created.id));
};

const removeItem = (id: string) => {
  resumeStore.removeSkill(id);
};

const handleUpdate = (id: string, updates: Partial<Skill>) => {
  resumeStore.updateSkill(id, updates);
};

defineExpose({ addNew });
</script>
