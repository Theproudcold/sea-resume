<template>
  <div class="modern-template" :style="{
    '--margin-top': (data.theme?.moduleMargins?.top || 0) + 'px',
    '--margin-bottom': (data.theme?.moduleMargins?.bottom || 24) + 'px',
    '--margin-left': (data.theme?.moduleMargins?.left || 0) + 'px',
    '--margin-right': (data.theme?.moduleMargins?.right || 0) + 'px',
    '--primary-color': data.theme?.color || '#2563eb',
    padding: (data.theme?.pageMargins !== undefined ? data.theme.pageMargins : 24) + 'px',
    fontSize: 'var(--font-size)',
    lineHeight: 'var(--line-height)',
    color: '#333'
  }">
    <!-- 基础信息 -->
    <header class="header flex flex-col md:flex-row gap-6 items-start" style="margin-bottom: calc(var(--margin-bottom) * 1.5)">
      <div v-if="data.basic.avatar" class="avatar-container shrink-0">
        <img :src="data.basic.avatar" class="w-28 h-28 rounded-full object-cover border-2 border-white shadow-sm" />
      </div>
      <div class="flex-1">
        <h1 class="name font-bold text-gray-900 mb-2">
          {{ data.basic.name || '您的姓名' }}
        </h1>
        <div class="title mb-4" style="color: var(--primary-color)">
          {{ data.basic.title || '求职意向' }}
        </div>
      <div class="contact-info flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600">
        <div v-if="data.basic.email" class="flex items-center gap-1">
          <ContactIcon v-if="data.theme.displayIcons !== false" type="email" :icon="data.basic.iconOverrides?.email" style="color: var(--primary-color)" />
          <span>{{ data.basic.email }}</span>
        </div>
        <div v-if="data.basic.phone" class="flex items-center gap-1">
          <ContactIcon v-if="data.theme.displayIcons !== false" type="phone" :icon="data.basic.iconOverrides?.phone" style="color: var(--primary-color)" />
          <span>{{ data.basic.phone }}</span>
        </div>
        <div v-if="data.basic.location" class="flex items-center gap-1">
          <ContactIcon v-if="data.theme.displayIcons !== false" type="location" :icon="data.basic.iconOverrides?.location" style="color: var(--primary-color)" />
          <span>{{ data.basic.location }}</span>
        </div>
        <div v-if="data.basic.website" class="flex items-center gap-1">
          <ContactIcon v-if="data.theme.displayIcons !== false" type="website" :icon="data.basic.iconOverrides?.website" style="color: var(--primary-color)" />
          <span>{{ data.basic.website }}</span>
        </div>
        <ResumeSmartFields :data="data" />
      </div>
      </div>
    </header>

    <el-divider class="mb-6" style="margin-bottom: var(--spacing)" />

    <!-- 简介 -->
    <section
      v-if="data.basic.summary"
      class="mb-8 cursor-pointer hover:bg-gray-50 p-2 -m-2 rounded transition-colors"
      @click="setActiveSection('basic')"
    >
      <div class="text-gray-600 leading-relaxed rich-text" v-html="data.basic.summary"></div>
    </section>

    <!-- 动态排序模块 -->
    <draggable
      v-model="sortedSections"
      :item-key="(section: string) => section"
      :animation="200"
      handle=".section-title"
      group="modern-sections"
    >
      <template #item="{ element: section }">
        <div 
          class="section-item cursor-pointer hover:bg-gray-50 rounded transition-all -m-2 p-2 mb-4"
          @click.stop="setActiveSection(section)"
        >
          <!-- 自定义模块 -->
          <section v-if="isCustomBlock(section)" class="section" style="
            margin-top: var(--margin-top);
            margin-bottom: var(--margin-bottom);
            margin-left: var(--margin-left);
            margin-right: var(--margin-right);
          ">
            <h2 class="section-title font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span class="w-1 h-6 rounded" style="background-color: var(--primary-color)"></span>
              {{ getSectionTitle(section) }}
            </h2>
            <div v-if="Array.isArray(getCustomContent(section))" style="gap: var(--spacing); display: flex; flex-direction: column;">
              <div v-for="item in getCustomItems(section)" :key="item.id" class="custom-item" style="margin-bottom: 0">
                <div class="flex justify-between items-start mb-2">
                  <div>
                    <h3 v-if="item.title" class="font-semibold text-gray-900" style="font-size: calc(var(--font-size) + 4px)">{{ item.title }}</h3>
                    <div v-if="item.subtitle" style="font-size: var(--font-size)">{{ item.subtitle }}</div>
                  </div>
                  <div v-if="item.date" class="text-sm text-gray-500 whitespace-nowrap ml-4">
                    {{ item.date }}
                  </div>
                </div>
                <div class="ql-editor px-0" v-html="item.description" style="font-size: var(--font-size); line-height: var(--line-height)"></div>
              </div>
            </div>
            <div v-else class="ql-editor px-0" v-html="getCustomContent(section)" style="font-size: var(--font-size); line-height: var(--line-height)"></div>
          </section>

          <!-- 工作经历 -->
          <section v-else-if="section === 'experience' && data.experiences.length > 0" class="section" style="
            margin-top: var(--margin-top);
            margin-bottom: var(--margin-bottom);
            margin-left: var(--margin-left);
            margin-right: var(--margin-right);
          ">
            <h2 class="section-title font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span class="w-1 h-6 rounded" style="background-color: var(--primary-color)"></span>
              {{ data.sectionTitles?.experience || '工作经历' }}
            </h2>
            <div style="gap: var(--spacing); display: flex; flex-direction: column;">
              <div v-for="exp in data.experiences" :key="exp.id" class="experience-item" style="margin-bottom: 0">
                <div class="flex justify-between items-start mb-2">
                  <div>
                    <h3 class="font-semibold text-gray-900" style="font-size: calc(var(--font-size) + 4px)">{{ exp.company }}</h3>
                    <div style="font-size: var(--font-size)">{{ exp.position }}</div>
                  </div>
                  <div class="text-sm text-gray-500 whitespace-nowrap ml-4">
                    {{ formatDateRange(exp.startDate, exp.endDate) }}
                  </div>
                </div>
                <div class="ql-editor px-0" v-html="exp.description" style="font-size: var(--font-size); line-height: var(--line-height)"></div>
              </div>
            </div>
          </section>

          <!-- 项目经验 -->
          <section v-else-if="section === 'projects' && data.projects.length > 0" class="section" style="
            margin-top: var(--margin-top);
            margin-bottom: var(--margin-bottom);
            margin-left: var(--margin-left);
            margin-right: var(--margin-right);
          ">
            <h2 class="section-title font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span class="w-1 h-6 rounded" style="background-color: var(--primary-color)"></span>
              {{ data.sectionTitles?.projects || '项目经验' }}
            </h2>
            <div style="gap: var(--spacing); display: flex; flex-direction: column;">
              <div v-for="project in data.projects" :key="project.id" class="project-item" style="margin-bottom: 0">
                <div class="flex justify-between items-start mb-2">
                  <div>
                    <h3 class="font-semibold text-gray-900" style="font-size: calc(var(--font-size) + 4px)">{{ project.name }}</h3>
                    <div style="font-size: var(--font-size)">{{ project.role }}</div>
                  </div>
                  <div class="text-sm text-gray-500 whitespace-nowrap ml-4">
                    {{ formatDateRange(project.startDate, project.endDate) }}
                  </div>
                </div>
                <div class="ql-editor px-0" v-html="project.description" style="font-size: var(--font-size); line-height: var(--line-height)"></div>
                <div v-if="project.techStack && project.techStack.length" class="mt-2 flex flex-wrap gap-2">
                  <span
                    v-for="tech in project.techStack"
                    :key="tech"
                    class="px-2 py-1 text-xs rounded"
                    style="color: var(--primary-color); background-color: color-mix(in srgb, var(--primary-color) 10%, white)"
                  >
                    {{ tech }}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <!-- 教育背景 -->
          <section v-else-if="section === 'education' && data.education.length > 0" class="section" style="
            margin-top: var(--margin-top);
            margin-bottom: var(--margin-bottom);
            margin-left: var(--margin-left);
            margin-right: var(--margin-right);
          ">
            <h2 class="section-title font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span class="w-1 h-6 rounded" style="background-color: var(--primary-color)"></span>
              {{ data.sectionTitles?.education || '教育背景' }}
            </h2>
            <div class="space-y-3">
              <div v-for="edu in data.education" :key="edu.id" class="education-item" style="margin-bottom: calc(var(--spacing) * 0.5)">
                <div class="flex justify-between items-start">
                  <div>
                    <h3 class="font-semibold text-gray-900" style="font-size: calc(var(--font-size) + 2px)">{{ edu.school }}</h3>
                    <div class="text-gray-700 text-sm" style="font-size: var(--font-size)">
                      {{ edu.degree }} · {{ edu.major }}
                    </div>
                  </div>
                  <div class="text-sm text-gray-500 whitespace-nowrap ml-4">
                    {{ formatDateRange(edu.startDate, edu.endDate) }}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 技能 -->
          <section v-else-if="section === 'skills' && data.skills.length > 0" class="section" style="
            margin-top: var(--margin-top);
            margin-bottom: var(--margin-bottom);
            margin-left: var(--margin-left);
            margin-right: var(--margin-right);
          ">
            <h2 class="section-title font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span class="w-1 h-6 rounded" style="background-color: var(--primary-color)"></span>
              {{ data.sectionTitles?.skills || '专业技能' }}
            </h2>
            <div class="space-y-2">
              <div v-for="skill in data.skills" :key="skill.id" class="skill-item">
                <span class="font-medium text-gray-800" style="font-size: var(--font-size)">{{ skill.category }}:</span>
                <span class="ml-2" style="font-size: var(--font-size); line-height: var(--line-height)">{{ skill.items.join('、') }}</span>
              </div>
            </div>
          </section>
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ResumeData } from '@/types/resume';
import ResumeSmartFields from '@/components/preview/ResumeSmartFields.vue';
import ContactIcon from '@/components/common/ContactIcon.vue';
import draggable from 'vuedraggable';
import { useResumeStore } from '@/stores/resume';
import '@vueup/vue-quill/dist/vue-quill.snow.css'; // For basic content styles

const props = defineProps<{
  data: ResumeData;
}>();

const formatDateRange = (start: string, end: string | 'present') => {
  const format = props.data.theme.dateFormat || 'YYYY.MM';
  const formatFn = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const y = date.getFullYear();
      const m = date.getMonth() + 1;
      const mm = m.toString().padStart(2, '0');
      const mmm = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
      switch (format) {
        case 'YYYY-MM': return `${y}-${mm}`;
        case 'YYYY/MM': return `${y}/${mm}`;
        case 'MM/YYYY': return `${mm}/${y}`;
        case 'MMM YYYY': return `${mmm} ${y}`;
        case 'YYYY.MM': default: return `${y}.${mm}`;
      }
    } catch { return dateStr; }
  };
  return `${formatFn(start)} - ${end === 'present' ? '至今' : formatFn(end)}`;
};

const resumeStore = useResumeStore();

// 可写计算属性，处理拖拽排序
const isSectionHidden = (id: string) => {
  return props.data.hiddenSections?.includes(id) || false;
};

const sortedSections = computed({
  get: () => {
    return (props.data.sectionOrder || []).filter(id => !isSectionHidden(id));
  },
  set: (val) => {
    // 拖拽排序时，需要合并隐藏的模块
    const visibleOrder = val;
    const hiddenOrder = (props.data.sectionOrder || []).filter(id => isSectionHidden(id));
    // 简单的合并策略：可见的在前（或按新顺序），隐藏的追加在后? 
    // 不，这会打乱隐藏项目的位置。
    // 更好的做法：只更新可见项目的相对顺序。
    // 但为了简化，我们假设用户只在“可见”列表中排序。
    // 实际上，如果模板里只渲染可见的，那么 v-model 绑定的也是可见的列表。
    // 更新时，我们需要重建完整的 sectionOrder。
    
    // 临时方案：直接更新 store 的 order，但要保留隐藏项?
    // 由于 draggable 只包含可见项，val 也是可见项的新顺序。
    // 我们需要把隐藏项插回去，或者是追加？
    // 既然在预览中不可见，它们的位置暂不重要，可以追加在最后，或者保持原样?
    // 最稳妥：activeSections = val (new visible order).
    // finalOrder = activeSections + hiddenSections.
    
    const newOrder = [...visibleOrder, ...props.data.hiddenSections || []];
    // 去重 (防守性)
    const uniqueOrder = Array.from(new Set(newOrder));
    resumeStore.updateSectionOrder(uniqueOrder);
  }
});

// Helpers for template rendering
const isCustomBlock = (id: string) => {
  return !['experience', 'projects', 'education', 'skills'].includes(id);
};

const getSectionTitle = (id: string) => {
  const block = props.data.customBlocks.find(b => b.id === id);
  return block ? block.title : '';
};

const getCustomContent = (id: string) => {
  const block = props.data.customBlocks.find(b => b.id === id);
  return block ? block.content : '';
};

const getCustomItems = (id: string): import('@/types/resume').CustomItem[] => {
  const content = getCustomContent(id);
  return Array.isArray(content) ? content : [];
};

const setActiveSection = (id: string) => {
  resumeStore.setActiveSection(id);
};
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.modern-template {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  line-height: $line-height-base + 0.1;
  color: #333; // Dark gray

}

.section {
  page-break-inside: avoid;
}

.experience-item,
.education-item,
.project-item {
  margin-bottom: $spacing-md;
  page-break-inside: avoid;
}

@media print {
  .modern-template {
    padding: 1.5rem;
  }
}
</style>
