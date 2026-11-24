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

      <div class="graph-list" role="list" :style="{ '--rail-width': `${railWidth}px` }">
        <!-- 一整张等高 SVG：连线一次画完，跨越任意多行也不会在行边界断开 -->
        <svg
          class="graph-rail"
          :width="railWidth"
          :height="totalHeight"
          aria-hidden="true"
          data-testid="graph-rail"
        >
          <path
            v-for="(seg, segIndex) in railSegments"
            :key="segIndex"
            :d="seg.d"
            :stroke="seg.color"
            :class="['rail-line', `rail-${seg.kind}`, { 'is-long': seg.span > 1 && seg.crosses }]"
            fill="none"
            data-testid="graph-edge"
          />
          <circle
            v-for="dot in dots"
            :key="dot.id"
            :cx="dot.x"
            :cy="dot.y"
            :r="dot.r"
            :fill="dot.fill"
            :stroke="dot.color"
            :class="['rail-dot', { 'is-behind': dot.behind, 'is-orphan': dot.orphan }]"
            data-testid="graph-dot"
          />
        </svg>

        <div class="graph-rows">
          <div
            v-for="(row, index) in graph.rows"
            :key="row.id"
            :class="['graph-row', { 'is-selected': row.id === selectedId, 'is-behind': !!row.behind }]"
            role="listitem"
            data-testid="graph-row"
          >
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

/** 整张图的高度 = 行数 × 行高。 */
const totalHeight = computed(() => Math.max(1, graph.value.rows.length) * ROW_HEIGHT);

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

/** 第 index 行的圆心 y。 */
function rowCenterY(index: number): number {
  return index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

interface RailSegment {
  d: string;
  color: string;
  kind: string;
  /** 跨越的行数。 */
  span: number;
  /** 是否跨列：跨列的线才会从别的行背后穿过，同列的竖直主干不算。 */
  crosses: boolean;
}

/**
 * 所有连线。用整图坐标画，一条关系就是一根完整的线，跨越多少行都不会断。
 *
 * 走法：从起点行圆心出发，竖直走到两行之间的缝，在缝里横移，再竖直进入终点行圆心。
 * 竖直段落在各自所在列上，所以中间行的衔接处天然对齐。
 */
const railSegments = computed<RailSegment[]>(() => {
  const rows = graph.value.rows;
  const rowIndexOf = new Map(rows.map((row, index) => [row.id, index]));
  const segments: RailSegment[] = [];
  for (const link of graph.value.links) {
    const fromIndex = rowIndexOf.get(link.from);
    const toIndex = rowIndexOf.get(link.to);
    if (fromIndex === undefined || toIndex === undefined) continue;
    const fromRow = rows[fromIndex]!;
    const toRow = rows[toIndex]!;
    const x1 = laneX(fromRow.lane);
    const x2 = laneX(toRow.lane);
    const y1 = rowCenterY(fromIndex);
    const y2 = rowCenterY(toIndex);
    // 跨越超过一行时，横移放在中点附近的行缝里，看起来是一条连贯的斜过渡。
    const upperIndex = Math.min(fromIndex, toIndex);
    const lowerIndex = Math.max(fromIndex, toIndex);
    const gapY = (lowerIndex - upperIndex) === 1
      ? (y1 + y2) / 2
      : ROW_HEIGHT * Math.floor((upperIndex + lowerIndex) / 2 + 1) - 0;
    const dir = Math.sign(toIndex - fromIndex);
    const color = LANE_COLORS[fromRow.lane % LANE_COLORS.length]!;
    segments.push({
      d: linkPath(x1, y1, x2, y2, gapY, dir),
      color,
      kind: link.kind,
      span: Math.abs(fromIndex - toIndex),
      crosses: x1 !== x2,
    });
  }
  return segments;
});

/**
 * 生成一条连接线的路径：竖直 → 圆角横移 → 竖直。
 *
 * 横移发生在 gapY 那条行缝上，两端仍是竖直段，因此与相邻行的线自然接续。
 */
function linkPath(x1: number, y1: number, x2: number, y2: number, gapY: number, dir: number): string {
  // 同一列：一条竖直的完整线段，贯穿两端（包含中间经过的所有行）。
  // 之前这里会绕到 gapY 再回来，跨行时看不出是同一根线。
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const radius = Math.min(Math.abs(x2 - x1) / 2, 8);
  const before = gapY - radius * Math.sign(dir || 1) * -1;
  void before;
  const midDir = x2 > x1 ? 1 : -1;
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${gapY - radius}`,
    `Q ${x1} ${gapY} ${x1 + midDir * radius} ${gapY}`,
    `L ${x2 - midDir * radius} ${gapY}`,
    `Q ${x2} ${gapY} ${x2} ${gapY + radius}`,
    `L ${x2} ${y2}`,
  ].join(' ');
}

/** 所有节点圆点，用整图坐标。 */
const dots = computed(() =>
  graph.value.rows.map((row, index) => ({
    id: row.id,
    x: laneX(row.lane),
    y: rowCenterY(index),
    r: row.behind ? 5 : 4,
    color: row.color,
    fill: row.behind ? row.color : 'var(--color-paper)',
    behind: Boolean(row.behind),
    orphan: Boolean(row.orphan),
  })),
);

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

.graph-list {
  position: relative;
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-s);
  overflow: hidden;
  /* 左侧留给整张轨道图，右侧是信息行 */
  padding-left: var(--rail-width, 24px);
}

/* 轨道图覆盖整个列表高度，绝对定位以免挤占行布局 */
.graph-rail {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  pointer-events: none;
}

.graph-rows { position: relative; }

.rail-line { stroke-width: 2; }
/* 跨越 2 行以上的线要从中间那几行的右侧内容背后穿过，画粗一点、淡一点，
   视觉上读作「在背后」而不是断掉。 */
.rail-line.is-long { stroke-width: 3.5; opacity: .55; stroke-linecap: round; }
.rail-line.rail-rebase { stroke-dasharray: 4 3; }
.rail-dot { stroke-width: 2; }
.rail-dot.is-orphan { stroke-dasharray: 2 2; opacity: .6; }

.graph-row { display: flex; align-items: stretch; height: 52px; border-bottom: var(--rule-hair) solid var(--color-rule); background: var(--color-paper); }
.graph-row:last-child { border-bottom: none; }
.graph-row:hover { background: var(--color-paper-3, var(--color-accent-wash)); }
.graph-row.is-selected { background: var(--color-accent-wash); }

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
