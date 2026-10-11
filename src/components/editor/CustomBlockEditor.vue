
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useResumeStore } from '@/stores/resume';
import { Delete, Calendar, Edit, Hide, View, ArrowDown, ArrowUp } from '@element-plus/icons-vue';
import RichTextEditor from '@/components/common/RichTextEditor.vue';
import type { CustomItem } from '@/types/resume';

const props = defineProps<{
  id: string; // Block ID
  modelValue: string | CustomItem[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string | CustomItem[]];
  'delete': [];
}>();

const resumeStore = useResumeStore();
const collapsedItemIds = ref<string[]>([]);

const isItemCollapsed = (id: string) => collapsedItemIds.value.includes(id);

const toggleItemCollapsed = (id: string) => {
  collapsedItemIds.value = isItemCollapsed(id)
    ? collapsedItemIds.value.filter(itemId => itemId !== id)
    : [...collapsedItemIds.value, id];
};

// 判断是否为列表模式 (如果是数组，或者为空，或者用户选择了列表模式)
const isListMode = computed(() => Array.isArray(props.modelValue));

// 转换为列表模式
const switchToListMode = () => {
  if (!isListMode.value) {
    // 如果之前有文本内容，将其作为一个条目保留
    const initialContent = typeof props.modelValue === 'string' && props.modelValue ? props.modelValue : '';
    const initialItem = initialContent ? [{ 
      id: Date.now().toString(), 
      title: '默认条目', 
      subtitle: '', 
      date: '', 
      description: initialContent 
    }] : [];
    
    emit('update:modelValue', initialItem);
    // 同时更新 store 中的 type
    const block = resumeStore.data.customBlocks.find(b => b.id === props.id);
    if (block) block.type = 'list';
  }
};

const items = computed(() => {
  return Array.isArray(props.modelValue) ? props.modelValue : [];
});

const addItem = () => {
  resumeStore.addCustomItem(props.id, {
    title: '',
    subtitle: '',
    date: '',
    description: ''
  });
};

const updateItem = (itemId: string, updates: Partial<CustomItem>) => {
  resumeStore.updateCustomItem(props.id, itemId, updates);
};

const removeItem = (itemId: string) => {
  resumeStore.removeCustomItem(props.id, itemId);
};
defineExpose({ addItem });
</script>

<template>
  <div class="custom-block-editor">
    <!-- 文本模式 (兼容旧数据) -->
    <div v-if="!isListMode" class="space-y-4">
      <RichTextEditor
        :model-value="modelValue as string"
        @update:modelValue="(val) => $emit('update:modelValue', val)"
        placeholder="请输入内容..."
      />
      <div class="text-center">
        <el-button link type="primary" @click="switchToListMode">
          切换为多条目模式 (支持标题、时间等)
        </el-button>
      </div>
    </div>

    <!-- 列表模式 -->
    <div v-else class="space-y-6">
      <div v-if="items.length === 0" class="resume-editor-empty">
        <p class="text-gray-500">暂无条目，您可以添加多个项目</p>
      </div>

      <div v-for="(item, index) in items" :key="item.id" class="item-card resume-entry-card relative" :class="{ 'is-collapsed': isItemCollapsed(item.id) }">
        <div class="resume-entry-card__header">
          <span class="text-sm text-gray-600">自定义条目 {{ index + 1 }}</span>
          <div class="flex items-center gap-2">
            <el-button
              link
              :type="item.visible === false ? 'info' : ''"
              :icon="item.visible === false ? Hide : View"
              :aria-label="item.visible === false ? '显示此条目' : '隐藏此条目'"
              :title="item.visible === false ? '显示此条目' : '隐藏此条目'"
              @click="updateItem(item.id, { visible: item.visible === false })"
            />
            <el-button
              link
              :icon="isItemCollapsed(item.id) ? ArrowDown : ArrowUp"
              :aria-expanded="!isItemCollapsed(item.id)"
              :aria-label="isItemCollapsed(item.id) ? '展开此条目' : '折叠此条目'"
              :title="isItemCollapsed(item.id) ? '展开此条目' : '折叠此条目'"
              @click="toggleItemCollapsed(item.id)"
            />
            <el-button
              type="danger"
              link
              :icon="Delete"
              aria-label="删除此条目"
              title="删除此条目"
              @click="removeItem(item.id)"
            />
          </div>
        </div>

        <div v-show="!isItemCollapsed(item.id)" class="item-card__body">
          <div class="space-y-3">
          <!-- 标题行 -->
          <div class="item-heading-fields grid grid-cols-2 gap-3">
            <el-input 
              v-model="item.title" 
              placeholder="标题 (如: 奖项名称)" 
              @change="updateItem(item.id, { title: item.title })"
            >
              <template #prefix>
                <el-icon class="text-gray-400"><Edit /></el-icon>
              </template>
            </el-input>
            
            <el-input 
              v-model="item.subtitle" 
              placeholder="副标题 (如: 颁发机构/地点)" 
              @change="updateItem(item.id, { subtitle: item.subtitle })"
            />
          </div>

          <!-- 时间行 -->
          <div>
            <el-input 
              v-model="item.date" 
              placeholder="时间范围 (如: 2023.01 - 2024.01)" 
              @change="updateItem(item.id, { date: item.date })"
            >
              <template #prefix>
                <el-icon class="text-gray-400"><Calendar /></el-icon>
              </template>
            </el-input>
          </div>

          <!-- 描述 -->
          <div>
            <div class="text-xs text-gray-500 mb-1 ml-1">详细描述</div>
            <RichTextEditor
              :model-value="item.description"
              @update:modelValue="(val) => updateItem(item.id, { description: val })"
              placeholder="请输入详细描述..."
            />
          </div>
          </div>
        </div>
      </div>

    </div>

    <!-- 永久删除按钮 -->
    <div class="mt-6 pt-4 border-t border-gray-100 flex justify-end">
      <el-popconfirm
        title="确定要永久删除此模块吗？此操作不可恢复。"
        confirm-button-text="删除"
        cancel-button-text="取消"
        confirm-button-type="danger"
        @confirm="$emit('delete')"
      >
        <template #reference>
          <el-button link type="danger" size="small">永久删除此模块</el-button>
        </template>
      </el-popconfirm>
    </div>
  </div>
</template>
