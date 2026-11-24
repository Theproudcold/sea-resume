<template>
  <section class="resume-graph" aria-label="简历版本图谱">
    <p class="graph-hint">纵向是主干的版本（新的在上），横向是分支深度。每个岗位挂在它从主干分出的位置旁边。</p>

    <p v-if="!graph.nodes.length" class="graph-empty" role="status">还没有版本，创建一份简历或岗位版本后会显示在这里。</p>

    <p v-else-if="graph.orphans.length" class="graph-warning" role="status" data-testid="graph-orphan">
      有 {{ graph.orphans.length }} 个岗位版本找不到所属主干，单独列在图上、不连线。
    </p>

    <p v-if="graph.uncertain.length" class="graph-warning" role="status" data-testid="graph-uncertain">
      有 {{ graph.uncertain.length }} 个版本的先后顺序是推测的：它们是同一个岗位的旧版本，没有记录同步来源。
    </p>

    <div v-if="graph.nodes.length" ref="canvasRef" class="graph-canvas" data-testid="graph-canvas">
      <svg :width="graph.width" :height="graph.height" role="img" aria-label="简历版本图谱">
        <!-- 连线 -->
        <g aria-hidden="true">
          <path
            v-for="(edge, index) in renderedEdges"
            :key="`${edge.kind}-${edge.from}-${edge.to}-${index}`"
            :d="edge.d"
            :class="['edge', `edge-${edge.kind}`]"
            data-testid="graph-edge"
            fill="none"
          />
        </g>

        <!-- 节点：圆点 + 右侧两行标签 -->
        <g
          v-for="node in graph.nodes"
          :key="node.id"
          :class="['node', `node-${node.kind}`, { 'is-selected': node.id === selectedId, 'is-behind': !!node.behind, 'is-orphan': !!node.orphan }]"
          :data-x="node.x"
          role="button"
          tabindex="0"
          :aria-label="nodeAria(node)"
          data-testid="graph-node"
          @click="choose(node.id)"
          @keydown.enter.prevent="choose(node.id)"
          @keydown.space.prevent="choose(node.id)"
        >
          <circle :cx="node.x" :cy="node.y" :r="NODE_RADIUS" />
          <text :x="node.x + NODE_RADIUS + 9" :y="node.y - 3" class="node-label">{{ truncate(node.title) }}</text>
          <text
            :x="node.x + NODE_RADIUS + 9"
            :y="node.y + 10"
            :class="['node-meta', { 'node-behind': !!node.behind }]"
            :data-testid="node.behind ? 'graph-behind' : undefined"
          >{{ metaOf(node) }}</text>
        </g>
      </svg>
    </div>

    <div v-if="graph.nodes.length" class="graph-legend" data-testid="graph-legend">
      <span><i class="dot dot-master" />主干版本</span>
      <span><i class="dot dot-branch" />岗位版本</span>
      <span><i class="line line-commit" />版本推进</span>
      <span><i class="line line-fork" />从主干分出</span>
      <span><i class="line line-rebase" />同步主干</span>
    </div>

    <p v-if="standaloneCount > 0" class="graph-hint">另有 {{ standaloneCount }} 份独立简历没有版本关系，未画在图上。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ResumeMeta } from '@/types/resume';
import { buildResumeGraph, NODE_RADIUS, type GraphEdge, type GraphNode } from '@/utils/resumeGraph';

const LABEL_MAX = 12;

const props = defineProps<{
  resumes: ResumeMeta[];
  currentId?: string;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const selectedId = ref('');
const canvasRef = ref<HTMLElement | null>(null);

const graph = computed(() => buildResumeGraph(props.resumes, { currentId: props.currentId, relatedOnly: true }));
const standaloneCount = computed(() => props.resumes.length - graph.value.nodes.length);

/**
 * 连线：因为布局保证「每条连线最多跨一列」，这里只需处理两种形状——
 * 同列竖直（推进）与相邻列的分叉/同步。
 *
 * 跨列时用横向控制点做平滑过渡，端点从圆周外沿出发，不进入圆内。
 */
const renderedEdges = computed(() => {
  const byId = new Map(graph.value.nodes.map((node) => [node.id, node]));
  return graph.value.edges.flatMap((edge): Array<GraphEdge & { d: string }> => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return [];
    return [{ ...edge, d: pathBetween(from, to) }];
  });
});

function pathBetween(from: GraphNode, to: GraphNode): string {
  const gap = NODE_RADIUS + 3;
  const goingUp = to.y < from.y;
  const startY = from.y + (goingUp ? -gap : gap);
  const endY = to.y + (goingUp ? gap : -gap);
  if (from.x === to.x) return `M ${from.x} ${startY} L ${to.x} ${endY}`;
  // 相邻列：贝塞尔曲线从起点圆边平滑过渡到终点圆边。
  const midY = (startY + endY) / 2;
  return `M ${from.x} ${startY} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${endY}`;
}

function truncate(text: string): string {
  const value = String(text ?? '');
  return value.length > LABEL_MAX ? `${value.slice(0, LABEL_MAX)}…` : value;
}

function metaOf(node: GraphNode): string {
  if (node.orphan) return '找不到主干';
  if (node.behind) return `主干有新版 v${node.behind.latestVersion}`;
  if (node.kind === 'master') return `v${node.versionNumber}`;
  return node.versionNumber > 1 ? `第 ${node.versionNumber} 版` : '初始版';
}

function nodeAria(node: GraphNode): string {
  const parts = [node.title, node.kind === 'master' ? `主干第 ${node.versionNumber} 版` : `岗位第 ${node.versionNumber} 版`];
  if (node.behind) parts.push(`主干有新版 v${node.behind.latestVersion}`);
  if (node.orphan) parts.push('找不到所属主干');
  return parts.join('，');
}

function choose(id: string) {
  selectedId.value = id;
  emit('select', id);
}

defineExpose({ graph });
void canvasRef;
</script>

<style scoped>
.resume-graph { display: grid; gap: var(--space-sm); }
.graph-hint, .graph-empty, .graph-warning { margin: 0; font-size: var(--font-xs); color: var(--color-muted); }
.graph-warning { color: var(--color-ink-2); }
.graph-canvas { overflow: auto; border: var(--rule-hair) solid var(--color-rule); border-radius: var(--radius-s); background: var(--color-paper); padding: 2px 0; }
svg { display: block; }

.edge { stroke-width: 2; }
.edge-commit { stroke: var(--color-accent); }
.edge-fork { stroke: var(--color-rule-2); }
.edge-rebase { stroke: var(--color-accent); stroke-dasharray: 4 4; }

.node { cursor: pointer; }
.node circle { fill: var(--color-paper); stroke: var(--color-rule-2); stroke-width: 2; transition: stroke-width 120ms ease, stroke 120ms ease; }
.node-master circle { stroke: var(--color-accent); }
.node.is-behind circle { fill: var(--color-accent); stroke: var(--color-accent); }
.node.is-orphan circle { stroke: var(--color-muted); stroke-dasharray: 2 2; }
.node.is-selected circle { stroke-width: 3; }
.node:hover circle { stroke-width: 3; }
.node:focus-visible { outline: none; }
.node:focus-visible circle { stroke: var(--color-focus); stroke-width: 3; }

.node-label { font-size: 11.5px; fill: var(--color-ink); dominant-baseline: middle; }
.node-meta { font-size: 10px; fill: var(--color-muted); dominant-baseline: middle; }
.node-behind { fill: var(--color-accent-deep, var(--color-accent)); }

.graph-legend { display: flex; flex-wrap: wrap; gap: var(--space-md); font-size: var(--font-xs); color: var(--color-muted); }
.graph-legend span { display: inline-flex; align-items: center; gap: 6px; }
.dot { width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--color-rule-2); background: var(--color-paper); }
.dot-master { border-color: var(--color-accent); }
.line { display: inline-block; width: 20px; height: 0; border-top: 2px solid var(--color-rule-2); }
.line-commit { border-top-color: var(--color-accent); }
.line-rebase { border-top-style: dashed; border-top-color: var(--color-accent); }
</style>
