<template>
  <el-dialog
    :model-value="modelValue"
    title="岗位版本与内容对比"
    width="var(--ui-dialog-width-xl)"
    align-center
    modal-class="resume-version-manager-overlay"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-tabs v-model="activeTab">
      <el-tab-pane name="create" label="创建岗位版本">
        <el-form label-position="top">
          <el-form-item label="基于简历" required>
            <el-select v-model="sourceId" class="w-full" placeholder="选择基础简历">
              <el-option v-for="resume in resumes" :key="resume.id" :label="resume.title" :value="resume.id" />
            </el-select>
          </el-form-item>
          <div class="target-grid">
            <el-form-item label="版本名称" required><el-input v-model="versionName" maxlength="80" placeholder="例如：Acme 前端工程师" /></el-form-item>
            <el-form-item label="目标公司（选填）"><el-input v-model="company" maxlength="80" placeholder="选填" /></el-form-item>
            <el-form-item label="目标岗位（选填）"><el-input v-model="position" maxlength="80" placeholder="例如：前端工程师" /></el-form-item>
          </div>
        </el-form>
        <p class="help-text">新版本是独立副本，修改不会影响原简历。</p>
        <p v-if="!resumes.length" class="help-text">请先在工作台创建一份简历，再为不同岗位创建版本。</p>
        <el-alert v-if="createError" type="error" :closable="false" :title="createError" />
        <el-button type="primary" :loading="creating" :disabled="!sourceId || !versionName.trim()" @click="createVersion">创建独立版本</el-button>
      </el-tab-pane>

      <el-tab-pane name="compare" label="比较简历">
        <div class="compare-controls">
          <label class="version-select">
            <span>版本 A</span>
            <el-select v-model="beforeId" placeholder="选择基础版本">
              <el-option v-for="resume in resumes" :key="`a-${resume.id}`" :label="resumeOptionLabel(resume)" :value="resume.id" />
            </el-select>
          </label>
          <span class="compare-divider">对比</span>
          <label class="version-select">
            <span>版本 B</span>
            <el-select v-model="afterId" placeholder="选择目标版本">
              <el-option v-for="resume in resumes" :key="`b-${resume.id}`" :label="resumeOptionLabel(resume)" :value="resume.id" />
            </el-select>
          </label>
          <el-button :type="compared && differences.length ? 'default' : 'primary'" :loading="comparing" :disabled="!beforeId || !afterId || beforeId === afterId || comparing" @click="compare">查看差异</el-button>
        </div>
        <p v-if="beforeId && beforeId === afterId" class="compare-hint" role="status">请选择两份不同的简历。</p>
        <p v-else class="compare-hint">比较正文内容，不含模板和排版。</p>

        <el-alert v-if="compareError" class="compare-error" type="error" :closable="false" :title="compareError" />
        <el-empty v-else-if="compared && !differences.length" description="这两份简历的正文内容完全一致。" />
        <p v-else-if="comparing" class="compare-hint" role="status">正在比较简历…</p>
        <el-empty v-else-if="!compared" :description="resumes.length < 2 ? '需要两份简历才能比较' : '选择两份简历，查看内容有什么不同'">
          <el-button v-if="resumes.length === 1" @click="activeTab = 'create'">创建岗位版本</el-button>
        </el-empty>

        <section v-else class="compare-results" aria-label="简历内容差异">
          <header class="compare-summary">
            <div>
              <strong>{{ differences.length }} 处内容变化</strong>
              <p>勾选要采用的修改，再另存为新简历。</p>
            </div>
            <div class="change-counts" aria-label="变化统计">
              <span class="count-chip added">新增 <b>{{ changeCounts.added }}</b></span>
              <span class="count-chip modified">修改 <b>{{ changeCounts.modified }}</b></span>
              <span class="count-chip removed">删除 <b>{{ changeCounts.removed }}</b></span>
              <span v-if="changeCounts.formatted" class="count-chip formatted">格式 <b>{{ changeCounts.formatted }}</b></span>
            </div>
          </header>
          <div class="merge-actions">
            <label class="select-all-differences">
              <input
                type="checkbox"
                :checked="allFilteredSelected"
                :indeterminate="someFilteredSelected && !allFilteredSelected"
                aria-label="全选当前筛选的差异"
                @change="toggleAllDifferences"
              />
              <span>全选当前结果</span>
            </label>
            <span>已选 {{ selectedDifferenceIds.length }} / {{ differences.length }} 项采纳版本 B；当前显示 {{ filteredDifferences.length }} 项</span>
            <input v-model="mergeTitle" type="text" maxlength="80" aria-label="新简历名称" placeholder="输入合并后新简历名称" />
            <el-button type="primary" :loading="savingMerged" :disabled="!selectedDifferenceIds.length || !mergeTitle.trim()" @click="createMergedVersion">另存为新简历</el-button>
          </div>
          <p class="merge-note">勾选项采用版本 B，未勾选项保留版本 A。这里只创建副本，不会修改 A 或 B。</p>

          <div class="diff-filters">
            <input v-model="searchText" type="search" aria-label="搜索差异" placeholder="搜索章节、条目或内容" />
            <select v-model="sectionFilter" aria-label="按章节筛选">
              <option value="all">全部章节</option>
              <option v-for="section in sectionOptions" :key="section" :value="section">{{ section }}</option>
            </select>
            <select v-model="typeFilter" aria-label="按变化类型筛选">
              <option value="all">全部变化</option>
              <option value="added">仅看新增</option>
              <option value="modified">仅看修改</option>
              <option value="removed">仅看删除</option>
              <option value="formatted">仅看格式</option>
            </select>
          </div>

          <div v-if="groupedDifferences.length" class="diff-list">
            <div class="version-headings">
              <div class="version-heading-spacer"></div>
              <div class="version-heading"><span>版本 A</span><strong>{{ selectedTitle(beforeId) }}</strong><small>{{ selectedUpdatedAt(beforeId) }}</small></div>
              <div class="version-heading"><span>版本 B</span><strong>{{ selectedTitle(afterId) }}</strong><small>{{ selectedUpdatedAt(afterId) }}</small></div>
            </div>
            <section v-for="group in groupedDifferences" :key="group.section" class="diff-section">
              <header class="diff-section-head">
                <div class="diff-section-title">
                  <h3>{{ group.section }}</h3>
                  <span>{{ group.rows.length }} 处</span>
                  <label class="adopt-toggle section-adopt">
                    <input
                      type="checkbox"
                      :checked="sectionSelectionState(group).all"
                      :indeterminate="sectionSelectionState(group).some"
                      :aria-label="`采纳本节版本 B：${group.section}`"
                      @change="toggleSectionDifferences(group, $event)"
                    />
                    <span>采纳本节</span>
                  </label>
                </div>
                <p v-if="hasReplacementPair(group.rows)" class="swap-hint">本节的整项新增与删除未能按身份对应；同时勾选两边会用新条目替换旧条目。</p>
              </header>
              <article
                v-for="row in group.rows"
                :key="row.difference.id"
                class="diff-row"
                :class="`is-${row.difference.type}`"
              >
                <div class="diff-description">
                  <span class="change-badge" :class="`badge-${row.difference.type}`">{{ changeTypeLabel(row.difference.type) }}</span>
                  <div><strong>{{ row.difference.item }}</strong><small>{{ row.difference.field }}</small></div>
                  <label class="adopt-toggle">
                    <input v-model="selectedDifferenceIds" type="checkbox" :value="row.difference.id" :aria-label="`采纳版本 B：${row.difference.item} ${row.difference.field}`" />
                    <span>采纳 B</span>
                  </label>
                </div>
                <div class="diff-value">
                  <span class="mobile-version-label"><span>版本 A</span><span>{{ selectedTitle(beforeId) }}</span></span>
                  <p v-if="row.before.length">
                    <span
                      v-for="(segment, index) in row.before"
                      :key="`b-${index}`"
                      class="diff-line"
                      :class="{ 'is-changed': segment.changed }"
                    >{{ segment.text || ' ' }}</span>
                  </p>
                  <p v-else>{{ displayedValue(row.difference, 'before') }}</p>
                </div>
                <div class="diff-value">
                  <span class="mobile-version-label"><span>版本 B</span><span>{{ selectedTitle(afterId) }}</span></span>
                  <p v-if="row.after.length">
                    <span
                      v-for="(segment, index) in row.after"
                      :key="`a-${index}`"
                      class="diff-line"
                      :class="{ 'is-changed': segment.changed }"
                    >{{ segment.text || ' ' }}</span>
                  </p>
                  <p v-else>{{ displayedValue(row.difference, 'after') }}</p>
                </div>
              </article>
            </section>
          </div>
          <el-empty v-else description="没有匹配的差异">
            <el-button @click="searchText = ''; sectionFilter = 'all'; typeFilter = 'all'">清除筛选</el-button>
          </el-empty>
        </section>
      </el-tab-pane>
      <el-tab-pane name="history" label="岗位版本历史">
        <p class="history-intro">这里汇总保存过的岗位版本及其来源。岗位版本是独立副本，原简历不会被覆盖。</p>
        <el-alert v-if="historyError" type="error" :closable="false" :title="historyError" />
        <p v-else-if="historyLoading" class="history-state">正在读取岗位版本…</p>
        <el-empty v-else-if="!historyEntries.length" description="还没有岗位版本">
          <el-button v-if="resumes.length" type="primary" @click="activeTab = 'create'">创建岗位版本</el-button>
        </el-empty>
        <div v-else class="history-list">
          <article v-for="entry in historyEntries" :key="entry.resume.id" class="history-entry">
            <div class="history-entry-main">
              <strong>{{ entry.jobTarget.versionName || entry.resume.title }}</strong>
              <span>{{ [entry.jobTarget.company, entry.jobTarget.position].filter(Boolean).join(' · ') || '未填写目标岗位' }}</span>
              <small>来源：{{ entry.sourceTitle || '原始简历已删除' }}</small>
            </div>
            <div class="history-entry-actions">
              <small>更新于 {{ formatUpdatedAt(entry.resume.updatedAt) || '未知时间' }}</small>
              <el-button size="small" :disabled="!entry.sourceTitle" @click="openVersionComparison(entry)">比较源版本</el-button>
            </div>
          </article>
        </div>
      </el-tab-pane>
    </el-tabs>
    <template #footer><el-button @click="emit('update:modelValue', false)">关闭</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { ResumeMeta, ResumeData, ResumeJobTarget } from '@/types/resume';
import { useWorkbenchStore } from '@/stores/workbench';
import { storageManager } from '@/services/storage/StorageManager';
import { applyResumeDifferences, compareResumeVersions, type ResumeDifference, type ResumeDifferenceType } from '@/utils/resumeVersions';
import { describeError } from '@/utils/globalErrorReporting';

interface JobVersionHistoryEntry {
  resume: ResumeMeta;
  jobTarget: ResumeJobTarget;
  sourceTitle: string;
}

interface DiffSegment {
  text: string;
  changed: boolean;
}

interface DiffRow {
  difference: ResumeDifference;
  before: DiffSegment[];
  after: DiffSegment[];
}

const props = defineProps<{ modelValue: boolean; resumes: ResumeMeta[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [id: string] }>();
const workbench = useWorkbenchStore();
const sourceId = ref('');
const versionName = ref('');
const company = ref('');
const position = ref('');
const creating = ref(false);
const createError = ref('');
const beforeId = ref('');
const afterId = ref('');
const comparing = ref(false);
const compared = ref(false);
const compareError = ref('');
const differences = ref<ResumeDifference[]>([]);
const searchText = ref('');
const sectionFilter = ref('all');
const typeFilter = ref<ResumeDifferenceType | 'all'>('all');
const activeTab = ref('compare');
const comparisonSnapshot = ref<{ before: ResumeData; after: ResumeData } | null>(null);
const selectedDifferenceIds = ref<string[]>([]);
const mergeTitle = ref('');
const savingMerged = ref(false);
const historyEntries = ref<JobVersionHistoryEntry[]>([]);
const historyLoading = ref(false);
const historyError = ref('');
let historyLoadGeneration = 0;
/** 比较结果对应的版本与更新时间；简历被改动后用它判断快照是否过期。 */
const comparisonStamp = ref('');
let compareGeneration = 0;
/** 索引里没有岗位版本的旧简历，读一次正文后在这里留档。 */
const legacyJobTargets = new Map<string, ResumeJobTarget | null>();

watch(() => props.resumes, (resumes) => {
  if (resumes.length < 2 && activeTab.value === 'compare') activeTab.value = 'create';
  if (!resumes.some((resume) => resume.id === sourceId.value)) sourceId.value = resumes[0]?.id || '';
  if (!resumes.some((resume) => resume.id === beforeId.value)) beforeId.value = resumes[0]?.id || '';
  if (!resumes.some((resume) => resume.id === afterId.value)) afterId.value = resumes[1]?.id || '';
}, { immediate: true });

watch([beforeId, afterId], () => {
  // 切换版本会作废在途比较，这里同时收起 loading，否则按钮会一直卡在比较中。
  compareGeneration += 1;
  comparing.value = false;
  compared.value = false;
  compareError.value = '';
  differences.value = [];
  comparisonSnapshot.value = null;
  comparisonStamp.value = '';
  selectedDifferenceIds.value = [];
  mergeTitle.value = '';
  searchText.value = '';
  sectionFilter.value = 'all';
  typeFilter.value = 'all';
});

// 被比较的简历在别处保存后，快照就过期了：清空结果，避免把旧内容另存出去。
watch(() => props.resumes.map((resume) => `${resume.id}:${resume.updatedAt}`).join('|'), () => {
  if (!compared.value || !comparisonStamp.value || comparisonStamp.value === comparisonKey()) return;
  compareGeneration += 1;
  comparing.value = false;
  compared.value = false;
  differences.value = [];
  comparisonSnapshot.value = null;
  comparisonStamp.value = '';
  selectedDifferenceIds.value = [];
  compareError.value = '所选简历已更新，请重新比较后再另存。';
});

watch([activeTab, () => props.modelValue, () => props.resumes.map((resume) => `${resume.id}:${resume.updatedAt}`).join('|')], ([tab, visible]) => {
  if (tab === 'history' && visible) void loadJobVersionHistory();
  else {
    historyLoadGeneration += 1;
    historyLoading.value = false;
  }
}, { immediate: true });

const changeCounts = computed(() => ({
  added: differences.value.filter((difference) => difference.type === 'added').length,
  modified: differences.value.filter((difference) => difference.type === 'modified').length,
  removed: differences.value.filter((difference) => difference.type === 'removed').length,
  formatted: differences.value.filter((difference) => difference.type === 'formatted').length,
}));

const sectionOptions = computed(() => [...new Set(differences.value.map((difference) => difference.section))]);
const filteredDifferences = computed(() => {
  const query = searchText.value.trim().toLocaleLowerCase();
  return differences.value.filter((difference) => {
    if (sectionFilter.value !== 'all' && difference.section !== sectionFilter.value) return false;
    if (typeFilter.value !== 'all' && difference.type !== typeFilter.value) return false;
    if (!query) return true;
    return [difference.section, difference.item, difference.field, difference.before, difference.after]
      .some((value) => value.toLocaleLowerCase().includes(query));
  });
});

/** 行级对照：只标出在对侧找不到同名的行，不改动落盘内容。 */
function lineSegments(difference: ResumeDifference, side: 'before' | 'after'): DiffSegment[] {
  const value = difference[side];
  if (!value) return [];
  const otherLines = new Set((difference[side === 'before' ? 'after' : 'before'] || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean));
  return value.split('\n').map((line) => ({
    text: line,
    changed: line.trim() !== '' && !otherLines.has(line.trim()),
  }));
}

const groupedDifferences = computed(() => {
  const groups = new Map<string, DiffRow[]>();
  filteredDifferences.value.forEach((difference) => {
    const group = groups.get(difference.section) ?? [];
    group.push({
      difference,
      before: lineSegments(difference, 'before'),
      after: lineSegments(difference, 'after'),
    });
    groups.set(difference.section, group);
  });
  return [...groups].map(([section, rows]) => ({ section, rows }));
});

const selectedIdSet = computed(() => new Set(selectedDifferenceIds.value));
const filteredIdList = computed(() => filteredDifferences.value.map((difference) => difference.id));
const allFilteredSelected = computed(() => filteredIdList.value.length > 0
  && filteredIdList.value.every((id) => selectedIdSet.value.has(id)));
const someFilteredSelected = computed(() => filteredIdList.value.some((id) => selectedIdSet.value.has(id)));

function setSelection(ids: string[], checked: boolean) {
  const next = new Set(selectedDifferenceIds.value);
  ids.forEach((id) => {
    if (checked) next.add(id);
    else next.delete(id);
  });
  selectedDifferenceIds.value = [...next];
}

/** 全选只作用于当前筛选出来的差异，不动的勾选保持原样。 */
function toggleAllDifferences(event: Event) {
  setSelection(filteredIdList.value, (event.target as HTMLInputElement).checked);
}

function sectionSelectionState(group: { rows: DiffRow[] }) {
  const ids = group.rows.map((row) => row.difference.id);
  const selected = ids.filter((id) => selectedIdSet.value.has(id)).length;
  return { all: ids.length > 0 && selected === ids.length, some: selected > 0 && selected < ids.length };
}

function toggleSectionDifferences(group: { rows: DiffRow[] }, event: Event) {
  setSelection(group.rows.map((row) => row.difference.id), (event.target as HTMLInputElement).checked);
}

/** 同一节里整项删除与整项新增并存，说明身份没能对应上，提示这是替换。 */
function hasReplacementPair(rows: DiffRow[]): boolean {
  const itemRows = rows.filter((row) => row.difference.scope === 'item' && row.difference.field === '整项');
  return itemRows.some((row) => row.difference.type === 'added')
    && itemRows.some((row) => row.difference.type === 'removed');
}

function resumeOptionLabel(resume: ResumeMeta): string {
  const date = formatUpdatedAt(resume.updatedAt);
  return date ? `${resume.title} · 更新于 ${date}` : resume.title;
}

function selectedTitle(id: string): string {
  return props.resumes.find((resume) => resume.id === id)?.title || '未选择版本';
}

function selectedUpdatedAt(id: string): string {
  const resume = props.resumes.find((candidate) => candidate.id === id);
  if (!resume) return '';
  const date = formatUpdatedAt(resume.updatedAt);
  return date ? `最近更新 ${date}` : '';
}

function formatUpdatedAt(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN');
}

function changeTypeLabel(type: ResumeDifferenceType): string {
  return { added: '新增', modified: '修改', removed: '删除', formatted: '格式' }[type];
}

/** 当前所比较的两个版本及其更新时间。 */
function comparisonKey(): string {
  const updatedAt = (id: string) => props.resumes.find((resume) => resume.id === id)?.updatedAt ?? 0;
  return `${beforeId.value}:${updatedAt(beforeId.value)}|${afterId.value}:${updatedAt(afterId.value)}`;
}

function displayedValue(difference: ResumeDifference, side: 'before' | 'after'): string {
  const value = difference[side];
  if (value) return value;
  if (difference.scope === 'item' && difference.type === 'added' && side === 'before') return '— 原版本无此条目 —';
  if (difference.scope === 'item' && difference.type === 'removed' && side === 'after') return '— 新版本已删除此条目 —';
  return '— 未填写 —';
}

async function createVersion() {
  if (!sourceId.value || !versionName.value.trim() || creating.value) return;
  creating.value = true;
  createError.value = '';
  try {
    const id = await workbench.createJobVersion(sourceId.value, {
      versionName: versionName.value,
      company: company.value,
      position: position.value,
    });
    ElMessage.success('岗位版本已创建，原简历保持不变。');
    emit('created', id);
  } catch (error) {
    createError.value = `创建失败，请重试：${describeError(error)}`;
  } finally {
    creating.value = false;
  }
}

async function compare() {
  // 连续点击或中途切换版本时，只让最后一次比较写回结果。
  const generation = ++compareGeneration;
  compared.value = false;
  compareError.value = '';
  differences.value = [];
  comparisonSnapshot.value = null;
  comparisonStamp.value = '';
  selectedDifferenceIds.value = [];
  mergeTitle.value = '';
  comparing.value = true;
  const selectedBeforeId = beforeId.value;
  const selectedAfterId = afterId.value;
  try {
    const [before, after] = await Promise.all([storageManager.read(selectedBeforeId), storageManager.read(selectedAfterId)]);
    if (generation !== compareGeneration) return;
    if (!before || !after) throw new Error('无法读取所选简历，请刷新工作台后重试。');
    if (beforeId.value !== selectedBeforeId || afterId.value !== selectedAfterId) return;
    const beforeData = before as ResumeData;
    const afterData = after as ResumeData;
    differences.value = compareResumeVersions(beforeData, afterData);
    comparisonSnapshot.value = {
      before: JSON.parse(JSON.stringify(beforeData)) as ResumeData,
      after: JSON.parse(JSON.stringify(afterData)) as ResumeData,
    };
    selectedDifferenceIds.value = differences.value.map((difference) => difference.id);
    mergeTitle.value = `${afterData.title} - 合并版`;
    comparisonStamp.value = comparisonKey();
    compared.value = true;
  } catch (error) {
    if (generation === compareGeneration) compareError.value = describeError(error);
  } finally {
    if (generation === compareGeneration) comparing.value = false;
  }
}

async function createMergedVersion() {
  const snapshot = comparisonSnapshot.value;
  const title = mergeTitle.value.trim();
  if (!snapshot || !selectedDifferenceIds.value.length || !title || savingMerged.value) return;
  savingMerged.value = true;
  try {
    const merged = applyResumeDifferences(snapshot.before, snapshot.after, differences.value, selectedDifferenceIds.value);
    merged.title = title;
    const target = snapshot.after.jobTarget ?? snapshot.before.jobTarget;
    if (target) {
      merged.jobTarget = { ...target, versionName: title, sourceResumeId: snapshot.before.id };
    } else {
      delete merged.jobTarget;
    }
    const id = await workbench.createResumeFromData(merged, title, merged.templateId);
    ElMessage.success('已将所选修改另存为新简历；原有简历未更改。');
    emit('created', id);
  } catch (error) {
    ElMessage.error(`另存失败：${describeError(error)}`);
  } finally {
    savingMerged.value = false;
  }
}

/**
 * 岗位版本信息优先读列表索引；早期保存的简历索引里没有，才回落到读取正文，
 * 并把结果缓存下来，避免每次切到历史页签都重读一遍。
 */
async function jobTargetOf(resume: ResumeMeta): Promise<ResumeJobTarget | null> {
  if (resume.jobTarget) return resume.jobTarget;
  const cached = legacyJobTargets.get(resume.id);
  if (cached !== undefined) return cached;
  const data = await storageManager.read(resume.id);
  const jobTarget = data?.jobTarget ?? null;
  legacyJobTargets.set(resume.id, jobTarget);
  return jobTarget;
}

async function loadJobVersionHistory() {
  const generation = ++historyLoadGeneration;
  historyLoading.value = true;
  historyError.value = '';
  try {
    const entries = await Promise.all(props.resumes.map(async (resume) => {
      const jobTarget = await jobTargetOf(resume);
      if (!jobTarget) return null;
      return {
        resume,
        jobTarget,
        sourceTitle: props.resumes.find((candidate) => candidate.id === jobTarget.sourceResumeId)?.title || '',
      } satisfies JobVersionHistoryEntry;
    }));
    if (generation !== historyLoadGeneration) return;
    historyEntries.value = entries.filter((entry): entry is JobVersionHistoryEntry => entry !== null)
      .sort((left, right) => right.resume.updatedAt - left.resume.updatedAt);
  } catch (error) {
    if (generation === historyLoadGeneration) historyError.value = describeError(error);
  } finally {
    if (generation === historyLoadGeneration) historyLoading.value = false;
  }
}

async function openVersionComparison(entry: JobVersionHistoryEntry) {
  if (!entry.sourceTitle) return;
  activeTab.value = 'compare';
  beforeId.value = entry.jobTarget.sourceResumeId;
  afterId.value = entry.resume.id;
  await nextTick();
  await compare();
}
</script>

<style scoped>
:global(.resume-version-manager-overlay .el-overlay-dialog) {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

:global(.resume-version-manager-overlay .el-dialog) {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  margin: 16px auto;
}

:global(.resume-version-manager-overlay .el-dialog__body) {
  min-height: 0;
  overflow-y: auto;
}

.target-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.help-text { color: var(--ui-text-muted); font-size: var(--ui-font-sm); }
.compare-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto; align-items: end; gap: 12px; }
.version-select { display: grid; gap: 6px; min-width: 0; color: var(--ui-text-muted); font-size: var(--ui-font-sm); }
.version-select :deep(.el-select) { width: 100%; }
.compare-divider { padding-bottom: 9px; color: var(--ui-text-muted); }
.compare-hint { margin: 10px 0 18px; color: var(--ui-text-muted); font-size: var(--ui-font-sm); }
.compare-error { margin-bottom: 12px; }
.compare-results { display: flex; max-height: 62vh; flex-direction: column; gap: 14px; }
.compare-summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border: 1px solid var(--color-rule); border-radius: var(--radius-card); background: var(--color-paper-2); }
.compare-summary strong { color: var(--color-ink); font-size: 16px; }
.compare-summary p { margin: 4px 0 0; color: var(--color-muted); font-size: var(--ui-font-sm, 13px); }
.change-counts { display: flex; flex-wrap: wrap; gap: 8px; }
.count-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: var(--radius-s); font-size: 12px; }
.count-chip.added, .badge-added { color: var(--color-success); background: var(--color-success-wash); }
.count-chip.modified, .badge-modified { color: var(--color-accent); background: var(--color-accent-wash); }
.count-chip.removed, .badge-removed { color: var(--color-error); background: var(--color-error-wash); }
.count-chip.formatted, .badge-formatted { color: var(--color-ink-2); background: var(--color-paper-2); }
.diff-filters { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(140px, auto) minmax(140px, auto); gap: 8px; }
.diff-filters input, .diff-filters select { min-width: 0; height: 36px; padding: 0 10px; border: 1px solid var(--color-rule-2); border-radius: var(--radius-input); color: var(--color-ink); background: var(--color-paper-3); font: inherit; }
.diff-list { min-height: 0; overflow: auto; border-top: 1px solid var(--color-rule); }
.version-headings, .diff-row { display: grid; grid-template-columns: minmax(150px, 0.8fr) minmax(0, 1fr) minmax(0, 1fr); }
.version-headings { position: sticky; z-index: 1; top: 0; padding: 10px 0; border-bottom: 1px solid var(--color-rule); background: var(--color-paper-3); }
.version-heading { display: grid; gap: 2px; min-width: 0; padding: 0 12px; }
.version-heading > span, .version-heading small { color: var(--color-muted); font-size: 12px; }
.version-heading strong { overflow: hidden; color: var(--color-ink); text-overflow: ellipsis; white-space: nowrap; }
.diff-section-head { padding: 12px 10px 8px; }
.diff-section-title { display: flex; align-items: center; gap: 8px; }
.diff-section-title h3 { margin: 0; color: var(--color-ink); font-size: 14px; }
.diff-section-title > span { color: var(--color-muted); font-size: 12px; font-weight: 400; }
.swap-hint { margin: 6px 0 0; color: var(--color-muted); font-size: 12px; }
.diff-row { border-top: 1px solid var(--color-rule); }
.diff-description, .diff-value { min-width: 0; padding: 12px 10px; }
.diff-description { display: flex; align-items: flex-start; gap: 8px; }
.diff-description > div { display: grid; gap: 4px; min-width: 0; }
.diff-description strong { overflow-wrap: anywhere; color: var(--color-ink); font-size: 13px; }
.diff-description small, .mobile-version-label { color: var(--color-muted); font-size: 12px; }
.change-badge { flex: none; padding: 2px 6px; border-radius: var(--radius-s); font-size: 11px; line-height: 1.5; }
.diff-value { border-left: 1px solid var(--color-rule); }
.diff-value p { margin: 0; overflow-wrap: anywhere; color: var(--color-ink-2); font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
.diff-line { display: block; }
.diff-line.is-changed { border-radius: 3px; background: var(--color-accent-wash); }
.mobile-version-label { display: none; margin-bottom: 5px; }
.merge-actions { display: grid; grid-template-columns: auto minmax(120px, 1fr) minmax(180px, 260px) auto; align-items: center; gap: 10px; }
.merge-actions > span { color: var(--color-muted); font-size: 12px; }
.merge-actions > input[type="text"] { min-width: 0; height: 36px; padding: 0 10px; border: 1px solid var(--color-rule-2); border-radius: var(--radius-input); color: var(--color-ink); background: var(--color-paper-3); font: inherit; }
.select-all-differences, .adopt-toggle { display: inline-flex; align-items: center; gap: 6px; color: var(--color-muted); font-size: 12px; white-space: nowrap; }
.select-all-differences input, .adopt-toggle input { accent-color: var(--color-accent); }
.adopt-toggle { margin-left: auto; }
.merge-note, .history-intro { margin: 0; color: var(--color-muted); font-size: var(--ui-font-sm, 13px); }
.history-state { color: var(--color-muted); }
.history-list { display: grid; gap: 10px; }
.history-entry { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border: 1px solid var(--color-rule); border-radius: var(--radius-card); background: var(--color-paper-3); }
.history-entry-main { display: grid; gap: 4px; min-width: 0; }
.history-entry-main strong { color: var(--color-ink); }
.history-entry-main span, .history-entry-main small, .history-entry-actions small { color: var(--color-muted); font-size: 12px; }
.history-entry-actions { display: flex; align-items: center; gap: 12px; flex: none; }
@media (max-width: 700px) {
  .target-grid { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .compare-controls { grid-template-columns: minmax(0, 1fr); align-items: stretch; }
  .compare-divider { display: none; }
  .compare-controls :deep(.el-button) { width: 100%; }
  .compare-results { max-height: 68vh; }
  .compare-summary { align-items: flex-start; flex-direction: column; }
  .diff-filters { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .diff-filters input { grid-column: 1 / -1; }
  .version-headings, .diff-row { grid-template-columns: minmax(0, 1fr); }
  .version-headings { display: none; }
  .diff-value { border-top: 1px dashed var(--color-rule); border-left: 0; padding-top: 8px; }
  .mobile-version-label { display: block; }
  .diff-description { padding-bottom: 4px; }
  .merge-actions { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .merge-actions > span { grid-column: 1 / -1; grid-row: 1; }
  .merge-actions > input[type="text"] { grid-column: 1 / -1; }
  .merge-actions :deep(.el-button) { width: 100%; }
  .history-entry { align-items: flex-start; flex-direction: column; }
  .history-entry-actions { width: 100%; justify-content: space-between; }
}
</style>
