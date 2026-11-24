<template>
  <section class="resume-graph" aria-label="简历版本图谱">
    <p class="graph-hint">
      竖线是同一轨道推进，斜线是岗位版本从主干分叉，虚弧线是同步主干后内容回到分支。新的版本在上。
    </p>

    <p v-if="!graph.nodes.length" class="graph-empty" role="status">还没有版本，创建一份简历或岗位版本后会显示在这里。</p>

    <p v-else-if="graph.uncertain.length" class="graph-warning" role="status" data-testid="graph-uncertain">
      有 {{ graph.uncertain.length }} 个版本的先后顺序是推测的：它们是同一个岗位的旧版本，没有记录同步来源。
    </p>

    <div v-if="graph.nodes.length" class="graph-canvas">
      <svg
        :width="graph.width"
        :height="graph.height"
        :viewBox="`0 0 ${graph.width} ${graph.height}`"
        role="img"
        aria-label="简历版本图谱"
      >
        <!-- 连线：主干推进用实线，分叉用折线，同步用虚线弧 -->
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

        <!-- 节点 -->
        <g
          v-for="node in graph.nodes"
          :key="node.id"
          :transform="`translate(${node.x - NODE_WIDTH / 2}, ${node.y - NODE_HEIGHT / 2})`"
          :class="['node', `node-${node.kind}`, { 'is-selected': node.id === selectedId, 'is-current': node.id === currentId }]"
          :data-x="node.x"
          role="button"
          tabindex="0"
          :aria-label="nodeAria(node)"
          data-testid="graph-node"
          @click="choose(node.id)"
          @keydown.enter.prevent="choose(node.id)"
          @keydown.space.prevent="choose(node.id)"
        >
          <rect :width="NODE_WIDTH" :height="NODE_HEIGHT" rx="6" />
          <text :x="10" :y="20" class="node-version">{{ node.kind === 'master' ? `v${node.versionNumber}` : `第 ${node.versionNumber} 版` }}</text>
          <text :x="10" :y="38" class="node-title">{{ truncate(node.title) }}</text>
          <text v-if="node.behind" :x="10" :y="54" class="node-behind" data-testid="graph-behind">主干有新版 v{{ node.behind.latestVersion }}</text>
          <text v-else-if="graph.uncertain.includes(node.id)" :x="10" :y="54" class="node-uncertain">顺序为推测</text>
        </g>
      </svg>
    </div>

    <ul v-if="graph.nodes.length" class="graph-legend" data-testid="graph-legend">
      <li><span class="swatch edge-commit" aria-hidden="true" />版本推进</li>
      <li><span class="swatch edge-fork" aria-hidden="true" />岗位分叉</li>
      <li><span class="swatch edge-rebase" aria-hidden="true" />同步主干</li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ResumeMeta } from '@/types/resume';
import { buildResumeGraph, type GraphEdge, type GraphNode } from '@/utils/resumeGraph';

const NODE_WIDTH = 104;
const NODE_HEIGHT = 62;
const TITLE_MAX = 9;

const props = defineProps<{
  resumes: ResumeMeta[];
  currentId?: string;
}>();
const emit = defineEmits<{ select: [id: string] }>();

const selectedId = ref('');

const graph = computed(() => buildResumeGraph(props.resumes, { currentId: props.currentId }));

/** 连线路径：主干垂直直连，分叉用折线，同步用二次贝塞尔。 */
const renderedEdges = computed(() => {
  const byId = new Map(graph.value.nodes.map((node) => [node.id, node]));
  return graph.value.edges.flatMap((edge): Array<GraphEdge & { d: string }> => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return [];
    return [{ ...edge, d: pathBetween(from, to, edge.kind) }];
  });
});

function pathBetween(from: GraphNode, to: GraphNode, kind: GraphEdge['kind']): string {
  if (kind === 'commit' && from.x === to.x) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  if (kind === 'fork') {
    const midY = (from.y + to.y) / 2;
    return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
  }
  // 同步：从主干弧线回到分支，横向控制点让曲线明显区别于直线。
  const ctrlX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} Q ${ctrlX} ${from.y} ${to.x} ${to.y}`;
}

function truncate(text: string): string {
  const value = String(text ?? '');
  return value.length > TITLE_MAX ? `${value.slice(0, TITLE_MAX)}…` : value;
}

function nodeAria(node: GraphNode): string {
  const parts = [`${node.title}`, node.kind === 'master' ? `主干第 ${node.versionNumber} 版` : `岗位第 ${node.versionNumber} 版`];
  if (node.behind) parts.push(`主干有新版 v${node.behind.latestVersion}`);
  return parts.join('，');
}

function choose(id: string) {
  selectedId.value = id;
  emit('select', id);
}

defineExpose({ graph });
</script>

<style scoped>
.resume-graph { display: grid; gap: var(--space-sm); }
.graph-hint, .graph-empty, .graph-warning { margin: 0; font-size: var(--font-xs); color: var(--color-muted); }
.graph-warning { color: var(--color-ink-2); }
.graph-canvas { overflow: auto; border: var(--rule-hair) solid var(--color-rule); border-radius: var(--radius-s); background: var(--color-paper); }
svg { display: block; }

.edge { stroke: var(--color-rule-2); stroke-width: 1.5; }
.edge-commit { stroke: var(--color-accent); }
.edge-fork { stroke: var(--color-rule-2); }
.edge-rebase { stroke: var(--color-accent-2, var(--color-accent)); stroke-dasharray: 4 3; }

.node { cursor: pointer; }
.node rect { fill: var(--color-paper); stroke: var(--color-rule-2); stroke-width: 1; }
.node-branch rect { stroke-dasharray: none; }
.node.is-selected rect { stroke: var(--color-accent); stroke-width: 2; }
.node.is-current rect { fill: var(--color-accent-wash); }
.node:focus-visible { outline: none; }
.node:focus-visible rect { stroke: var(--color-focus); stroke-width: 2.5; }

.node-version { font-size: 11px; font-weight: 600; fill: var(--color-ink); }
.node-title { font-size: 10px; fill: var(--color-ink-2); }
.node-behind { font-size: 9px; fill: var(--color-accent-deep, var(--color-accent)); }
.node-uncertain { font-size: 9px; fill: var(--color-muted); }

.graph-legend { display: flex; flex-wrap: wrap; gap: var(--space-md); margin: 0; padding: 0; list-style: none; font-size: var(--font-xs); color: var(--color-muted); }
.graph-legend li { display: inline-flex; align-items: center; gap: 6px; }
.swatch { display: inline-block; width: 18px; height: 0; border-top: 2px solid var(--color-rule-2); }
.swatch.edge-commit { border-top-color: var(--color-accent); }
.swatch.edge-rebase { border-top-style: dashed; border-top-color: var(--color-accent-2, var(--color-accent)); }
</style>
