<template>
  <el-drawer
    :model-value="modelValue"
    :with-header="false"
    :size="drawerSize"
    class="version-history-drawer"
    modal-class="version-history-overlay"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="drawer-shell">
      <header class="drawer-head">
        <div class="drawer-title">
          <h2>版本历史</h2>
          <p>
            <span v-if="store.headHash">HEAD <code>{{ shortHash(store.headHash) }}</code></span>
            <span v-else>还没有版本记录</span>
            <span v-if="store.dirty" class="dirty-badge">● 未提交更改</span>
            <span v-else-if="store.refs" class="clean-badge">已提交</span>
          </p>
        </div>
        <div class="drawer-actions">
          <el-button type="primary" :disabled="!store.dirty || store.committing" :loading="store.committing" @click="openCommitDialog">
            提交版本
          </el-button>
          <el-button text @click="emit('update:modelValue', false)">关闭</el-button>
        </div>
      </header>

      <el-alert v-if="store.mirrorError" class="drawer-alert" type="warning" :closable="false" :title="store.mirrorError" />
      <el-alert v-if="store.error" class="drawer-alert" type="error" :closable="false" :title="store.error">
        <el-button size="small" @click="retryLoad">重试</el-button>
      </el-alert>

      <div v-if="store.loading" class="drawer-loading" role="status">正在读取版本历史…</div>
      <div v-else-if="!store.available" class="drawer-empty">
        <el-empty description="版本历史暂时不可用，编辑和保存不受影响" />
      </div>
      <div v-else class="history-body">
        <nav class="commit-list" aria-label="版本列表">
          <button
            type="button"
            class="commit-row working-row"
            :class="{ 'is-selected': store.isWorkingTreeSelected }"
            :aria-current="store.isWorkingTreeSelected ? 'true' : undefined"
            @click="selectCommit(null)"
          >
            <span class="graph" aria-hidden="true"><i class="dot hollow" /></span>
            <span class="commit-main">
              <strong>工作区</strong>
              <small>{{ store.dirty ? '未提交的修改' : '与最新版本一致' }}</small>
            </span>
            <span class="commit-stats">{{ store.dirty ? '未提交' : '干净' }}</span>
          </button>

          <div v-if="!store.commits.length" class="commit-list-empty">
            <p>还没有版本记录。</p>
            <p>编辑后提交第一个版本，就能随时对比和恢复。</p>
          </div>

          <button
            v-for="commit in store.commits"
            :key="commit.hash"
            type="button"
            class="commit-row"
            :class="{ 'is-selected': store.selectedHash === commit.hash, 'is-head': commit.hash === store.headHash }"
            :aria-current="store.selectedHash === commit.hash ? 'true' : undefined"
            @click="selectCommit(commit.hash)"
          >
            <span class="graph" aria-hidden="true"><i class="dot" /></span>
            <span class="commit-main">
              <strong>{{ commit.message }}</strong>
              <small>
                <code>{{ shortHash(commit.hash) }}</code>
                <span>·</span>
                <span>{{ relativeTime(commit.createdAt) }}</span>
                <span>·</span>
                <span>{{ kindLabel(commit.kind) }}</span>
                <span v-if="commit.hash === store.headHash" class="head-tag">HEAD</span>
              </small>
              <span v-if="commit.tags.length" class="tag-row">
                <el-tag v-for="tag in commit.tags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
              </span>
            </span>
            <span class="commit-stats">
              <span v-if="commit.stats.additions" class="add">+{{ commit.stats.additions }}</span>
              <span v-if="commit.stats.deletions" class="del">−{{ commit.stats.deletions }}</span>
            </span>
          </button>

          <p v-if="store.refs?.truncated" class="truncated-note">更早的版本已按保留策略清理。</p>
        </nav>

        <section class="commit-detail" aria-live="polite">
          <div v-if="store.diffLoading" class="detail-loading" role="status">正在读取版本内容…</div>
          <template v-else>
            <header class="detail-head">
              <div>
                <h3>{{ detailTitle }}</h3>
                <p v-if="store.detail">
                  <code>{{ shortHash(store.detail.hash) }}</code>
                  <span>·</span>
                  <span>{{ store.detail.author }}</span>
                  <span>·</span>
                  <time :datetime="store.detail.createdAt">{{ absoluteTime(store.detail.createdAt) }}</time>
                  <template v-if="store.detail.parentHash">
                    <span>·</span>
                    <span>父版本 <code>{{ shortHash(store.detail.parentHash) }}</code></span>
                  </template>
                </p>
                <p v-else>当前编辑内容与最新版本的差异。提交后这段差异会固定下来。</p>
              </div>
              <div class="detail-actions">
                <el-button v-if="store.detail" plain :disabled="store.restoring" @click="addTag">添加标签</el-button>
                <el-button v-if="store.detail" type="primary" plain :loading="store.restoring" :disabled="store.committing" @click="restoreCommit">
                  恢复此版本
                </el-button>
              </div>
            </header>

            <div v-if="store.detail?.tags.length" class="detail-tags">
              <el-tag
                v-for="tag in store.detail.tags"
                :key="tag"
                closable
                effect="plain"
                @close="removeTag(tag)"
              >{{ tag }}</el-tag>
            </div>

            <p v-if="store.parentMissing" class="parent-note">父版本已被保留策略清理，无法显示逐行对比。</p>
            <CommitDiffView v-if="store.diff" :diff="store.diff" />
            <el-empty v-else description="选择一个版本查看差异" />
          </template>
        </section>
      </div>
    </div>

    <el-dialog v-model="showCommitDialog" title="提交版本" width="var(--ui-dialog-width-sm, 520px)" align-center append-to-body class="app-dialog">
      <el-form label-position="top" @submit.prevent="submitCommit">
        <el-form-item label="提交消息" required>
          <el-input
            v-model="commitMessage"
            type="textarea"
            :rows="2"
            maxlength="120"
            show-word-limit
            placeholder="例如：更新项目经历，补充性能优化结果"
            @keydown.ctrl.enter.prevent="submitCommit"
            @keydown.meta.enter.prevent="submitCommit"
          />
        </el-form-item>
        <p v-if="suggestedMessage && suggestedMessage !== commitMessage" class="suggest-message">
          建议：{{ suggestedMessage }}
          <el-button text size="small" @click="commitMessage = suggestedMessage">使用</el-button>
        </p>
        <el-form-item label="标签（选填，用逗号分隔）">
          <el-input v-model="commitTag" maxlength="64" placeholder="例如：投递 Acme" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCommitDialog = false">取消</el-button>
        <el-button type="primary" :loading="store.committing" :disabled="!commitMessage.trim()" @click="submitCommit">提交</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useHistoryStore } from '@/stores/history';
import { shortHash } from '@/services/history/hash';
import type { ResumeCommitKind } from '@/types/history';
import { describeError } from '@/utils/globalErrorReporting';
import CommitDiffView from './CommitDiffView.vue';

const props = defineProps<{ modelValue: boolean; resumeId: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const store = useHistoryStore();

const viewportWidth = ref(typeof window === 'undefined' ? 1024 : window.innerWidth);
const drawerSize = computed(() => (viewportWidth.value <= 900 ? '100%' : '880px'));
const updateViewport = () => { viewportWidth.value = window.innerWidth; };

onMounted(() => window.addEventListener('resize', updateViewport));
onUnmounted(() => window.removeEventListener('resize', updateViewport));

const showCommitDialog = ref(false);
const commitMessage = ref('');
const commitTag = ref('');
const suggestedMessage = ref('');

const detailTitle = computed(() => {
  if (!store.detail) return '工作区';
  return store.detail.message;
});

const KIND_LABELS: Record<ResumeCommitKind, string> = {
  initial: '初始版本',
  manual: '手动提交',
  auto: '自动保存',
  restore: '恢复',
  ai: 'AI 修改',
  import: '导入',
};

function kindLabel(kind: ResumeCommitKind): string {
  return KIND_LABELS[kind] ?? kind;
}

function relativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '未知时间';
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, 'day');
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

function absoluteTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

async function load(): Promise<void> {
  if (!props.resumeId) return;
  await store.open(props.resumeId);
}

watch(() => [props.modelValue, props.resumeId] as const, ([visible]) => {
  if (visible) void load();
  else showCommitDialog.value = false;
}, { immediate: true });

function selectCommit(hash: string | null): void {
  void store.select(hash);
}

async function openCommitDialog(): Promise<void> {
  if (!store.dirty) {
    ElMessage.info('当前内容与最新版本一致，没有可提交的更改。');
    return;
  }
  commitMessage.value = '';
  commitTag.value = '';
  suggestedMessage.value = '';
  showCommitDialog.value = true;
  suggestedMessage.value = await store.suggestMessage();
  if (!commitMessage.value) commitMessage.value = suggestedMessage.value;
}

async function submitCommit(): Promise<void> {
  const message = commitMessage.value.trim();
  if (!message) return;
  const tags = commitTag.value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
  try {
    await store.commit({ message, kind: 'manual', tags });
    showCommitDialog.value = false;
    ElMessage.success('版本已提交');
  } catch (error) {
    ElMessage.error(describeError(error));
  }
}

async function restoreCommit(): Promise<void> {
  const commit = store.detail;
  if (!commit) return;
  try {
    await ElMessageBox.confirm(
      `将把 ${shortHash(commit.hash)} 的内容恢复到当前简历，并新增一条“恢复”提交。当前未提交的修改会先自动保存，版本历史不会丢失。`,
      '恢复此版本',
      {
        confirmButtonText: '恢复并保留历史',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
    await store.restore(commit.hash);
    ElMessage.success('已恢复，并新增一条恢复提交');
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(describeError(error));
  }
}

async function addTag(): Promise<void> {
  const commit = store.detail;
  if (!commit) return;
  try {
    const { value } = await ElMessageBox.prompt('输入一个便于识别的标签，例如“投递 Acme”', '添加标签', {
      confirmButtonText: '添加',
      cancelButtonText: '取消',
      inputValue: '',
      inputValidator: (input: string) => {
        const tag = input.trim();
        if (!tag) return '标签不能为空';
        if (tag.length > 32) return '标签不能超过 32 个字符';
        if (commit.tags.includes(tag)) return '这个版本已经有该标签';
        return true;
      },
    });
    await store.setTags(commit.hash, [...commit.tags, value.trim()]);
    ElMessage.success('标签已添加');
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(describeError(error));
  }
}

async function removeTag(tag: string): Promise<void> {
  const commit = store.detail;
  if (!commit) return;
  try {
    await store.setTags(commit.hash, commit.tags.filter((entry) => entry !== tag));
  } catch (error) {
    ElMessage.error(describeError(error));
  }
}

async function retryLoad(): Promise<void> {
  await store.open(props.resumeId);
}
</script>

<style scoped>
.drawer-shell { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 24px 16px; border-bottom: 1px solid var(--ui-border); }
.drawer-title h2 { margin: 0; font-size: var(--ui-font-lg); color: var(--ui-text-main); }
.drawer-title p { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 6px 0 0; color: var(--ui-text-secondary); font-size: var(--ui-font-xs); }
.drawer-title code { font-family: var(--ui-font-mono, ui-monospace, monospace); }
.dirty-badge { color: var(--ui-warning); }
.clean-badge { color: var(--ui-success); }
.drawer-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.drawer-alert { margin: 12px 24px 0; }
.drawer-loading, .detail-loading { padding: 48px 24px; color: var(--ui-text-secondary); text-align: center; }
.drawer-empty { padding: 48px 24px; }
.history-body { display: grid; grid-template-columns: 320px minmax(0, 1fr); flex: 1; min-height: 0; }
.commit-list { overflow-y: auto; padding: 12px 8px 24px; border-right: 1px solid var(--ui-border); background: var(--ui-bg-subtle); }
.commit-row { position: relative; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: start; gap: 8px; width: 100%; padding: 10px 8px; border: 0; border-radius: var(--ui-radius-sm); background: transparent; color: inherit; text-align: left; cursor: pointer; transition: background-color 140ms ease, box-shadow 140ms ease; }
.commit-row:hover { background: color-mix(in srgb, var(--ui-primary) 4%, transparent); }
.commit-row:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: -2px; }
.commit-row.is-selected {
  background: color-mix(in srgb, var(--ui-primary) 10%, var(--ui-bg-surface));
  box-shadow:
    inset 3px 0 0 var(--ui-primary),
    inset 0 0 0 1px color-mix(in srgb, var(--ui-primary) 24%, transparent);
}
.commit-row.is-selected .commit-main strong { color: color-mix(in srgb, var(--ui-primary) 55%, var(--ui-text-main)); }
.commit-row.is-selected .dot { width: 11px; height: 11px; margin-top: 4px; box-shadow: 0 0 0 4px color-mix(in srgb, var(--ui-primary) 16%, transparent); }
.commit-row.is-selected .graph::before { background: color-mix(in srgb, var(--ui-primary) 32%, var(--ui-border)); }
.graph { position: relative; display: flex; justify-content: center; align-self: stretch; }
.graph::before { content: ''; position: absolute; top: 0; bottom: -20px; width: 2px; background: var(--ui-border); }
.commit-row:last-of-type .graph::before { display: none; }
.dot { position: relative; z-index: 1; width: 9px; height: 9px; margin-top: 5px; border-radius: 50%; background: var(--ui-primary); box-shadow: 0 0 0 3px var(--ui-bg-subtle); }
.dot.hollow { background: var(--ui-bg-surface); border: 2px solid var(--ui-text-muted); }
.commit-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.commit-main strong { font-size: var(--ui-font-sm); font-weight: 600; color: var(--ui-text-main); overflow-wrap: anywhere; }
.commit-main small { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; color: var(--ui-text-muted); font-size: 11px; }
.commit-main code { font-family: var(--ui-font-mono, ui-monospace, monospace); }
.head-tag { padding: 0 4px; border: 1px solid var(--ui-border); border-radius: 4px; color: var(--ui-text-secondary); }
.tag-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.commit-stats { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; padding-top: 2px; font-family: var(--ui-font-mono, ui-monospace, monospace); font-size: 11px; white-space: nowrap; }
.commit-stats .add { color: var(--ui-success); }
.commit-stats .del { color: var(--ui-danger); }
.commit-list-empty { padding: 20px 10px; color: var(--ui-text-secondary); font-size: var(--ui-font-xs); line-height: 1.6; }
.commit-list-empty p { margin: 0 0 4px; }
.truncated-note { margin: 12px 10px; color: var(--ui-text-muted); font-size: 11px; }
.commit-detail { overflow-y: auto; padding: 20px 24px 40px; min-width: 0; }
.detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 12px; }
.detail-head h3 { margin: 0; font-size: var(--ui-font-md); color: var(--ui-text-main); overflow-wrap: anywhere; }
.detail-head p { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0 0; color: var(--ui-text-secondary); font-size: var(--ui-font-xs); }
.detail-head code { font-family: var(--ui-font-mono, ui-monospace, monospace); }
.detail-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; flex-shrink: 0; }
.detail-tags { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 0 12px; }
.parent-note { margin: 0 0 12px; padding: 8px 10px; border-radius: var(--ui-radius-sm); background: var(--ui-bg-subtle); color: var(--ui-text-secondary); font-size: var(--ui-font-xs); }
.suggest-message { margin: -6px 0 12px; color: var(--ui-text-secondary); font-size: var(--ui-font-xs); }
:global(.version-history-drawer) { width: min(880px, 100vw) !important; }
:global(.version-history-drawer .el-drawer__body) { display: flex; flex-direction: column; padding: 0; overflow: hidden; }
@media (prefers-reduced-motion: reduce) {
  .commit-row { transition: none; }
}
@media (max-width: 720px) {
  .drawer-head { padding: 16px; flex-direction: column; }
  .drawer-actions { width: 100%; justify-content: flex-end; }
  .history-body { display: flex; flex-direction: column; overflow-y: auto; }
  .commit-list { max-height: 38vh; border-right: 0; border-bottom: 1px solid var(--ui-border); flex-shrink: 0; }
  .commit-detail { overflow: visible; padding: 16px; }
  .detail-head { flex-direction: column; }
  .detail-actions { width: 100%; justify-content: flex-start; }
}
</style>
