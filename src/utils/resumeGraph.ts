/**
 * 简历版本图谱的布局计算。
 *
 * 纯函数：输入列表索引，输出每个节点的位置和节点之间的连线，组件只负责画。
 * 这样布局可以完全单测，不需要浏览器。
 *
 * 约定：
 * - 列（lane）= 轨道。主干占第 0 列，每个岗位占一列，按出现顺序从左到右。
 * - 行（row）= 时间。新的在上，与 Git 的阅读习惯一致。
 * - 连线分三种：主干或分支内部的推进（commit）、分支从主干分出（fork）、
 *   同步后内容回到分支（rebase）。
 */
import type { ResumeMeta } from '@/types/resume';

export type GraphEdgeKind = 'commit' | 'fork' | 'rebase';

export interface GraphNode {
  id: string;
  title: string;
  kind: 'master' | 'branch';
  trackId: string;
  versionNumber: number;
  lane: number;
  row: number;
  x: number;
  y: number;
  /** 主干内的前驱版本。 */
  parentId?: string;
  /** 分支从哪个主干版本分出。 */
  forkFromId?: string;
  /** 分支内的前驱：同步来源。 */
  rebasedFromId?: string;
  company?: string;
  position?: string;
  /** 落后于主干时的目标版本。 */
  behind?: { baseVersion: number; latestVersion: number; latestId: string };
  /** 所在轨道的最高版本。 */
  isLatest: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: GraphEdgeKind;
}

export interface GraphLane {
  lane: number;
  trackId: string;
  label: string;
  kind: 'master' | 'branch';
}

export interface ResumeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  lanes: GraphLane[];
  /** 顺序靠推测得到的节点：缺同步来源、锚点丢失等。UI 需要如实提示。 */
  uncertain: string[];
  width: number;
  height: number;
}

/** 每个泳道占的横向宽度。 */
export const LANE_WIDTH = 120;
/** 每个版本占的纵向高度。 */
export const ROW_HEIGHT = 76;
/** 顶部与左侧留白，避免连线贴边。 */
const PADDING_X = 16;
const PADDING_Y = 24;

function versionOf(row: ResumeMeta): number {
  const value = row.versionNumber;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 1;
}

function timeOf(row: ResumeMeta): number {
  return typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : row.createdAt;
}

function isBranch(row: ResumeMeta): boolean {
  return Boolean(row.jobTarget);
}

/**
 * 同一岗位的标识。
 *
 * 不能用 versionName：用户给每个岗位版本起的名字往往不同（同步后还可能改名），
 * 按名字分组会把同一岗位拆成几列。这里用「岗位 + 公司 + 所在轨道」，
 * 岗位名留空时退回标题。
 */
const groupKeyCache = new Map<string, string>();

/** 按节点 id 找回它所属的分组键。 */
function branchGroupKeyById(id: string): string | undefined {
  return groupKeyCache.get(id);
}

function branchGroupKey(row: ResumeMeta): string {
  const target = row.jobTarget;
  if (!target) return row.id;
  const role = [target.company ?? '', target.position ?? ''].join('|');
  return `${row.trackId ?? ''}::${role || row.title}`;
}

/**
 * 筛出有版本关系的简历：同一 trackId 下有多条，或者存在岗位版本。
 * 单份独立简历不参与图谱，由调用方另行告知数量。
 */
function filterRelated(rows: ResumeMeta[]): ResumeMeta[] {
  const byTrack = new Map<string, ResumeMeta[]>();
  for (const row of rows) {
    const trackId = row.trackId ?? row.id;
    const bucket = byTrack.get(trackId);
    if (bucket) bucket.push(row);
    else byTrack.set(trackId, [row]);
  }
  return rows.filter((row) => {
    const trackId = row.trackId ?? row.id;
    return row.jobTarget !== undefined || (byTrack.get(trackId)?.length ?? 0) > 1;
  });
}

interface CollectResult {
  masters: ResumeMeta[];
  branchGroups: Map<string, ResumeMeta[]>;
  uncertain: string[];
}

/**
 * 按轨道与岗位分组。
 *
 * 主干按 versionNumber 排序；分支优先按 `rebasedFromId` 串链，缺这个字段的旧数据
 * 退化为按 `baseVersion` 升序 + 时间排序，并记为「不确定」。
 */
function collect(resumes: ResumeMeta[]): CollectResult {
  const masters: ResumeMeta[] = [];
  const branchGroups = new Map<string, ResumeMeta[]>();
  const uncertain: string[] = [];

  for (const row of resumes) {
    if (!isBranch(row)) {
      masters.push(row);
      continue;
    }
    const key = branchGroupKey(row);
    groupKeyCache.set(row.id, key);
    const list = branchGroups.get(key);
    if (list) list.push(row);
    else branchGroups.set(key, [row]);
  }

  masters.sort((a, b) => versionOf(a) - versionOf(b) || timeOf(a) - timeOf(b));

  for (const [key, group] of branchGroups) {
    const byId = new Map(group.map((row) => [row.id, row]));
    // 每个节点指向它在同一岗位里的前驱。
    const predecessorOf = new Map<string, string>();
    for (const row of group) {
      const from = row.jobTarget?.rebasedFromId;
      if (from && byId.has(from) && from !== row.id) predecessorOf.set(row.id, from);
    }
    // 拓扑：没有前驱的是链头，顺着 rebasedFromId 依次排下去。
    const ordered: ResumeMeta[] = [];
    const visited = new Set<string>();
    const heads = group
      .filter((row) => !predecessorOf.has(row.id))
      .sort((a, b) => (a.jobTarget?.baseVersion ?? 0) - (b.jobTarget?.baseVersion ?? 0) || timeOf(a) - timeOf(b));
    for (const head of heads) {
      let cursor: ResumeMeta | undefined = head;
      while (cursor && !visited.has(cursor.id)) {
        visited.add(cursor.id);
        ordered.push(cursor);
        const nextId = group.find((row) => predecessorOf.get(row.id) === cursor!.id)?.id;
        cursor = nextId ? byId.get(nextId) : undefined;
      }
    }
    // 环或断链兜底：按基线排到末尾，并标为不确定。
    const rest = group.filter((row) => !visited.has(row.id)).sort((a, b) =>
      (a.jobTarget?.baseVersion ?? 0) - (b.jobTarget?.baseVersion ?? 0) || timeOf(a) - timeOf(b));
    for (const row of rest) {
      uncertain.push(row.id);
      ordered.push(row);
    }
    if (!predecessorOf.size && group.length > 1) {
      // 全组都没有同步来源：它们之间谁先谁后只能按基线推测。
      for (const row of ordered.slice(1)) if (!uncertain.includes(row.id)) uncertain.push(row.id);
    }
    branchGroups.set(key, ordered);
  }

  return { masters, branchGroups, uncertain };
}

export interface GraphOptions {
  currentId?: string;
  /**
   * 只保留有版本关系的简历（同一轨道有多版，或有岗位版本派生）。
   *
   * 工作台里有很多互不相关的单份简历，把它们各占一列会让图谱变成一大片空白；
   * 只画有关系的那部分，图才有意义。单份简历的轨道数会单独报告给 UI。
   */
  relatedOnly?: boolean;
}

export function buildResumeGraph(resumes: ResumeMeta[], options: GraphOptions = {}): ResumeGraph {
  const raw = Array.isArray(resumes) ? resumes.filter(Boolean) : [];
  const list = options.relatedOnly ? filterRelated(raw) : raw;
  void options.currentId;
  const { masters, branchGroups, uncertain } = collect(list);

  const nodeById = new Map<string, ResumeMeta>(list.map((row) => [row.id, row]));

  // 轨道 ID → lane。主干按轨道分列，岗位各占一列。
  const lanes: GraphLane[] = [];
  const laneOfTrack = new Map<string, number>();
  const masterTracks = new Map<string, ResumeMeta[]>();
  for (const row of masters) {
    const trackId = row.trackId ?? row.id;
    const bucket = masterTracks.get(trackId);
    if (bucket) bucket.push(row);
    else masterTracks.set(trackId, [row]);
  }
  // 每份独立的主干占一列；但它们互不相关，横向铺开会让图变得很长。
  // 这里保持一列一份，由组件负责横向滚动与初始定位，避免为了「好看」把无关简历硬塞进一列。
  for (const [trackId, rows] of masterTracks) {
    laneOfTrack.set(trackId, lanes.length);
    lanes.push({ lane: lanes.length, trackId, label: rows[rows.length - 1]?.title || '主干简历', kind: 'master' });
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 主干节点：同一轨道内相邻版本连成直线。
  const masterHeads = new Map<string, ResumeMeta>();
  for (const [trackId, rows] of masterTracks) {
    const lane = laneOfTrack.get(trackId)!;
    rows.forEach((row, index) => {
      const previous = index > 0 ? rows[index - 1] : undefined;
      nodes.push({
        id: row.id,
        title: row.title,
        kind: 'master',
        trackId,
        versionNumber: versionOf(row),
        lane,
        row: 0,
        x: 0,
        y: 0,
        ...(previous ? { parentId: previous.id } : {}),
        isLatest: index === rows.length - 1,
      });
      if (previous) edges.push({ from: previous.id, to: row.id, kind: 'commit' });
    });
    masterHeads.set(trackId, rows[rows.length - 1]!);
  }

  // 分支节点：每个岗位一列，按链的顺序排列。
  for (const [, rows] of branchGroups) {
    if (!rows.length) continue;
    const lane = lanes.length;
    const label = [rows[0]!.jobTarget?.company, rows[0]!.jobTarget?.position].filter(Boolean).join(' · ')
      || rows[0]!.jobTarget?.versionName || rows[0]!.title;
    lanes.push({ lane, trackId: rows[0]!.trackId ?? '', label, kind: 'branch' });
    rows.forEach((row, index) => {
      const previous = index > 0 ? rows[index - 1] : undefined;
      const anchorId = row.jobTarget?.rebasedFromId
        ? (index > 0 ? rows[index - 1]!.id : undefined)
        : (row.jobTarget?.baseId ?? undefined);
      nodes.push({
        id: row.id,
        title: row.title,
        kind: 'branch',
        trackId: row.trackId ?? '',
        versionNumber: versionOf(row),
        lane,
        row: 0,
        x: 0,
        y: 0,
        ...(previous ? { rebasedFromId: previous.id } : {}),
        ...(anchorId && nodeById.has(anchorId) ? { forkFromId: anchorId } : {}),
        ...(row.jobTarget?.company ? { company: row.jobTarget.company } : {}),
        ...(row.jobTarget?.position ? { position: row.jobTarget.position } : {}),
        isLatest: index === rows.length - 1,
      });
    });
  }

  // 连线：链头从主干分叉（fork），后续同步从它同步到的那版主干回到分支（rebase）。
  // rebase 的起点是主干节点而不是上一个分支节点，视觉上才是「内容来自这条主线」。
  for (const node of nodes) {
    if (node.kind !== 'branch') continue;
    const anchorId = nodeById.get(node.id)?.jobTarget?.baseId;
    const anchor = anchorId ? nodeById.get(anchorId) : undefined;
    if (node.rebasedFromId) {
      // 同步来的版本：从它同步到的那版主干拉一条虚弧线。
      const from = anchor && !isBranch(anchor) ? anchor.id : undefined;
      if (from) edges.push({ from, to: node.id, kind: 'rebase' });
      else if (!uncertain.includes(node.id)) uncertain.push(node.id);
      continue;
    }
    if (node.forkFromId && nodeById.has(node.forkFromId)) {
      edges.push({ from: node.forkFromId, to: node.id, kind: 'fork' });
    } else if (!uncertain.includes(node.id)) {
      uncertain.push(node.id);
    }
  }

  // 落后判定：与 masterBehindStatus 口径一致，只比较同轨道的主干。
  const masterByTrack = new Map<string, ResumeMeta[]>();
  for (const row of masters) {
    const trackId = row.trackId ?? row.id;
    const bucket = masterByTrack.get(trackId);
    if (bucket) bucket.push(row);
    else masterByTrack.set(trackId, [row]);
  }
  for (const node of nodes) {
    if (node.kind !== 'branch') continue;
    const mastersOfTrack = masterByTrack.get(node.trackId);
    const latest = mastersOfTrack && mastersOfTrack.length ? mastersOfTrack[mastersOfTrack.length - 1] : undefined;
    const baseVersion = nodeById.get(node.id)?.jobTarget?.baseVersion;
    if (!latest || !baseVersion) continue;
    const latestVersion = versionOf(latest);
    if (latestVersion > baseVersion) node.behind = { baseVersion, latestVersion, latestId: latest.id };
  }

  // 行号：同一列内按链的顺序排（链头在下、新的在上），不同列之间用时间对齐。
  const chainIndex = new Map<string, number>();
  for (const node of nodes) {
    if (node.kind !== 'branch') continue;
    const group = branchGroups.get(branchGroupKeyById(node.id) ?? '');
    const index = group ? group.findIndex((row) => row.id === node.id) : 0;
    chainIndex.set(node.id, index < 0 ? 0 : index);
  }
  const timed = [...nodes].sort((a, b) => {
    // 同一岗位内部先按链顺序定上下（链头在下），时间只在链之间做对齐参考。
    if (a.kind === 'branch' && b.kind === 'branch' && a.lane === b.lane) {
      return (chainIndex.get(b.id) ?? 0) - (chainIndex.get(a.id) ?? 0);
    }
    const ta = timeOf(nodeById.get(a.id)!);
    const tb = timeOf(nodeById.get(b.id)!);
    if (ta !== tb) return tb - ta;
    if (a.kind !== b.kind) return a.kind === 'master' ? -1 : 1;
    return b.versionNumber - a.versionNumber;
  });
  // 分支链内再校正一次：链头必须排在同一个岗位其它版本的下方。
  const laneRows = new Map<number, GraphNode[]>();
  for (const node of timed) {
    const list = laneRows.get(node.lane);
    if (list) list.push(node);
    else laneRows.set(node.lane, [node]);
  }
  for (const [lane, list] of laneRows) {
    const branches = list.filter((node) => node.kind === 'branch');
    if (branches.length < 2) continue;
    // 该列的可用行号（保持相对位置），按链顺序从下往上重排分支节点。
    const slots = list.map((node) => node.row).sort((a, b) => b - a);
    const chainOrder = [...branches].sort((a, b) => (chainIndex.get(a.id) ?? 0) - (chainIndex.get(b.id) ?? 0));
    chainOrder.forEach((node, index) => {
      node.row = slots[Math.min(index, slots.length - 1)]!;
    });
    void lane;
  }
  timed.forEach((node, index) => {
    node.row = index;
    node.x = PADDING_X + node.lane * LANE_WIDTH + LANE_WIDTH / 2;
    node.y = PADDING_Y + node.row * ROW_HEIGHT + ROW_HEIGHT / 2;
  });

  const width = PADDING_X * 2 + Math.max(lanes.length, 1) * LANE_WIDTH;
  const height = PADDING_Y * 2 + Math.max(nodes.length, 1) * ROW_HEIGHT;

  return { nodes, edges, lanes, uncertain, width, height };
}
