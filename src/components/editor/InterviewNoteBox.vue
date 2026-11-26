<template>
  <div class="interview-note-box">
    <div class="interview-note-box__header">
      <el-button
        link
        size="small"
        data-testid="interview-note-toggle"
        @click="open = !open"
      >
        {{ open ? '收起面试口述备忘' : (hasContent ? '展开面试口述备忘（已记录）' : '添加面试口述备忘（预留弹药）') }}
      </el-button>
      <span class="interview-note-box__badge">仅本机私密保存 · 不展示不导出</span>
    </div>

    <div v-if="open" class="interview-note-box__panel">
      <p class="interview-note-box__tip">
        纸面简历只放精炼结果，把个人贡献占比、技术取舍背景和准备口述的扩展成果记在这里，面试前随时翻看。
      </p>
      <label class="interview-note-box__field">
        <span>个人贡献与边界</span>
        <el-input
          v-model="draft.contribution"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 4 }"
          placeholder="例如：小组共 4 人，我主导核心链路架构设计与压测调优，贡献约占项目主线 70%"
          @input="persist"
        />
      </label>
      <label class="interview-note-box__field">
        <span>预留口述细节（纸面未写全的成果/过程）</span>
        <el-input
          v-model="draft.talkingPoints"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          placeholder="例如：为什么最终选了方案 B 而非方案 A、落地过程中解决的最棘手坑点"
          @input="persist"
        />
      </label>
      <label class="interview-note-box__field">
        <span>高频追问底稿</span>
        <el-input
          v-model="draft.qaPrep"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 4 }"
          placeholder="例如：数据指标统计口径、压测机器配置、如果流量再翻 10 倍如何演进"
          @input="persist"
        />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  hasInterviewNoteContent,
  loadInterviewNote,
  saveInterviewNote,
} from '@/services/career/interviewNotes';

const props = defineProps<{
  resumeId: string;
  entryKey: string;
}>();

const open = ref(false);
const draft = reactive({
  contribution: '',
  talkingPoints: '',
  qaPrep: '',
});

const hasContent = computed(() => hasInterviewNoteContent(draft));

function hydrate() {
  const saved = loadInterviewNote(props.resumeId, props.entryKey);
  draft.contribution = saved.contribution;
  draft.talkingPoints = saved.talkingPoints;
  draft.qaPrep = saved.qaPrep;
}

function persist() {
  saveInterviewNote(props.resumeId, props.entryKey, draft);
}

watch(() => [props.resumeId, props.entryKey], hydrate, { immediate: true });
</script>

<style scoped>
.interview-note-box {
  width: 100%;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--ui-border);
}

.interview-note-box__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.interview-note-box__badge {
  color: var(--ui-text-muted);
  font-size: 11px;
}

.interview-note-box__panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
  padding: 12px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-bg-subtle);
}

.interview-note-box__tip {
  margin: 0;
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-xs);
  line-height: 1.5;
}

.interview-note-box__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.interview-note-box__field span {
  color: var(--ui-text-secondary);
  font-size: var(--ui-font-xs);
  font-weight: 500;
}
</style>
