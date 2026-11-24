/**
 * 简历版本图谱的布局。
 *
 * 版式参考主流 Git 客户端：**左侧一条窄轨道图，右侧一条逐行对应的列表**。
 * 列表承担「这是什么版本」，窄图只承担「它和谁有关」。
 *
 * 布局只回答三件事，渲染交给组件：
 * - rows：每一行是一条记录，按时间从新到旧
 * - 每行的 lane（列号）与 color：窄图里画在哪个位置、什么颜色
 * - links：行与行之间的关系（推进 / 分叉 / 同步），渲染时折成左图里的线段
 *
 * 纯函数，可完全单测。
 */
import type { ResumeMeta } from '@/types/resume';

export type GraphLinkKind = 'commit' | 'fork' | 'rebase';

/** 轨道配色。同一轨道在整张图里颜色一致，便于列表左侧色点与窄图对应。 */
export const LANE_COLORS = [
  'var(--color-accent)',
  'oklch(62% 0.12 150)',
  'oklch(66% 0.14 45)',
  'oklch(58% 0.14 310)',
  'oklch(60% 0.12 200)',
  'oklch(64% 0.12 90)',
];

/** 相邻两行之间的连线，折成「从上一行的第 fromLane 列，走到下一行的第 toLane 列」。 */
export interface RowEdgeRef {
  kind: GraphLinkKind;
  /** 另一端在列表里的行号。 */
  peerRow: number;
  fromLane: number;
  toLane: number;
}

export interface GraphRow {
  id: string;
  title: string;
  kind: 'master' | 'branch';
  trackId: string;
  versionNumber: number;
  versionLabel: string;
  lane: number;
  color: string;
  /** 该行上方（更近的一行）与它相连的线。 */
  edgesAbove: RowEdgeRef[];
  /** 该行下方（更远的一行）与它相连的线。 */
  edgesBelow: RowEdgeRef[];
  company?: string;
  position?: string;
  behind?: { baseVersion: number; latestVersion: number; latestId: string };
  orphan?: boolean;
  /**
   * 贯穿本行的列：这些列在这一行既不是起点也不是终点，但关系线要穿过去。
   * 没有它，跨越多行的连线会在中间断开，左图看起来是一段一段的。
   */
  passThrough: number[];
}

export interface GraphLink {
  from: string;
  to: string;
  kind: GraphLinkKind;
}

export interface ResumeGraph {
  rows: GraphRow[];
  links: GraphLink[];
  /** 行号 → 该行的 lane，便于渲染时按列取色。 */
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

/** 同一岗位的标识：轨道 + 公司 + 职位；不看 versionName（同步时用户常改名）。 */
function jobKey(row: ResumeMeta): string {
  const target = row.jobTarget!;
  return `${row.trackId ?? ''}::${target.company ?? ''}::${target.position ?? ''}`;
}

/** 同轨道上版本号正好是 baseVersion 的那一版主干。找不到就不连线，不回退到 baseId。 */
function masterIdAt(
  trackId: string | undefined,
  baseVersion: number | undefined,
  masterTracks: ReadonlyMap<string, readonly ResumeMeta[]>,
): string | undefined {
  if (!trackId || typeof baseVersion !== 'number') return undefined;
  return masterTracks.get(trackId)?.find((row) => versionOf(row) === baseVersion)?.id;
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

/** 把同一岗位的记录串成链：链头是没被同步过的那个，之后按 rebasedFromId 依次接上。 */
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

export function buildResumeGraph(resumes: ResumeMeta[], options: GraphOptions = {}): ResumeGraph {
  const raw = Array.isArray(resumes) ? resumes.filter(Boolean) : [];
  const list = options.relatedOnly ? filterRelated(raw) : raw;
  void options.currentId;

  const links: GraphLink[] = [];
  const orphans: string[] = [];
  const uncertain: string[] = [];

  // ---- 1. 行顺序：时间从新到旧 ----
  const ordered = [...list].sort((a, b) => timeOf(b) - timeOf(a) || a.id.localeCompare(b.id));
  const rowIndexOf = new Map(ordered.map((row, index) => [row.id, index]));

  // ---- 2. 列分配：每条轨道占一列，按「区间是否重叠」复用 ----
  //
  // 行号越小越新。一条轨道占用 [newest, oldest] 这一段行；
  // 只有两个区间完全不重叠时才能共用一列，否则同一列上会出现两条并行的线。
  const laneRanges = new Map<number, Array<{ start: number; end: number }>>();
  const laneOf = new Map<string, number>();
  const overlaps = (lane: number, start: number, end: number): boolean =>
    (laneRanges.get(lane) ?? []).some((range) => start <= range.end && end >= range.start);
  const claimLane = (id: string, start: number, end: number, preferred: number): number => {
    let lane = Math.max(0, preferred);
    while (overlaps(lane, start, end)) lane += 1;
    const ranges = laneRanges.get(lane) ?? [];
    ranges.push({ start, end });
    laneRanges.set(lane, ranges);
    laneOf.set(id, lane);
    return lane;
  };

  // 主干按轨道分组：同一轨道的所有版本共用一个列号。
  const masterTracks = new Map<string, ResumeMeta[]>();
  for (const row of ordered) {
    if (isBranch(row)) continue;
    const trackId = row.trackId ?? row.id;
    const bucket = masterTracks.get(trackId);
    if (bucket) bucket.push(row);
    else masterTracks.set(trackId, [row]);
  }
  const masterLane = new Map<string, number>();
  for (const [trackId, rows] of masterTracks) {
    // 占用该轨道从最新一行到最旧一行的整段，而不是只占最新一行。
    // 只占最新一行时，另一条主干会铺进它下面还在用的列。
    const indexes = rows.map((row) => rowIndexOf.get(row.id)!);
    const newest = Math.min(...indexes);
    const oldest = Math.max(...indexes);
    const lane = claimLane(`track:${trackId}`, newest, oldest, 0);
    masterLane.set(trackId, lane);
  }

  // 岗位按链路分组，逐条占列：链头放在锚点主干右侧的下一列。
  const jobGroups = new Map<string, ResumeMeta[]>();
  for (const row of ordered) {
    if (!isBranch(row)) continue;
    const key = jobKey(row);
    const bucket = jobGroups.get(key);
    if (bucket) bucket.push(row);
    else jobGroups.set(key, [row]);
  }

  const orphanSet = new Set<string>();
  const rowObjects = new Map<string, GraphRow>();
  for (const row of ordered) {
    const target = row.jobTarget;
    const kind: GraphRow['kind'] = target ? 'branch' : 'master';
    const graphRow: GraphRow = {
      id: row.id,
      title: row.title,
      kind,
      trackId: row.trackId ?? '',
      versionNumber: versionOf(row),
      versionLabel: kind === 'master' ? `v${versionOf(row)}` : '',
      lane: masterLane.get(row.trackId ?? '') ?? 0,
      color: LANE_COLORS[0]!,
      edgesAbove: [],
      edgesBelow: [],
      passThrough: [],
      ...(target?.company ? { company: target.company } : {}),
      ...(target?.position ? { position: target.position } : {}),
    };
    rowObjects.set(row.id, graphRow);
  }

  for (const [, group] of jobGroups) {
    const { ordered: chain, guessed } = chainOf(group);
    chain.forEach((row, chainIndex) => {
      const target = row.jobTarget!;
      // 同步不改 baseId：它始终是最初分出的那一版。
      // 这一版对应的主干由 baseVersion 在同轨道上找。
      const anchorId = masterIdAt(row.trackId, target.baseVersion, masterTracks);
      const anchorRow = anchorId ? rowObjects.get(anchorId) : undefined;
      const anchorLane = anchorRow ? anchorRow.lane : (masterLane.get(row.trackId ?? '') ?? 0);
      const index = rowIndexOf.get(row.id)!;
      // 「是同步来的」只由 rebasedFromId 决定，不能按链上的序号判断：
      // 旧数据没有 rebasedFromId 时，同岗位的多条记录是各自独立的派生版本，
      // 按序号会把它们错标成「同步到 vN」。
      const isRebased = Boolean(target.rebasedFromId);
      // 首版紧挨锚点主干；同步来的版本逐层向右，避免与已有版本重叠。
      // 岗位只在它自己那一行出现，所以占用区间就是 [index, index]。
      const lane = claimLane(row.id, index, index, anchorLane + 1 + (isRebased ? chainIndex : 0));
      const graphRow = rowObjects.get(row.id)!;
      graphRow.lane = lane;
      graphRow.versionLabel = isRebased
        ? `同步到 v${target.baseVersion ?? versionOf(row)}`
        : `从 v${target.baseVersion ?? versionOf(row)} 分出`;

      if (!anchorRow) {
        graphRow.orphan = true;
        orphanSet.add(row.id);
        orphans.push(row.id);
        return;
      }
      links.push({ from: anchorId!, to: row.id, kind: isRebased ? 'rebase' : 'fork' });
    });
    if (guessed) for (const row of chain.slice(1)) uncertain.push(row.id);
  }

  // 主干内的推进连线。
  for (const [, rows] of masterTracks) {
    const byVersion = [...rows].sort((a, b) => versionOf(a) - versionOf(b));
    for (let i = 1; i < byVersion.length; i += 1) {
      links.push({ from: byVersion[i - 1]!.id, to: byVersion[i]!.id, kind: 'commit' });
    }
  }

  // ---- 3. 行间连线：把每条 link 折算到上下两行 ----
  for (const link of links) {
    const fromIndex = rowIndexOf.get(link.from);
    const toIndex = rowIndexOf.get(link.to);
    const fromRow = rowObjects.get(link.from);
    const toRow = rowObjects.get(link.to);
    if (fromIndex === undefined || toIndex === undefined || !fromRow || !toRow) continue;
    const upperIndex = Math.min(fromIndex, toIndex);
    const lowerIndex = Math.max(fromIndex, toIndex);
    const upperRow = upperIndex === fromIndex ? fromRow : toRow;
    const lowerRow = lowerIndex === fromIndex ? fromRow : toRow;
    const upperLane = upperRow.lane;
    const lowerLane = lowerRow.lane;
    rowObjects.get(ordered[upperIndex]!.id)!.edgesBelow.push({ kind: link.kind, peerRow: lowerIndex, fromLane: upperLane, toLane: lowerLane });
    rowObjects.get(ordered[lowerIndex]!.id)!.edgesAbove.push({ kind: link.kind, peerRow: upperIndex, fromLane: upperLane, toLane: lowerLane });
  }

  // ---- 3.5 贯穿线：跨多行的关系要在中间行的对应列上画一段竖线 ----
  // 列取连线两端里更靠上的那一端。同步线的起点是 baseVersion 对应的主干，
  // 它往往在列表下方，不能用 link.from 的列。
  for (const link of links) {
    const fromIndex = rowIndexOf.get(link.from);
    const toIndex = rowIndexOf.get(link.to);
    if (fromIndex === undefined || toIndex === undefined) continue;
    const upper = Math.min(fromIndex, toIndex);
    const lower = Math.max(fromIndex, toIndex);
    const drawnLane = rowObjects.get(ordered[upper]!.id)?.lane;
    if (drawnLane === undefined) continue;
    for (let index = upper + 1; index < lower; index += 1) {
      const between = rowObjects.get(ordered[index]!.id);
      if (!between || between.passThrough.includes(drawnLane)) continue;
      between.passThrough.push(drawnLane);
    }
  }

  // ---- 4. 颜色与落后判定 ----
  const laneCount = Math.max(1, ...[...laneOf.values(), ...[...masterLane.values()]].map((lane) => lane + 1));
  for (const graphRow of rowObjects.values()) graphRow.color = LANE_COLORS[graphRow.lane % LANE_COLORS.length]!;

  for (const graphRow of rowObjects.values()) {
    if (graphRow.kind !== 'branch') continue;
    const target = list.find((row) => row.id === graphRow.id)?.jobTarget;
    if (!target?.baseVersion) continue;
    const trackMasters = masterTracks.get(graphRow.trackId);
    if (!trackMasters?.length) continue;
    const latest = trackMasters.reduce((max, row) => (versionOf(row) > versionOf(max) ? row : max), trackMasters[0]!);
    if (versionOf(latest) > target.baseVersion) {
      graphRow.behind = { baseVersion: target.baseVersion, latestVersion: versionOf(latest), latestId: latest.id };
    }
  }

  const rows = ordered.map((row) => rowObjects.get(row.id)!);
  return { rows, links, laneCount, uncertain, orphans };
}
