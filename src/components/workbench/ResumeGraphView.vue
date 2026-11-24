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
          <!-- 每条路径一条连续曲线：从起点行走到终点行，中间的折点一起画出来 -->
          <path
            v-for="(path, pathIndex) in renderedPaths"
            :key="pathIndex"
            :d="path.d"
            :stroke="path.color"
            :class="['rail-path', `rail-${path.kind}`]"
            fill="none"
            data-testid="graph-edge"
          />
          <circle
            v-for="dot in dots"
            :key="`halo-${dot.id}`"
            :cx="dot.x"
            :cy="dot.y"
            :r="dot.r + 2.5"
            class="rail-dot-halo"
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

/** 把一条路径的折点串成一条连续曲线。 */
/**
 * 把一条路径的折点串成一条平滑曲线。
 *
 * 换列处用三次贝塞尔（C）做整段 S 形过渡，而不是「直线 + 小圆角」拼直角：
 * 后者在换列点会形成一个可见的折角，看上去是折线不是曲线。
 *
 * 控制点取在换列区间的竖直黄金分割处，两端切线都是竖直的，
 * 因此同一列上的段落仍然是笔直的竖线，只在换列时柔和地弯过去。
 */
/**
 * 把一条路径的折点串成一条平滑曲线。
 *
 * 参数对齐 vscode-git-graph（MIT）的做法：
 * - 换列时用三次贝塞尔，控制点偏移**0.8 个行高**，曲线才能饱满地过渡；
 *   用 0.5 会让弯折挤在行中点，看起来仍像折线。
 * - 连续的竖直段合并成一段 `L`，主干因此是一条完整直线，而不是许多小段接起来。
 */
/**
 * 把一条路径的折点串成一条平滑曲线。
 *
 * 换列处用三次贝塞尔过渡，控制点沿各自所在列延伸，两端切线竖直；
 * 同列的连续折点直接在它们之间连直线（主干因此是一条贯通的竖线）。
 *
 * 控制点的偏移量限制在**这次换列实际跨过的竖直距离之内**，否则曲线会回环。
 */
function pathToD(points: Array<{ row: number; lane: number }>): string {
  if (!points.length) return '';
  const coords = points.map((point) => ({ x: laneX(point.lane), y: rowCenterY(point.row) }));
  if (coords.length === 1) return `M ${coords[0]!.x} ${coords[0]!.y}`;

  let d = `M ${coords[0]!.x} ${coords[0]!.y}`;
  for (let i = 1; i < coords.length; i += 1) {
    const previous = coords[i - 1]!;
    const current = coords[i]!;
    if (previous.x === current.x) {
      d += ` L ${current.x} ${current.y}`;
      continue;
    }
    // 换列：控制点不超过这段竖直距离的一半，保证曲线单调、不回环。
    const dy = current.y - previous.y;
    const bend = Math.abs(dy) * 0.5;
    const c1y = previous.y + Math.sign(dy) * bend;
    const c2y = current.y - Math.sign(dy) * bend;
    d += ` C ${previous.x} ${c1y} ${current.x} ${c2y} ${current.x} ${current.y}`;
  }
  return d;
}

const renderedPaths = computed(() =>
  graph.value.paths.map((path) => ({
    d: pathToD(path.points),
    color: path.color,
    kind: path.kind,
  })),
);

/** 所有节点圆点，用整图坐标。 */
const dots = computed(() =>
  graph.value.rows.map((row, index) => ({
    id: row.id,
    x: laneX(row.lane),
    y: rowCenterY(index),
    r: row.behind ? 5.5 : 4.5,
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

.rail-path { stroke-width: 2; stroke-linecap: round; }

.rail-path.rail-branch { stroke-dasharray: 4 3; }
.rail-dot { stroke-width: 2.5; }
/* 圆点压在线条上：先用背景色的外圈「断开」线条，让节点读作节点而不是线上的一个点 */
.rail-dot-halo { fill: var(--color-paper); stroke: none; }
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
