<template>
  <section class="resume-graph" aria-label="简历版本图谱">
    <p v-if="!graph.rows.length" class="graph-empty" role="status">还没有版本，创建一份简历或岗位版本后会显示在这里。</p>

    <template v-else>
      <p v-if="graph.orphans.length" class="graph-note" role="status" data-testid="graph-orphan">
        有 {{ graph.orphans.length }} 个岗位版本找不到所属主干，单独列出、不连线。
      </p>
      <p v-if="graph.uncertain.length" class="graph-note" role="status" data-testid="graph-uncertain">
        有 {{ graph.uncertain.length }} 个版本的先后顺序是推测的：它们是同一个岗位的旧版本，没有记录同步来源。
      </p>

      <div class="graph-list" role="list">
        <div
          v-for="(row, index) in graph.rows"
          :key="row.id"
          :class="['graph-row', { 'is-selected': row.id === selectedId, 'is-behind': !!row.behind }]"
          role="listitem"
          data-testid="graph-row"
          :data-id="row.id"
        >
          <!-- 左侧窄轨道：只画关系，不放文字 -->
          <svg
            class="graph-rail"
            :width="railWidth"
            :height="ROW_HEIGHT"
            :aria-hidden="true"
            data-testid="graph-rail"
          >
            <path
              v-for="(seg, segIndex) in railPathsAbove(index)"
              :key="`a-${segIndex}`"
              :d="seg.d"
              :stroke="seg.color"
              :class="['rail-line', `rail-${seg.kind}`]"
              fill="none"
              data-testid="graph-edge"
              data-side="above"
            />
            <path
              v-for="(seg, segIndex) in railPathsBelow(index)"
              :key="`b-${segIndex}`"
              :d="seg.d"
              :stroke="seg.color"
              :class="['rail-line', `rail-${seg.kind}`]"
              fill="none"
              data-testid="graph-edge"
              data-side="below"
            />
            <!-- 贯穿本行的轨道线：让跨多行的关系在中间不断开 -->
            <line
              v-for="lane in graph.rows[index]!.passThrough"
              :key="`p-${lane}`"
              :x1="laneX(lane)" y1="0"
              :x2="laneX(lane)" :y2="ROW_HEIGHT"
              :stroke="LANE_COLORS[lane % LANE_COLORS.length]"
              class="rail-line"
              data-testid="graph-pass"
            />
            <!-- 节点落在自己的列上 -->
            <circle
              :cx="RAIL_PAD + row.lane * LANE_STEP"
              :cy="ROW_HEIGHT / 2"
              :r="row.behind ? 5 : 4"
              :fill="row.behind ? row.color : 'var(--color-paper, #fff)'"
              :stroke="row.color"
              :class="['rail-dot', { 'is-behind': !!row.behind, 'is-orphan': !!row.orphan }]"
              data-testid="graph-dot"
            />
          </svg>

          <!-- 右侧信息行 -->
          <button
            type="button"
            class="graph-info"
            :aria-label="rowAria(row)"
            data-testid="graph-node"
            @click="choose(row.id)"
          >
            <span class="info-main">
              <span class="info-title">{{ row.title }}</span>
              <span v-if="row.kind === 'branch'" class="info-job">{{ [row.company, row.position].filter(Boolean).join(' · ') || '未填岗位' }}</span>
            </span>
            <span class="info-meta">
              <span class="info-version" :style="{ color: row.color }">{{ row.versionLabel }}</span>
              <span v-if="row.behind" class="info-behind" data-testid="graph-behind">· 主干有新版 v{{ row.behind.latestVersion }}</span>
              <span v-if="row.orphan" class="info-orphan">· 找不到主干</span>
              <span class="info-time">{{ formatTime(row.id) }}</span>
            </span>
          </button>
        </div>
      </div>

      <div class="graph-legend" data-testid="graph-legend">
        <span><i class="legend-dot" />版本节点</span>
        <span><i class="legend-line legend-commit" />版本推进</span>
        <span><i class="legend-line legend-fork" />从主干分出</span>
        <span><i class="legend-line legend-rebase" />同步主干</span>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ResumeMeta } from '@/types/resume';
import { buildResumeGraph, LANE_COLORS, type GraphRow } from '@/utils/resumeGraph';

/**
 * 轨道条宽度按内容自适应。
 *
 * 之前写死 96px，最多两列时右侧会空出 50px，标题离轨道很远。
 * 现在最短只要「左侧留白 + 一列间距 + 半径 + 右侧留白」，列多时再按列数增长。
 */
const RAIL_PAD = 10;
const LANE_STEP = 16;
const DOT_RADIUS = 5;
const RAIL_MIN_WIDTH = RAIL_PAD + DOT_RADIUS + RAIL_PAD;
const ROW_HEIGHT = 52;

const props = defineProps<{
  resumes: ResumeMeta[];
  currentId?: string;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const selectedId = ref('');
const graph = computed(() => buildResumeGraph(props.resumes, { currentId: props.currentId, relatedOnly: true }));

/** 列多的时候轨道跟着变宽，避免最右一列的圆点画出画布。 */
const railWidth = computed(() => {
  const lastLane = Math.max(0, graph.value.laneCount - 1);
  return Math.max(RAIL_MIN_WIDTH, RAIL_PAD + lastLane * LANE_STEP + DOT_RADIUS + RAIL_PAD);
});

/** 行在行内列表里的序号 → 时间，用于右侧显示。 */
const timeById = computed(() => new Map(props.resumes.map((row) => [row.id, row.updatedAt])));

function formatTime(id: string): string {
  const value = timeById.value.get(id);
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const date = new Date(value);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function laneX(lane: number): number {
  return RAIL_PAD + lane * LANE_STEP;
}

/**
 * 上半段的线：从本行顶部进入节点。
 *
 * 连线来自它上方的另一行（peerRow < 本行），所以从画布顶端竖直进入，
 * 跨度超过一列时用带圆角的折线，视觉上与 Git 客户端一致。
 */
function railPathsAbove(index: number): Array<{ d: string; color: string; kind: string }> {
  const row = graph.value.rows[index]!;
  const cy = ROW_HEIGHT / 2;
  return row.edgesAbove.map((edge) => {
    const startX = laneX(edge.fromLane);
    const endX = laneX(edge.toLane);
    const color = LANE_COLORS[edge.fromLane % LANE_COLORS.length]!;
    return { d: cornerPath(startX, 0, endX, cy), color, kind: edge.kind };
  });
}

/**
 * 下半段只沿本行的列竖直离开。
 *
 * 折进目标列的弯留在目标那一行的上半段。如果这里就折过去，
 * 线会在行缝处换列，中间行的贯穿线还停在原来的列上。
 */
function railPathsBelow(index: number): Array<{ d: string; color: string; kind: string }> {
  const row = graph.value.rows[index]!;
  const cy = ROW_HEIGHT / 2;
  return row.edgesBelow.map((edge) => {
    const x = laneX(edge.fromLane);
    const color = LANE_COLORS[edge.fromLane % LANE_COLORS.length]!;
    return { d: `M ${x} ${cy} L ${x} ${ROW_HEIGHT}`, color, kind: edge.kind };
  });
}

/** 两点之间带圆角的折线：先竖直，再横移，再竖直。 */
function cornerPath(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const radius = Math.min(Math.abs(x2 - x1) / 2, (y2 - y1) / 2);
  const midY = (y1 + y2) / 2;
  const dir = x2 > x1 ? 1 : -1;
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${midY - radius}`,
    `Q ${x1} ${midY} ${x1 + dir * radius} ${midY}`,
    `L ${x2 - dir * radius} ${midY}`,
    `Q ${x2} ${midY} ${x2} ${midY + radius}`,
    `L ${x2} ${y2}`,
  ].join(' ');
}

function rowAria(row: GraphRow): string {
  const parts = [row.title, row.kind === 'master' ? `主干 ${row.versionLabel}` : `岗位 ${row.versionLabel}`];
  if (row.company) parts.push([row.company, row.position].filter(Boolean).join(' '));
  if (row.behind) parts.push(`主干有新版 v${row.behind.latestVersion}`);
  if (row.orphan) parts.push('找不到所属主干');
  return parts.join('，');
}

function choose(id: string) {
  selectedId.value = id;
  emit('select', id);
}

defineExpose({ graph });
</script>

<style scoped>
.resume-graph { display: grid; gap: var(--space-xs); }
.graph-empty, .graph-note { margin: 0; font-size: var(--font-xs); color: var(--color-muted); }

.graph-list { border: var(--rule-hair) solid var(--color-rule); border-radius: var(--radius-s); overflow: hidden; }

.graph-row { display: flex; align-items: stretch; border-bottom: var(--rule-hair) solid var(--color-rule); background: var(--color-paper); }
.graph-row:last-child { border-bottom: none; }
.graph-row:hover { background: var(--color-paper-3, var(--color-accent-wash)); }
.graph-row.is-selected { background: var(--color-accent-wash); }

.graph-rail { flex: 0 0 auto; display: block; }
.rail-line { stroke-width: 2; }
.rail-line.rail-rebase { stroke-dasharray: 4 3; }
.rail-dot { stroke-width: 2; }
.rail-dot.is-orphan { stroke-dasharray: 2 2; opacity: .6; }

.graph-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-md);
  padding: 6px var(--space-sm) 6px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 0;
}
.graph-info:focus-visible { outline: 2px solid var(--color-focus); outline-offset: -2px; }

.info-main { display: grid; gap: 1px; min-width: 0; flex: 1; }
.info-title { font-size: var(--font-sm); color: var(--color-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.info-job { font-size: var(--font-xs); color: var(--color-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.info-meta { display: inline-flex; align-items: center; gap: var(--space-xs); flex: 0 0 auto; font-size: var(--font-xs); white-space: nowrap; }
.info-version { font-weight: 600; }
.info-behind { color: var(--color-accent-deep, var(--color-accent)); }
.info-orphan { color: var(--color-muted); }
.info-time { color: var(--color-muted); }

.graph-legend { display: flex; flex-wrap: wrap; gap: var(--space-md); font-size: var(--font-xs); color: var(--color-muted); }
.graph-legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; border: 2px solid var(--color-accent); background: var(--color-paper); }
.legend-line { display: inline-block; width: 16px; height: 0; border-top: 2px solid var(--color-rule-2); }
.legend-commit { border-top-color: var(--color-accent); }
.legend-rebase { border-top-style: dashed; border-top-color: var(--color-accent); }
</style>
