/**
 * 简历版本图谱的布局。
 *
 * 核心划分（按数据模型来，不按时间）：
 * - **纵向 = 主干版本**。同一主干的所有版本占同一列，v1 在最下，版本越大越靠上。
 * - **横向 = 分支深度**。从主干某版分出的岗位在第 +1 列，该岗位同步后再分出的版本在第 +2 列……
 *
 * 这样每个岗位都「挂」在它派生/同步时的那一版主干旁边，连线只连相邻位置，
 * 结构上不存在横穿整张图的线。早期实现把每个岗位单独排成一列、按全局时间定行，
 * 结果跨列连线必须穿越大片区域，怎么绕都不干净。
 *
 * 纯函数：输出坐标与连线，组件只负责画。
 */
import type { ResumeMeta } from '@/types/resume';

export type GraphEdgeKind = 'commit' | 'fork' | 'rebase';

export interface GraphNode {
  id: string;
  title: string;
  kind: 'master' | 'branch';
  trackId: string;
  versionNumber: number;
  /** 列：主干为 0（或主干的序号），分支按深度递增。 */
  lane: number;
  /** 行：主干版本序号，越大越靠上。 */
  row: number;
  x: number;
  y: number;
  /** 主干内的前驱版本。 */
  parentId?: string;
  /** 从哪个主干版本分出（分支）。 */
  forkFromId?: string;
  /** 同步来源（分支）。 */
  rebasedFromId?: string;
  company?: string;
  position?: string;
  behind?: { baseVersion: number; latestVersion: number; latestId: string };
  isLatest: boolean;
  /** 找不到所属主干，无法连线。 */
  orphan?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: GraphEdgeKind;
}

export interface GraphLane {
  lane: number;
  label: string;
  kind: 'master' | 'branch';
}

export interface ResumeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  lanes: GraphLane[];
  /** 先后顺序靠推测得到的节点。 */
  uncertain: string[];
  /** 找不到主干的节点。 */
  orphans: string[];
  width: number;
  height: number;
}

/** 列宽：节点圆点 + 右侧标签。 */
export const LANE_WIDTH = 168;
/** 行高。 */
export const ROW_HEIGHT = 58;
/** 节点圆点半径。 */
export const NODE_RADIUS = 6.5;
/** 列内左侧留白，圆点位置。 */
export const LANE_PAD = 18;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 20;

export interface GraphOptions {
  currentId?: string;
  /** 只保留有版本关系的简历（同轨道多版或有岗位版本）。 */
  relatedOnly?: boolean;
}

function versionOf(row: ResumeMeta): number {
  const value = row.versionNumber;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 1;
}

function isBranch(row: ResumeMeta): boolean {
  return Boolean(row.jobTarget);
}

/** 同一岗位的标识：轨道 + 公司 + 职位；不看 versionName（同步时用户常改名）。 */
function jobKey(row: ResumeMeta): string {
  const target = row.jobTarget!;
  return `${row.trackId ?? ''}::${target.company ?? ''}::${target.position ?? ''}`;
}

/** 筛出有版本关系的简历。 */
function filterRelated(rows: ResumeMeta[]): ResumeMeta[] {
  const byTrack = new Map<string, ResumeMeta[]>();
  for (const row of rows) {
    const trackId = row.trackId ?? row.id;
    const bucket = byTrack.get(trackId);
    if (bucket) bucket.push(row);
    else byTrack.set(trackId, [row]);
  }
  return rows.filter((row) => isBranch(row) || (byTrack.get(row.trackId ?? row.id)?.length ?? 0) > 1);
}

/** 把每个岗位的记录串成链：链头是没被同步过的那个，之后按 rebasedFromId 依次接上。 */
function chainOf(group: ResumeMeta[]): { ordered: ResumeMeta[]; uncertain: boolean } {
  const byId = new Map(group.map((row) => [row.id, row]));
  const successor = new Map<string, string>();
  for (const row of group) {
    const from = row.jobTarget?.rebasedFromId;
    if (from && byId.has(from) && from !== row.id) successor.set(from, row.id);
  }
  const heads = group.filter((row) => !group.some((other) => other !== row && successor.get(other.id) === row.id));
  const ordered: ResumeMeta[] = [];
  const seen = new Set<string>();
  const sortedHeads = [...heads].sort((a, b) => (a.jobTarget?.baseVersion ?? 0) - (b.jobTarget?.baseVersion ?? 0));
  for (const head of sortedHeads) {
    let cursor: ResumeMeta | undefined = head;
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      ordered.push(cursor);
      const nextId = successor.get(cursor.id);
      cursor = nextId ? byId.get(nextId) : undefined;
    }
  }
  // 环或断链：按基线兜底，标为不确定。
  const rest = group.filter((row) => !seen.has(row.id))
    .sort((a, b) => (a.jobTarget?.baseVersion ?? 0) - (b.jobTarget?.baseVersion ?? 0));
  for (const row of rest) ordered.push(row);
  // 超过一条却没有同步来源时，先后是推测的。
  const uncertain = ordered.length > 1 && !successor.size;
  return { ordered, uncertain };
}

export function buildResumeGraph(resumes: ResumeMeta[], options: GraphOptions = {}): ResumeGraph {
  const raw = Array.isArray(resumes) ? resumes.filter(Boolean) : [];
  const list = options.relatedOnly ? filterRelated(raw) : raw;
  void options.currentId;

  const nodeById = new Map<string, GraphNode>();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const lanes: GraphLane[] = [];
  const uncertain: string[] = [];
  const orphans: string[] = [];

  const masters = list.filter((row) => !isBranch(row));
  const branches = list.filter(isBranch);

  // 主干按轨道分组，每条主干一列。
  const masterTracks = new Map<string, ResumeMeta[]>();
  for (const row of masters) {
    const trackId = row.trackId ?? row.id;
    const bucket = masterTracks.get(trackId);
    if (bucket) bucket.push(row);
    else masterTracks.set(trackId, [row]);
  }
  const baseLaneOf = new Map<string, number>();
  for (const [trackId, rows] of masterTracks) {
    const lane = lanes.length;
    baseLaneOf.set(trackId, lane);
    lanes.push({ lane, label: rows[rows.length - 1]?.title || '主干简历', kind: 'master' });
    const byVersion = [...rows].sort((a, b) => versionOf(a) - versionOf(b));
    byVersion.forEach((row, index) => {
      const previous = index > 0 ? byVersion[index - 1] : undefined;
      const node: GraphNode = {
        id: row.id,
        title: row.title,
        kind: 'master',
        trackId,
        versionNumber: versionOf(row),
        lane,
        row: versionOf(row) - 1,
        x: 0,
        y: 0,
        ...(previous ? { parentId: previous.id } : {}),
        isLatest: index === byVersion.length - 1,
      };
      nodes.push(node);
      nodeById.set(node.id, node);
      if (previous) edges.push({ from: previous.id, to: row.id, kind: 'commit' });
    });
  }

  // 岗位分组，逐个串链。
  const jobGroups = new Map<string, ResumeMeta[]>();
  for (const row of branches) {
    const key = jobKey(row);
    const bucket = jobGroups.get(key);
    if (bucket) bucket.push(row);
    else jobGroups.set(key, [row]);
  }

  // 占用表：同一格不能放两个节点。
  const occupied = new Set<string>();
  for (const node of nodes) occupied.add(`${node.lane}:${node.row}`);

  for (const [, group] of jobGroups) {
    const { ordered, uncertain: guessed } = chainOf(group);
    ordered.forEach((row, index) => {
      const target = row.jobTarget!;
      // 锚点永远是「这一版从哪一版主干来」：首次派生是 baseId，
      // 同步产生的新版本同样指向它同步到的那版主干（baseId 会被更新到那一版）。
      // 不能用 rebasedFromId——那是上一条分支记录，不是主干节点。
      const anchorId = target.baseId;
      const anchor = anchorId ? nodeById.get(anchorId) : undefined;
      const hasAnchor = Boolean(anchor && anchor.kind === 'master');
      const absoluteVersion = target.baseVersion ?? versionOf(row);

      // 列：锚点主干的右一列起，链上每加深一层再 +1。
      // 用「相邻位置」而不是绝对深度，保证每条连线最多跨一列。
      const baseLane = anchor ? anchor.lane : (baseLaneOf.get(row.trackId ?? '') ?? 0);
      // 起点是锚点主干右一列；被占用就继续右移，直到找到空格。
      // 每右移一格都会让连线多跨一列，所以优先抢占相邻列。
      let lane = baseLane + 1;
      // 行：与锚点主干同一行（同步来的与它同步到的那版同行）。
      let graphRow = hasAnchor ? anchor!.row : Math.max(0, absoluteVersion - 1);

      // 同一格被占用时只向右找空格：行必须与锚点主干同行（那是语义），不能随意下移。
      while (occupied.has(`${lane}:${graphRow}`)) lane += 1;
      occupied.add(`${lane}:${graphRow}`);

      const node: GraphNode = {
        id: row.id,
        title: row.title,
        kind: 'branch',
        trackId: row.trackId ?? '',
        versionNumber: versionOf(row),
        lane,
        row: graphRow,
        x: 0,
        y: 0,
        ...(hasAnchor ? (index === 0 ? { forkFromId: anchorId } : { rebasedFromId: anchorId }) : { orphan: true }),
        ...(target.company ? { company: target.company } : {}),
        ...(target.position ? { position: target.position } : {}),
        isLatest: index === ordered.length - 1,
      };
      nodes.push(node);
      nodeById.set(node.id, node);

      if (!hasAnchor) {
        orphans.push(row.id);
        return;
      }
      edges.push({ from: anchorId!, to: row.id, kind: index === 0 ? 'fork' : 'rebase' });
    });
    if (guessed) for (const row of ordered.slice(1)) uncertain.push(row.id);
  }

  // 岗位列名（按列号登记，供 UI 显示列头）。
  for (const node of nodes) {
    if (node.kind !== 'branch') continue;
    const label = [node.company, node.position].filter(Boolean).join(' · ') || node.title;
    if (!lanes.some((lane) => lane.lane === node.lane)) lanes.push({ lane: node.lane, label, kind: 'branch' });
  }
  lanes.sort((a, b) => a.lane - b.lane);

  // 落后判定：与 masterBehindStatus 口径一致，只比较同轨道主干。
  for (const node of nodes) {
    if (node.kind !== 'branch') continue;
    const target = list.find((row) => row.id === node.id)?.jobTarget;
    if (!target?.baseVersion) continue;
    const trackMasters = masterTracks.get(node.trackId);
    const latest = trackMasters && trackMasters.length
      ? trackMasters.reduce((max, row) => (versionOf(row) > versionOf(max) ? row : max), trackMasters[0]!)
      : undefined;
    if (!latest) continue;
    if (versionOf(latest) > target.baseVersion) {
      node.behind = { baseVersion: target.baseVersion, latestVersion: versionOf(latest), latestId: latest.id };
    }
  }

  const maxRow = nodes.reduce((max, node) => Math.max(max, node.row), 0);
  const maxLane = nodes.reduce((max, node) => Math.max(max, node.lane), 0);
  for (const node of nodes) {
    node.x = LANE_PAD + node.lane * LANE_WIDTH;
    // 行 0 在最上方：行号越大越靠下，所以用 (maxRow - row) 换算 y。
    node.y = PADDING_TOP + (maxRow - node.row) * ROW_HEIGHT + ROW_HEIGHT / 2;
  }

  const width = LANE_PAD * 2 + (nodes.length ? (maxLane + 1) * LANE_WIDTH : LANE_WIDTH);
  const height = PADDING_TOP + PADDING_BOTTOM + (nodes.length ? (maxRow + 1) * ROW_HEIGHT : ROW_HEIGHT);

  return { nodes, edges, lanes, uncertain, orphans, width, height };
}
