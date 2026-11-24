/**
 * 简历版本图谱的布局。
 *
 * 算法参考 vscode-git-graph 的 graph.ts（MIT）：那里踩过的坑最多，结构也最简洁。
 * 关键区别在于**以「路径」为单位而不是以「行」为单位**：
 *
 * - 每一行是一个顶点，顶点知道自己有哪些父节点（它由谁派生/同步而来）。
 * - 渲染单位是 Path：一条 Path 从某个顶点出发，沿父节点一路走到底，
 *   沿途经过的每一行都记一个折点，最后由组件一次性画成一条连续曲线。
 *
 * 之前按行生成线段，跨行的关系必然断在行边界——这是「连线不连续」的根因。
 *
 * 纯函数，不碰 DOM。
 */
import type { ResumeMeta } from '@/types/resume';

export type LinkKind = 'commit' | 'fork' | 'rebase';

/** 轨道配色，索引即 lane。 */
/**
 * 轨道配色。
 *
 * 各轨道之间要能一眼分开，所以色相拉开、彩度给足：
 * 之前彩度只有 0.12~0.14，深色底上几条线看起来都发灰，分不出是哪条分支。
 */
export const LANE_COLORS = [
  'var(--color-accent)',
  'oklch(68% 0.17 152)',
  'oklch(72% 0.19 55)',
  'oklch(64% 0.22 305)',
  'oklch(70% 0.16 215)',
  'oklch(76% 0.17 95)',
];

export interface GraphRow {
  id: string;
  /** 行号，0 在最上面。 */
  rowIndex: number;
  title: string;
  kind: 'master' | 'branch';
  trackId: string;
  versionNumber: number;
  versionLabel: string;
  /** 该行顶点所在的 lane。 */
  lane: number;
  color: string;
  company?: string;
  position?: string;
  behind?: { baseVersion: number; latestVersion: number; latestId: string };
  orphan?: boolean;
}

/** 路径上的一个折点。 */
export interface PathPoint {
  row: number;
  lane: number;
}

export interface GraphPath {
  /** 这条路径的颜色索引（= 起始 lane）。 */
  lane: number;
  color: string;
  /** 主线（同一轨道推进）还是支线。 */
  kind: 'main' | 'branch';
  /** 从起点到终点经过的折点，按行号递增。 */
  points: PathPoint[];
}

export interface GraphLink {
  from: string;
  to: string;
  kind: LinkKind;
}

export interface ResumeGraph {
  rows: GraphRow[];
  paths: GraphPath[];
  links: GraphLink[];
  laneCount: number;
  uncertain: string[];
  orphans: string[];
}

export interface GraphOptions {
  currentId?: string;
  relatedOnly?: boolean;
}

function versionOf(row: ResumeMeta): number {
  const value = row.versionNumber;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 1;
}

function isBranch(row: ResumeMeta): boolean {
  return Boolean(row.jobTarget);
}

function timeOf(row: ResumeMeta): number {
  const value = row.updatedAt;
  return typeof value === 'number' && Number.isFinite(value) ? value : row.createdAt;
}

function jobKey(row: ResumeMeta): string {
  const target = row.jobTarget!;
  return `${row.trackId ?? ''}::${target.company ?? ''}::${target.position ?? ''}`;
}

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

/** 同一岗位的记录串成链：链头是没被同步过的，之后按 rebasedFromId 依次接上。 */
function chainOf(group: ResumeMeta[]): { ordered: ResumeMeta[]; guessed: boolean } {
  const byId = new Map(group.map((row) => [row.id, row]));
  const successor = new Map<string, string>();
  for (const row of group) {
    const from = row.jobTarget?.rebasedFromId;
    if (from && byId.has(from) && from !== row.id) successor.set(from, row.id);
  }
  const ordered: ResumeMeta[] = [];
  const seen = new Set<string>();
  const heads = group
    .filter((row) => !group.some((other) => other !== row && successor.get(other.id) === row.id))
    .sort((a, b) => (a.jobTarget?.baseVersion ?? 0) - (b.jobTarget?.baseVersion ?? 0));
  for (const head of heads) {
    let cursor: ResumeMeta | undefined = head;
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      ordered.push(cursor);
      const nextId = successor.get(cursor.id);
      cursor = nextId ? byId.get(nextId) : undefined;
    }
  }
  const rest = group.filter((row) => !seen.has(row.id))
    .sort((a, b) => (a.jobTarget?.baseVersion ?? 0) - (b.jobTarget?.baseVersion ?? 0));
  for (const row of rest) ordered.push(row);
  return { ordered, guessed: ordered.length > 1 && !successor.size };
}

interface Vertex {
  row: number;
  parents: number[];
  /** 该顶点在当前 lane 上被占用的列。 */
  lane: number;
  /** 已被占用的列 → 占用的路径，用于让同一列承载多条不相交的线。 */
  connections: Array<{ parentRow: number; pathId: number }>;
  /** 下一个可用列（一行里可能有多条线经过）。 */
  nextLane: number;
  onPath: number;
}

export function buildResumeGraph(resumes: ResumeMeta[], options: GraphOptions = {}): ResumeGraph {
  const raw = Array.isArray(resumes) ? resumes.filter(Boolean) : [];
  const list = options.relatedOnly ? filterRelated(raw) : raw;
  void options.currentId;

  const orphans: string[] = [];
  const uncertain: string[] = [];
  const links: GraphLink[] = [];

  // ---- 1. 行：按时间从新到旧 ----
  const ordered = [...list].sort((a, b) => timeOf(b) - timeOf(a) || a.id.localeCompare(b.id));
  const rowIndexOf = new Map(ordered.map((row, index) => [row.id, index]));

  const rows: GraphRow[] = ordered.map((row, index) => {
    const target = row.jobTarget;
    const kind: GraphRow['kind'] = target ? 'branch' : 'master';
    return {
      id: row.id,
      rowIndex: index,
      title: row.title,
      kind,
      trackId: row.trackId ?? '',
      versionNumber: versionOf(row),
      versionLabel: kind === 'master'
        ? `v${versionOf(row)}`
        : (target?.rebasedFromId ? `同步到 v${target.baseVersion ?? versionOf(row)}` : `从 v${target?.baseVersion ?? versionOf(row)} 分出`),
      lane: 0,
      color: LANE_COLORS[0]!,
      ...(target?.company ? { company: target.company } : {}),
      ...(target?.position ? { position: target.position } : {}),
    };
  });

  // ---- 2. 顶点与父子关系 ----
  // 父 = 这条记录的来源：主干是上一版；岗位是它派生/同步到的那版主干。
  const masterRowsByTrack = new Map<string, number[]>();
  for (const row of ordered) {
    if (isBranch(row)) continue;
    const trackId = row.trackId ?? row.id;
    const bucket = masterRowsByTrack.get(trackId);
    const index = rowIndexOf.get(row.id)!;
    if (bucket) bucket.push(index);
    else masterRowsByTrack.set(trackId, [index]);
  }
  const masterIdAt = (trackId: string, version: number): number | null => {
    for (const index of masterRowsByTrack.get(trackId) ?? []) {
      if (versionOf(ordered[index]!) === version) return index;
    }
    return null;
  };

  const jobGroups = new Map<string, ResumeMeta[]>();
  for (const row of ordered) {
    if (!isBranch(row)) continue;
    const key = jobKey(row);
    const bucket = jobGroups.get(key);
    if (bucket) bucket.push(row);
    else jobGroups.set(key, [row]);
  }

  const vertices: Vertex[] = ordered.map((_, row) => ({ row, parents: [], lane: 0, connections: [], nextLane: 0, onPath: -1 }));

  // 主干：上一版 → 这一版
  for (const [, indexes] of masterRowsByTrack) {
    const byVersion = [...indexes].sort((a, b) => versionOf(ordered[a]!) - versionOf(ordered[b]!));
    for (let i = 1; i < byVersion.length; i += 1) {
      const previous = byVersion[i - 1]!;
      const current = byVersion[i]!;
      vertices[current]!.parents.push(previous);
      links.push({ from: ordered[current]!.id, to: ordered[previous]!.id, kind: 'commit' });
    }
  }

  // 岗位：链头挂到派生时的那版主干；同步来的版本挂到它同步到的那版主干。
  for (const [, group] of jobGroups) {
    const { ordered: chain, guessed } = chainOf(group);
    chain.forEach((row) => {
      const target = row.jobTarget!;
      const index = rowIndexOf.get(row.id)!;
      const anchor = masterIdAt(row.trackId ?? '', target.baseVersion ?? versionOf(row));
      if (anchor === null || anchor === index) {
        rows[index]!.orphan = true;
        orphans.push(row.id);
        return;
      }
      vertices[index]!.parents.push(anchor);
      links.push({ from: row.id, to: ordered[anchor]!.id, kind: target.rebasedFromId ? 'rebase' : 'fork' });
    });
    if (guessed) for (const row of chain.slice(1)) uncertain.push(row.id);
  }

  // ---- 3. 分配路径 ----
  //
  // 分两遍：
  // ① 先让主干占住自己的列，沿版本链走到底 —— 于是主干永远是一条完整的直线。
  // ② 再把每个岗位挂到它来源的那一版主干上：从岗位顶点竖直走过去，接上主干所在列。
  //
  // 一遍到底的做法会让分支在自己的起点就停住，画出来只是一个孤零零的点。
  const paths: GraphPath[] = [];
  /** 每个顶点所在的列；-1 表示还没分配。 */
  const laneOf: number[] = vertices.map(() => -1);

  // ① 主干：一条轨道一条路径，列号按轨道顺序给。
  let mainLaneCursor = 0;
  for (const [, indexes] of masterRowsByTrack) {
    const byVersion = [...indexes].sort((a, b) => versionOf(ordered[b]!) - versionOf(ordered[a]!));
    const lane = mainLaneCursor;
    mainLaneCursor += 1;
    const points: PathPoint[] = [];
    for (const index of byVersion) {
      laneOf[index] = lane;
      points.push({ row: index, lane });
    }
    paths.push({ lane, color: LANE_COLORS[lane % LANE_COLORS.length]!, kind: 'main', points });
  }

  // ② 岗位：每条分支占一段行区间（自己那行 → 来源行），区间不重叠时可复用同一列。
  //
  // 不复用时每个岗位各占一列，几条分支就横向铺开一大片，线间距看起来忽宽忽窄；
  // 复用后分支首尾相接在同一条竖线位置，才是 Git 图那种紧凑的轨道感。
  /** 每列已占用的行区间。 */
  const laneRanges: Array<Array<{ start: number; end: number }>> = [];
  const overlaps = (lane: number, start: number, end: number) =>
    (laneRanges[lane] ?? []).some((range) => start <= range.end && end >= range.start);
  const claimBranchLane = (start: number, end: number): number => {
    for (let lane = mainLaneCursor; lane < laneRanges.length + mainLaneCursor; lane += 1) {
      if (!overlaps(lane, start, end)) {
        (laneRanges[lane] ??= []).push({ start, end });
        return lane;
      }
    }
    const lane = laneRanges.length + mainLaneCursor;
    laneRanges[lane] = [{ start, end }];
    return lane;
  };

  for (const vertex of vertices) {
    if (rows[vertex.row]!.kind !== 'branch') continue;
    const parent = vertex.parents[0];
    if (parent === undefined) {
      // 孤立岗位：只给自己一个点，独占一列。
      const lane = claimBranchLane(vertex.row, vertex.row);
      laneOf[vertex.row] = lane;
      paths.push({ lane, color: LANE_COLORS[lane % LANE_COLORS.length]!, kind: 'branch', points: [{ row: vertex.row, lane }] });
      continue;
    }
    // 折点分三段：本列竖直下行 → 在「来源行上一行」处汇入主干列 → 落到来源行。
    // 中间保持在自己列上竖直走，弯折只占相邻一行，画出来才是平行的竖直轨道。
    const start = Math.min(vertex.row, parent);
    const end = Math.max(vertex.row, parent);
    const lane = claimBranchLane(start, end);
    laneOf[vertex.row] = lane;
    const points: PathPoint[] = [{ row: vertex.row, lane }];
    if (end - start > 1) {
      const stayRow = vertex.row < parent ? parent - 1 : parent + 1;
      points.push({ row: stayRow, lane });
    }
    points.push({ row: parent, lane: laneOf[parent] ?? 0 });
    paths.push({ lane, color: LANE_COLORS[lane % LANE_COLORS.length]!, kind: 'branch', points });
  }

  // ---- 4. 行上的 lane 与颜色 ----
  for (const vertex of vertices) {
    const row = rows[vertex.row]!;
    const lane = laneOf[vertex.row] ?? 0;
    row.lane = lane;
    row.color = LANE_COLORS[lane % LANE_COLORS.length]!;
  }

  // ---- 5. 落后判定 ----
  for (const row of rows) {
    if (row.kind !== 'branch') continue;
    const target = list.find((item) => item.id === row.id)?.jobTarget;
    if (!target?.baseVersion) continue;
    const indexes = masterRowsByTrack.get(row.trackId);
    if (!indexes?.length) continue;
    const latest = indexes.reduce((max, index) => (versionOf(ordered[index]!) > versionOf(ordered[max]!) ? index : max), indexes[0]!);
    const latestVersion = versionOf(ordered[latest]!);
    if (latestVersion > target.baseVersion) {
      row.behind = { baseVersion: target.baseVersion, latestVersion, latestId: ordered[latest]!.id };
    }
  }

  const laneCount = Math.max(1, ...paths.map((path) => Math.max(...path.points.map((point) => point.lane)) + 1));
  return { rows, paths, links, laneCount, uncertain, orphans };
}
