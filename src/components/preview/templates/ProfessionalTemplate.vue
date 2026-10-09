<template>
  <div class="professional-template" :style="{
    '--margin-top': (data.theme?.moduleMargins?.top || 0) + 'px',
    '--margin-bottom': (data.theme?.moduleMargins?.bottom || 16) + 'px',
    '--margin-left': (data.theme?.moduleMargins?.left || 0) + 'px',
    '--margin-right': (data.theme?.moduleMargins?.right || 0) + 'px',
    '--font-size': (data.theme?.fontSize || 13) + 'px',
    '--line-height': data.theme?.lineHeight || 1.4,
    '--primary-color': data.theme?.color || '#1a1a1a',
    padding: (data.theme?.pageMargins !== undefined ? data.theme.pageMargins : 24) + 'px',
    fontFamily: data.theme?.fontFamily || 'serif',
    fontSize: 'var(--font-size)',
    lineHeight: 'var(--line-height)',
    color: '#333'
  }">
    <!-- 双栏布局 -->
    <div class="grid grid-cols-3 gap-8">
      <!-- 左侧栏 -->
      <div class="col-span-1 border-r border-gray-200 pr-8">
        <div class="mb-8 cursor-pointer hover:bg-gray-50 p-2 -m-2 rounded transition-colors" @click="setActiveSection('basic')">
        <div v-if="data.basic.avatar" class="mb-4">
          <img :src="data.basic.avatar" alt="头像" class="w-20 h-20 rounded-full object-cover border border-gray-200" />
        </div>
          <h1 class="text-2xl font-bold text-gray-900 mb-2" style="color: var(--primary-color)">{{ data.basic.name || '您的姓名' }}</h1>
          <div class="text-base text-gray-600 mb-4">{{ data.basic.title || '求职意向' }}</div>
          
          <div class="space-y-2 text-sm text-gray-500">
             <div v-if="data.basic.email" class="flex items-center gap-2">
              <ContactIcon v-if="data.theme.displayIcons !== false" type="email" :icon="data.basic.iconOverrides?.email" class="shrink-0" :size="14" style="color: var(--primary-color)" />
              <span class="break-all">{{ data.basic.email }}</span>
            </div>
            <div v-if="data.basic.phone" class="flex items-center gap-2">
              <ContactIcon v-if="data.theme.displayIcons !== false" type="phone" :icon="data.basic.iconOverrides?.phone" class="shrink-0" :size="14" style="color: var(--primary-color)" />
              <span>{{ data.basic.phone }}</span>
            </div>
            <div v-if="data.basic.location" class="flex items-center gap-2">
              <ContactIcon v-if="data.theme.displayIcons !== false" type="location" :icon="data.basic.iconOverrides?.location" class="shrink-0" :size="14" style="color: var(--primary-color)" />
              <span>{{ data.basic.location }}</span>
            </div>
             <div v-if="data.basic.website" class="flex items-center gap-2">
              <ContactIcon v-if="data.theme.displayIcons !== false" type="website" :icon="data.basic.iconOverrides?.website" class="shrink-0" :size="14" style="color: var(--primary-color)" />
              <a :href="data.basic.website" target="_blank" class="break-all hover:text-blue-600 transition-colors">{{ data.basic.website }}</a>
            </div>
            <ResumeSmartFields :data="data" />
          </div>
        </div>

        <!-- 技能 -->
        <div 
          v-if="data.skills.length > 0" 
          class="mb-8 cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-2 rounded transition-all p-1"
          @click.stop="setActiveSection('skills')"
        >
          <h2 class="text-base font-bold text-gray-900 mb-3 border-b-2 pb-1" style="border-color: var(--primary-color)">专业技能</h2>
          <div class="space-y-3">
            <div v-for="skill in data.skills" :key="skill.id">
              <div class="font-medium text-gray-800 mb-1" style="font-size: var(--font-size)">{{ skill.category }}</div>
              <div class="text-gray-600 leading-relaxed" style="font-size: var(--font-size); line-height: var(--line-height)">
                {{ skill.items.join('、') }}
              </div>
            </div>
          </div>
        </div>

         <!-- 教育背景 -->
        <div 
          v-if="data.education.length > 0"
          class="cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-2 rounded transition-all p-1"
          @click.stop="setActiveSection('education')"
        >
          <h2 class="text-base font-bold text-gray-900 mb-3 border-b-2 pb-1" style="border-color: var(--primary-color)">教育背景</h2>
          <div class="space-y-4">
            <div v-for="edu in data.education" :key="edu.id">
              <div class="font-bold text-gray-800" style="font-size: var(--font-size)">{{ edu.school }}</div>
              <div class="text-gray-600 mb-1" style="font-size: var(--font-size)">{{ edu.degree }} · {{ edu.major }}</div>
              <div class="text-gray-500 text-xs">{{ formatDateRange(edu.startDate, edu.endDate) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧栏 (主要内容) -->
      <div class="col-span-2 space-y-8" style="gap: var(--spacing); display: flex; flex-direction: column;">
        <!-- 个人简介 -->
        <div 
          v-if="data.basic.summary"
          class="cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-2 rounded transition-all p-1"
          @click.stop="setActiveSection('basic')"
        >
          <h2 class="text-lg font-bold text-gray-900 mb-2 border-b-2 pb-1" style="border-color: var(--primary-color)">个人简介</h2>
          <div class="text-gray-700 rich-text" v-html="data.basic.summary" style="font-size: var(--font-size); line-height: var(--line-height)"></div>
        </div>

        <!-- 动态渲染主要模块 (工作、项目、自定义) -->
        <draggable
          v-model="sortedMainSections"
          :item-key="(section: string) => section"
          :animation="200"
          handle=".section-content"
          group="main-sections"
        >
          <template #item="{ element: section }">
            <div 
              class="section-content cursor-pointer hover:ring-2 hover:ring-blue-400 hover:ring-offset-2 rounded transition-all"
              style="
                margin-top: var(--margin-top);
                margin-bottom: var(--margin-bottom);
                margin-left: var(--margin-left);
                margin-right: var(--margin-right);
              "
              @click.stop="setActiveSection(section)"
            >
              <!-- 工作经历 -->
              <div v-if="section === 'experience' && data.experiences.length > 0">
                <h2 class="text-lg font-bold text-gray-900 mb-3 border-b-2 pb-1" style="border-color: var(--primary-color)">工作经历</h2>
                <div class="space-y-6" style="gap: var(--spacing); display: flex; flex-direction: column;">
                  <div v-for="exp in data.experiences" :key="exp.id">
                    <div class="flex justify-between items-baseline mb-1">
                      <h3 class="font-bold text-gray-800" style="font-size: calc(var(--font-size) + 2px)">{{ exp.company }}</h3>
                      <span class="text-sm text-gray-500">{{ formatDateRange(exp.startDate, exp.endDate) }}</span>
                    </div>
                    <div class="font-semibold mb-2" style="color: var(--primary-color); font-size: var(--font-size)">{{ exp.position }}</div>
                    <div class="text-gray-600 rich-text" v-html="exp.description" style="font-size: var(--font-size); line-height: var(--line-height)"></div>
                  </div>
                </div>
              </div>

              <!-- 项目经验 -->
              <div v-else-if="section === 'projects' && data.projects.length > 0">
                <h2 class="text-lg font-bold text-gray-900 mb-3 border-b-2 pb-1" style="border-color: var(--primary-color)">项目经验</h2>
                <div class="space-y-6" style="gap: var(--spacing); display: flex; flex-direction: column;">
                  <div v-for="project in data.projects" :key="project.id">
                    <div class="flex justify-between items-baseline mb-1">
                      <h3 class="font-bold text-gray-800" style="font-size: calc(var(--font-size) + 2px)">{{ project.name }}</h3>
                      <span class="text-xs text-gray-600">{{ formatDateRange(project.startDate, project.endDate) }}</span>
                    </div>
                    <div class="font-semibold mb-2" style="color: var(--primary-color); font-size: var(--font-size)">{{ project.role }}</div>
                    <div class="text-gray-600 rich-text" v-html="project.description" style="font-size: var(--font-size); line-height: var(--line-height)"></div>
                    <div v-if="project.techStack && project.techStack.length" class="mt-2 text-xs text-gray-500">
                      <span class="font-medium">技术栈：</span>{{ project.techStack.join('、') }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 自定义模块 -->
              <div v-else-if="isCustomBlock(section)">
                <h2 class="text-lg font-bold text-gray-900 mb-3 border-b-2 pb-1" style="border-color: var(--primary-color)">
                  {{ getSectionTitle(section) }}
                </h2>
                <div v-if="Array.isArray(getCustomContent(section))" style="gap: var(--spacing); display: flex; flex-direction: column;">
                  <div v-for="item in getCustomItems(section)" :key="item.id" style="margin-bottom: 0">
                    <div class="flex justify-between items-baseline mb-1">
                      <div>
                        <h3 v-if="item.title" class="font-bold text-gray-900" style="font-size: calc(var(--font-size) + 2px)">{{ item.title }}</h3>
                        <div v-if="item.subtitle" class="text-gray-600" style="font-size: var(--font-size)">{{ item.subtitle }}</div>
                      </div>
                      <div v-if="item.date" class="text-sm text-gray-500 whitespace-nowrap ml-4">
                        {{ item.date }}
                      </div>
                    </div>
                    <div class="text-gray-700 rich-text" v-html="item.description" style="font-size: var(--font-size); line-height: var(--line-height)"></div>
                  </div>
                </div>
                <div v-else class="text-gray-700 rich-text" v-html="getCustomContent(section)" style="font-size: var(--font-size); line-height: var(--line-height)"></div>
              </div>
            </div>
          </template>
        </draggable>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ResumeData } from '@/types/resume';
import ResumeSmartFields from '@/components/preview/ResumeSmartFields.vue';
import ContactIcon from '@/components/common/ContactIcon.vue';
import draggable from 'vuedraggable';
import { useResumeStore } from '@/stores/resume';

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

// 筛选出主要内容区域的模块（排除侧边栏的教育和技能）
// 这是一个可写的 computed，支持 main-column 的排序
const sortedMainSections = computed({
  get: () => {
    return (props.data.sectionOrder || [])
      .filter(id => id !== 'education' && id !== 'skills') // 排除侧边栏固定模块
      .filter(id => {
        // 确保如果是标准模块，必须有数据才显示
        if (id === 'experience') return true;
        if (id === 'projects') return true;
        return isCustomBlock(id); // 自定义模块总是包含
      });
  },
  set: (newMainOrder: string[]) => {
    // 构造新的 sectionOrder：保留 Side Column 元素在原位置的相对顺序? 
    // 简化策略：将 newMainOrder 放在 sectionOrder 前面，Education/Skills 放在后面?
    // 或者更好: 保持 Education/Skills 在列表末尾 (或者在原始位置, 比较复杂)
    // 简单且稳健的策略: 先取非主要模块(Education, Skills)，然后合并新的主要模块
    const sideSections = (props.data.sectionOrder || []).filter(id => id === 'education' || id === 'skills');
    
    // 我们假设 Side Sections 总是位于最后 (或者我们强制它们在最后)
    // 但为了让 Editor 列表也能反映这个顺序，我们最好把 Side Sections 放在后面
    const newTotalOrder = [...newMainOrder, ...sideSections];
    
    // 注意: 这里有一个潜在问题，如果原先 Education 在 Experience 前面，现在会被强制移到后面
    // 对于 Professional 模板，Layout 是固定的 (Left/Right)，所以 Storage Order 并不严格决定 Layout Position
    // 但是 Storage Order 决定了 Editor Panel 的排序。
    // 为了用户体验一致性，我们接受这个副作用：在 Professional 模板下拖拽主要模块，会把 Education/Skills 挤到 Editor 列表底部
    resumeStore.updateSectionOrder(newTotalOrder);
  }
});

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

<style scoped>
.professional-template {
  color: #1a1a1a;
}
</style>
