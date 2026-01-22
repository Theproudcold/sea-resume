<template>
  <header class="app-header bg-white shadow-sm no-print">
    <div class="header-content flex items-center justify-between px-6 py-4">
      <div class="flex items-center gap-4">
        <!-- 返回按钮 -->
        <el-button text :icon="ArrowLeft" @click="$emit('back')">
          返回
        </el-button>

        <!-- Logo -->
        <div class="logo flex items-center gap-3">
          <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
            <span class="text-white font-bold text-xl">简</span>
          </div>
          <div>
            <h1 class="text-xl font-bold text-gray-800">简历制作工具</h1>
            <p class="text-xs text-gray-500">Sea Resume</p>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="actions flex items-center gap-3">
        <el-button @click="$emit('fullscreen')" :icon="FullScreen">
          全屏预览
        </el-button>
        <el-button @click="$router.push('/templates')" :icon="Grid">
          模板选择
        </el-button>
        <el-dropdown @command="handleExport">
          <el-button type="primary" :icon="Download">
            导出简历
            <el-icon class="el-icon--right"><arrow-down /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="pdf">
                <el-icon><document /></el-icon>
                导出为 PDF
              </el-dropdown-item>
              <el-dropdown-item command="image">
                <el-icon><picture /></el-icon>
                导出为图片
              </el-dropdown-item>
              <el-dropdown-item command="json">
                <el-icon><folder /></el-icon>
                导出为 JSON
              </el-dropdown-item>
              <el-dropdown-item command="print" divided>
                <el-icon><printer /></el-icon>
                打印
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Download, Grid, ArrowDown, ArrowLeft, FullScreen, Document, Folder, Printer } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

const emit = defineEmits<{
  export: [type: 'pdf' | 'image' | 'json' | 'print'];
  back: [];
  fullscreen: [];
}>();

const handleExport = (command: string) => {
  emit('export', command as 'pdf' | 'image' | 'json' | 'print');
};
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid #e5e7eb;
}

.header-content {
  max-width: 100%;
  margin: 0 auto;
}
</style>
