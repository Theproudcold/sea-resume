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
              placeholder="例如：编程语言、后端组件、前端工程"
              data-entry-focus
              @update:model-value="(value: string) => handleUpdate(skill.id, { category: value })"
            />
          </el-form-item>

          <el-form-item label="具体技能" required :data-quality-id="`skill-items-${skill.id}`">
            <template #label>
              <div class="skill-field-head">
                <span>具体技能</span>
                <div class="skill-mode-switch" role="group" aria-label="技能录入方式">
                  <button
                    type="button"
                    class="skill-mode-btn"
                    :class="{ 'is-active': !isDetailedMode(skill) }"
                    data-testid="skill-mode-tags"
                    @click="setDetailedMode(skill.id, false)"
                  >短标签</button>
                  <button
                    type="button"
                    class="skill-mode-btn"
                    :class="{ 'is-active': isDetailedMode(skill) }"
                    data-testid="skill-mode-detailed"
                    @click="setDetailedMode(skill.id, true)"
                  >深度陈述（推荐）</button>
                </div>
              </div>
            </template>

            <div v-if="isDetailedMode(skill)" class="skill-detailed-list">
              <div v-for="(entry, itemIndex) in detailedItems(skill)" :key="`${skill.id}-d-${itemIndex}`" class="skill-detailed-row">
                <el-input
                  :model-value="entry"
                  type="textarea"
                  :autosize="{ minRows: 2, maxRows: 5 }"
                  placeholder="例如：熟练使用 MySQL，理解 InnoDB 存储引擎、事务隔离、MVCC 与 binlog/redolog/undolog 机制"
                  @update:model-value="(value: string) => updateDetailedItem(skill, itemIndex, value)"
                />
                <el-button
                  v-if="detailedItems(skill).length > 1 || entry.trim()"
                  link
                  type="danger"
                  :aria-label="`移除技能陈述 ${itemIndex + 1}`"
                  @click="removeDetailedItem(skill, itemIndex)"
                >删除</el-button>
              </div>
              <div class="skill-detailed-footer">
                <el-button text type="primary" size="small" data-testid="skill-add-detail" @click="addDetailedItem(skill)">+ 追加一条深度陈述</el-button>
                <span class="skill-guide-hint">建议写清底层原理、具体组件或实战深度，支持直接输入中文逗号。</span>
              </div>
            </div>

            <div v-else class="w-full">
              <SkillTagInput :items="skill.items" @update:items="(items) => handleUpdate(skill.id, { items })" />
              <p class="skill-guide-hint">避免只堆砌「会 Java / 懂 MySQL」，可切换「深度陈述」展开写明具体原理与实践。</p>
            </div>
          </el-form-item>

          <el-form-item label="熟练程度（选填）">
            <el-select
              :model-value="skill.level"
              placeholder="选择熟练程度（可留空）"
              clearable
              @update:model-value="(value: Skill['level']) => handleUpdate(skill.id, { level: value || undefined })"
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
/** 记录用户手动切换的技能输入模式；未显式切换时按内容长度/标点自动推断。 */
const modeOverrides = ref<Record<string, boolean>>({});

const isCollapsed = (id: string) => collapsedIds.value.includes(id);

const toggleCollapsed = (id: string) => {
  collapsedIds.value = isCollapsed(id)
    ? collapsedIds.value.filter(itemId => itemId !== id)
    : [...collapsedIds.value, id];
};

const isDetailedMode = (skill: Skill): boolean => {
  if (skill.id in modeOverrides.value) return Boolean(modeOverrides.value[skill.id]);
  return Array.isArray(skill.items) && skill.items.some((item) => item.length > 16 || /[，。；：,;]/u.test(item));
};

const setDetailedMode = (id: string, detailed: boolean) => {
  modeOverrides.value = { ...modeOverrides.value, [id]: detailed };
};

const detailedItems = (skill: Skill): string[] => {
  const list = Array.isArray(skill.items) ? skill.items : [];
  return list.length ? list : [''];
};

const updateDetailedItem = (skill: Skill, index: number, value: string) => {
  const next = [...detailedItems(skill)];
  next[index] = value;
  handleUpdate(skill.id, { items: next });
};

const addDetailedItem = (skill: Skill) => {
  const current = Array.isArray(skill.items) ? skill.items : [];
  handleUpdate(skill.id, { items: [...(current.length ? current : ['']), ''] });
};

const removeDetailedItem = (skill: Skill, index: number) => {
  const current = detailedItems(skill);
  const next = current.filter((_, itemIndex) => itemIndex !== index);
  handleUpdate(skill.id, { items: next });
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

<style scoped>
.skill-field-head {
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.skill-mode-switch {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg-subtle);
  gap: 2px;
}

.skill-mode-btn {
  padding: 2px 8px;
  border: 0;
  border-radius: calc(var(--ui-radius-sm) - 2px);
  background: transparent;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-xs);
  line-height: 1.5;
  cursor: pointer;
}

.skill-mode-btn.is-active {
  background: var(--ui-bg-surface);
  color: var(--ui-primary);
  font-weight: 600;
}

.skill-detailed-list {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 8px;
}

.skill-detailed-row {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 8px;
}

.skill-detailed-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.skill-guide-hint {
  margin: 6px 0 0;
  color: var(--color-muted);
  font-size: var(--text-xs);
  line-height: 1.45;
}
</style>
