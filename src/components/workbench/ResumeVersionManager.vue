<template>
  <el-dialog
    :model-value="modelValue"
    title="岗位版本与内容对比"
    width="min(820px, calc(100vw - 32px))"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-tabs>
      <el-tab-pane label="创建岗位版本">
        <el-form label-position="top">
          <el-form-item label="基于简历">
            <el-select v-model="sourceId" class="w-full" placeholder="选择基础简历">
              <el-option v-for="resume in resumes" :key="resume.id" :label="resume.title" :value="resume.id" />
            </el-select>
          </el-form-item>
          <div class="target-grid">
            <el-form-item label="版本名称"><el-input v-model="versionName" maxlength="80" placeholder="例如：Acme 前端工程师" /></el-form-item>
            <el-form-item label="目标公司"><el-input v-model="company" maxlength="80" placeholder="选填" /></el-form-item>
            <el-form-item label="目标岗位"><el-input v-model="position" maxlength="80" placeholder="例如：前端工程师" /></el-form-item>
          </div>
        </el-form>
        <p class="help-text">新版本会复制当前内容；后续修改不会影响原简历。</p>
        <el-button type="primary" :loading="creating" :disabled="!sourceId || !versionName.trim()" @click="createVersion">创建独立版本</el-button>
      </el-tab-pane>
      <el-tab-pane label="比较简历">
        <div class="compare-controls">
          <el-select v-model="beforeId" placeholder="选择版本 A">
            <el-option v-for="resume in resumes" :key="`a-${resume.id}`" :label="resume.title" :value="resume.id" />
          </el-select>
          <span>对比</span>
          <el-select v-model="afterId" placeholder="选择版本 B">
            <el-option v-for="resume in resumes" :key="`b-${resume.id}`" :label="resume.title" :value="resume.id" />
          </el-select>
          <el-button type="primary" :loading="comparing" :disabled="!beforeId || !afterId || beforeId === afterId" @click="compare">查看差异</el-button>
        </div>
        <el-alert v-if="compareError" type="error" :closable="false" :title="compareError" />
        <el-empty v-else-if="compared && !differences.length" description="两个版本的简历内容没有差异。" />
        <el-table v-else-if="compared" :data="differences" size="small" max-height="360">
          <el-table-column prop="path" label="字段 / 章节" min-width="170" />
          <el-table-column prop="before" label="版本 A" min-width="200" show-overflow-tooltip />
          <el-table-column prop="after" label="版本 B" min-width="200" show-overflow-tooltip />
        </el-table>
        <el-empty v-else description="选择两份简历后查看字段差异。" />
      </el-tab-pane>
    </el-tabs>
    <template #footer><el-button @click="emit('update:modelValue', false)">关闭</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { ResumeMeta, ResumeData } from '@/types/resume';
import { useWorkbenchStore } from '@/stores/workbench';
import { storageManager } from '@/services/storage/StorageManager';
import { compareResumeVersions, type ResumeDifference } from '@/utils/resumeVersions';

const props = defineProps<{ modelValue: boolean; resumes: ResumeMeta[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [id: string] }>();
const workbench = useWorkbenchStore();
const sourceId = ref('');
const versionName = ref('');
const company = ref('');
const position = ref('');
const creating = ref(false);
const beforeId = ref('');
const afterId = ref('');
const comparing = ref(false);
const compared = ref(false);
const compareError = ref('');
const differences = ref<ResumeDifference[]>([]);

watch(() => props.resumes, (resumes) => {
  if (!resumes.some((resume) => resume.id === sourceId.value)) sourceId.value = resumes[0]?.id || '';
  if (!resumes.some((resume) => resume.id === beforeId.value)) beforeId.value = resumes[0]?.id || '';
  if (!resumes.some((resume) => resume.id === afterId.value)) afterId.value = resumes[1]?.id || '';
}, { immediate: true });

async function createVersion() {
  if (!sourceId.value || !versionName.value.trim()) return;
  creating.value = true;
  try {
    const id = await workbench.createJobVersion(sourceId.value, {
      versionName: versionName.value,
      company: company.value,
      position: position.value,
    });
    ElMessage.success('岗位版本已创建，原简历保持不变。');
    emit('created', id);
  } catch (error) {
    ElMessage.error(`创建岗位版本失败：${error instanceof Error ? error.message : '未知错误'}`);
  } finally {
    creating.value = false;
  }
}

async function compare() {
  compared.value = false;
  compareError.value = '';
  comparing.value = true;
  try {
    const [before, after] = await Promise.all([storageManager.read(beforeId.value), storageManager.read(afterId.value)]);
    if (!before || !after) throw new Error('无法读取所选简历，请刷新工作台后重试。');
    differences.value = compareResumeVersions(before as ResumeData, after as ResumeData);
    compared.value = true;
  } catch (error) {
    compareError.value = error instanceof Error ? error.message : '读取简历失败。';
  } finally {
    comparing.value = false;
  }
}
</script>

<style scoped>
.target-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.compare-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.compare-controls .el-select { flex: 1; min-width: 0; }
.help-text { color: var(--ui-text-muted); font-size: var(--ui-font-sm); }
@media (max-width: 600px) {
  .target-grid { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .compare-controls { align-items: stretch; flex-direction: column; }
  .compare-controls span { display: none; }
  .compare-controls :deep(.el-button) { width: 100%; }
}
</style>
