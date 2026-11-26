<template>
  <div class="experience-editor">

    <div v-if="experiences.length === 0" class="resume-editor-empty">
      <el-icon :size="24" aria-hidden="true"><Briefcase /></el-icon>
      <p>添加工作经历</p>
    </div>

    <div v-for="(exp, index) in experiences" :key="exp.id" class="experience-item resume-entry-card" :class="{ 'is-collapsed': isCollapsed(exp.id) }" :data-entry-id="exp.id">
      <div class="resume-entry-card__header">
        <span>工作经历 {{ index + 1 }}</span>
        <div class="flex items-center gap-1">
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
          <EntryDeleteButton :label="exp.company.trim() || '未命名经历'" @confirm="removeItem(exp.id)" />
        </div>
      </div>

      <SmoothCollapse><div v-show="!isCollapsed(exp.id)" class="experience-item__body">
        <el-form label-position="top">
        <el-form-item label="公司名称" required :data-quality-id="`experience-company-${exp.id}`">
          <el-input
            :model-value="exp.company"
            placeholder="公司名称"
            data-entry-focus
            @update:model-value="(value: string) => handleUpdate(exp.id, { company: value })"
          />
        </el-form-item>

        <el-form-item label="职位" required :data-quality-id="`experience-position-${exp.id}`">
          <el-input
            :model-value="exp.position"
            placeholder="职位名称"
            @update:model-value="(value: string) => handleUpdate(exp.id, { position: value })"
          />
        </el-form-item>

        <el-form-item label="起止时间" :data-quality-id="`experience-date-${exp.id}`">
          <MonthRangeField
            :start="exp.startDate"
            :end="exp.endDate === 'present' ? '' : exp.endDate"
            :present="exp.endDate === 'present'"
            @update:start="(value) => handleUpdate(exp.id, { startDate: value })"
            @update:end="(value) => handleUpdate(exp.id, { endDate: value })"
            @update:present="(value) => handleUpdate(exp.id, { endDate: value ? 'present' : '' })"
          />
        </el-form-item>

        <el-form-item label="工作描述" :data-quality-id="`experience-description-${exp.id}`">
          <RichTextEditor
            :model-value="exp.description"
            @update:modelValue="(val) => handleUpdate(exp.id, { description: val })"
          />
          <StarGuideHelper
            :model-value="exp.description"
            @update:modelValue="(val) => handleUpdate(exp.id, { description: val })"
          />
        </el-form-item>

        <el-form-item label="核心成果 / 亮点（选填）">
          <div class="highlights-editor">
            <div v-for="(highlight, hIndex) in (exp.highlights || [])" :key="`${exp.id}-h-${hIndex}`" class="highlights-editor__row">
              <el-input
                :model-value="highlight"
                placeholder="一条具体可验证的成果，例如：重构结算链路，接口耗时降低 40%"
                @update:model-value="(value: string) => updateHighlight(exp, hIndex, value)"
              />
              <el-button
                link
                type="danger"
                :aria-label="`删除亮点 ${hIndex + 1}`"
                @click="removeHighlight(exp, hIndex)"
              >删除</el-button>
            </div>
            <el-button text type="primary" size="small" data-testid="experience-add-highlight" @click="addHighlight(exp)">+ 添加一条成果亮点</el-button>
          </div>
        </el-form-item>

        <InterviewNoteBox :resume-id="data.id" :entry-key="`experience:${exp.id}`" />
      </el-form>
      </div></SmoothCollapse>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { Briefcase, Hide, View, ArrowDown, ArrowUp } from '@element-plus/icons-vue';
import type { Experience } from '@/types/resume';
import RichTextEditor from '@/components/common/RichTextEditor.vue';
import SmoothCollapse from '@/components/common/SmoothCollapse.vue';
import EntryDeleteButton from './EntryDeleteButton.vue';
import MonthRangeField from './MonthRangeField.vue';
import StarGuideHelper from './StarGuideHelper.vue';
import InterviewNoteBox from './InterviewNoteBox.vue';
import { focusNewEntry } from '@/utils/focusNewEntry';

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
  const before = new Set(experiences.value.map(item => item.id));
  resumeStore.addExperience({
    company: '',
    position: '',
    startDate: '',
    endDate: 'present',
    description: '',
  });
  const created = experiences.value.find(item => !before.has(item.id));
  if (created) void nextTick(() => focusNewEntry(created.id));
};

const removeItem = (id: string) => {
  resumeStore.removeExperience(id);
};

const handleUpdate = (id: string, updates: Partial<Experience>) => {
  resumeStore.updateExperience(id, updates);
};

const addHighlight = (exp: Experience) => {
  handleUpdate(exp.id, { highlights: [...(exp.highlights || []), ''] });
};

const updateHighlight = (exp: Experience, index: number, value: string) => {
  const next = [...(exp.highlights || [])];
  next[index] = value;
  handleUpdate(exp.id, { highlights: next });
};

const removeHighlight = (exp: Experience, index: number) => {
  const next = (exp.highlights || []).filter((_, itemIndex) => itemIndex !== index);
  handleUpdate(exp.id, { highlights: next });
};
defineExpose({ addNew });
</script>

<style scoped>
.highlights-editor {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.highlights-editor__row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
}
</style>
