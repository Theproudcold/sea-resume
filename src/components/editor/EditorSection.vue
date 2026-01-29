<template>
  <div class="editor-section border border-gray-200 rounded-lg bg-white overflow-hidden mb-4 transition-all hover:shadow-sm">
    <!-- Header -->
    <div 
      class="section-header flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer select-none"
      @click="toggleOpen"
    >
      <div class="flex items-center gap-3 flex-1">
        <el-icon class="drag-handle cursor-move text-gray-400 hover:text-gray-600" @click.stop>
          <Rank />
        </el-icon>
        
        <div class="flex items-center gap-2 flex-1" @click.stop>
          <el-icon v-if="icon" class="text-gray-500"><component :is="icon" /></el-icon>
          
          <!-- Editable Title -->
          <div v-if="isEditingTitle" class="flex-1 max-w-[200px]">
            <el-input 
              v-model="localTitle" 
              size="small" 
              ref="titleInputRef"
              @blur="saveTitle"
              @keyup.enter="saveTitle"
            />
          </div>
          <span 
            v-else 
            class="font-medium text-gray-700 hover:text-blue-600 transition-colors"
            @click="startEditingTitle"
            title="点击修改标题"
          >
            {{ title || '未命名模块' }}
            <el-icon class="ml-1 text-gray-300 text-xs"><EditPen /></el-icon>
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <el-button 
          v-if="removable" 
          type="danger" 
          link 
          :icon="Delete" 
          @click.stop="$emit('remove')"
        />
        <el-icon :class="['transition-transform duration-300', isOpen ? 'rotate-180' : '']">
          <ArrowDown />
        </el-icon>
      </div>
    </div>

    <!-- Body -->
    <div v-show="isOpen" class="section-body p-4 border-t border-gray-100">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue';
import { Rank, ArrowDown, EditPen, Delete } from '@element-plus/icons-vue';

const props = defineProps<{
  id: string;
  title: string;
  isOpen: boolean;
  icon?: any;
  removable?: boolean;
}>();

const emit = defineEmits<{
  'update:isOpen': [value: boolean];
  'update:title': [value: string];
  'remove': [];
}>();

const localTitle = ref(props.title);
const isEditingTitle = ref(false);
const titleInputRef = ref();

watch(() => props.title, (newVal) => {
  localTitle.value = newVal;
});

const toggleOpen = () => {
  emit('update:isOpen', !props.isOpen);
};

const startEditingTitle = () => {
  isEditingTitle.value = true;
  nextTick(() => {
    titleInputRef.value?.focus();
  });
};

const saveTitle = () => {
  isEditingTitle.value = false;
  if (localTitle.value.trim() !== props.title) {
    emit('update:title', localTitle.value.trim());
  }
};
</script>

<style scoped>
.editor-section {
  transition: all 0.2s ease;
}
.editor-section:hover {
  border-color: #d1d5db;
}
</style>
