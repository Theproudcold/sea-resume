<template>
  <div class="skill-editor space-y-4">

    <div v-if="skills.length === 0" class="resume-editor-empty">
      <el-icon :size="48"><Star /></el-icon>
      <p class="mt-2">暂无技能信息，点击上方按钮添加</p>
    </div>

    <div v-for="(skill, index) in skills" :key="skill.id" class="skill-item resume-entry-card" :class="{ 'is-collapsed': isCollapsed(skill.id) }">
      <div class="resume-entry-card__header">
        <span class="text-sm text-gray-600">技能分类 {{ index + 1 }}</span>
        <div class="flex items-center gap-2">
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
          <el-button type="danger" size="small" text @click="removeItem(skill.id)" :icon="Delete">删除</el-button>
        </div>
      </div>

      <SmoothCollapse><div v-show="!isCollapsed(skill.id)" class="skill-item__body">
        <el-form label-position="top">
        <el-form-item label="分类名称" required>
          <el-input
            :model-value="skill.category"
            placeholder="例如：编程语言、前端框架"
            @update:model-value="(value: string) => handleUpdate(skill.id, { category: value })"
          />
        </el-form-item>

        <el-form-item label="具体技能" required>
          <el-input
            :model-value="itemDrafts[skill.id] ?? skill.items.join(', ')"
            type="textarea"
            :rows="2"
            placeholder="多个技能请用逗号分隔，例如：JavaScript, TypeScript, Vue.js"
            @update:model-value="(val: string) => handleItemsUpdate(skill.id, val)"
          />
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

        <el-divider v-if="index < skills.length - 1" />
      </div></SmoothCollapse>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { Delete, Star, Hide, View, ArrowDown, ArrowUp } from '@element-plus/icons-vue';
import type { Skill } from '@/types/resume';
import SmoothCollapse from '@/components/common/SmoothCollapse.vue';

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

// Only separator text is local. Synchronous action echoes must not normalize typing.
const itemDrafts = ref<Record<string, string>>({});
let editingItemsId: string | undefined;
watch(() => ({
  root: data.value,
  entries: skills.value.map(skill => ({ id: skill.id, items: skill.items, text: skill.items.join(', ') })),
}), (next, previous) => {
  const oldEntries = new Map(previous?.entries.map(entry => [entry.id, entry]));
  const ids = new Set(next.entries.map(entry => entry.id));
  for (const id of Object.keys(itemDrafts.value)) {
    if (!ids.has(id)) delete itemDrafts.value[id];
  }
  for (const entry of next.entries) {
    const old = oldEntries.get(entry.id);
    if (entry.id !== editingItemsId && (!old || previous?.root !== next.root || old.items !== entry.items || old.text !== entry.text)) {
      itemDrafts.value[entry.id] = entry.text;
    }
  }
}, { immediate: true, flush: 'sync' });

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
  itemDrafts.value[id] = value;
  const items = value.split(',').map(item => item.trim()).filter(Boolean);
  editingItemsId = id;
  try {
    handleUpdate(id, { items });
  } finally {
    editingItemsId = undefined;
  }
};
defineExpose({ addNew });
</script>
