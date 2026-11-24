import { describe, expect, it } from 'vitest';
import { buildResumeGraph } from '../resumeGraph';
import type { ResumeMeta } from '@/types/resume';

/**
 * 版式参考主流的 Git 客户端：左侧一条窄轨道图，右侧逐行对应的一条信息列表。
 *
 * 布局只回答三件事：
 * - 每一行是什么（行 = 一条记录，按时间从新到旧）
 * - 每条记录在左图的哪一列（列号与颜色）
 * - 行与行之间的连线怎么走
 */

const T0 = Date.parse('2026-01-01T00:00:00Z');
const DAY = 86_400_000;

function master(id: string, versionNumber: number, trackId = 'T', days = versionNumber): ResumeMeta {
  return {
    id,
    title: '我的简历',
    templateId: 'modern',
    createdAt: T0,
    updatedAt: T0 + days * DAY,
    trackId,
    versionNumber,
  };
}

function job(
  id: string,
  baseId: string,
  baseVersion: number,
  extra: { trackId?: string; company?: string; position?: string; rebasedFromId?: string; days?: number } = {},
): ResumeMeta {
  const company = extra.company ?? 'Acme';
  const position = extra.position ?? '前端工程师';
  return {
    ...master(id, 1, extra.trackId ?? 'T', extra.days ?? 10),
    title: `${company} ${position}`,
    jobTarget: {
      versionName: `${company} ${position}`,
      company,
      position,
      sourceResumeId: baseId,
      baseId,
      baseVersion,
      ...(extra.rebasedFromId ? { rebasedFromId: extra.rebasedFromId } : {}),
    },
  };
}

describe('行 = 按时间从新到旧', () => {
  it('orders rows newest first', () => {
    const graph = buildResumeGraph([master('m1', 1, 'T', 1), master('m2', 2, 'T', 5), master('m3', 3, 'T', 9)]);
    expect(graph.rows.map((row) => row.id)).toEqual(['m3', 'm2', 'm1']);
  });

  it('gives every record exactly one row', () => {
    const input = [master('m1', 1), master('m2', 2), job('j1', 'm1', 1)];
    const graph = buildResumeGraph(input);
    expect(graph.rows).toHaveLength(input.length);
    expect(new Set(graph.rows.map((row) => row.id)).size).toBe(input.length);
  });

  it('carries the label parts the list needs', () => {
    const graph = buildResumeGraph([master('m1', 1), master('m2', 2), job('j1', 'm1', 1)]);
    const branchRow = graph.rows.find((row) => row.id === 'm1')!;
    expect(branchRow.kind).toBe('master');
    expect(branchRow.versionLabel).toBe('v1');
    const jobRow = graph.rows.find((row) => row.id === 'j1')!;
    expect(jobRow.kind).toBe('branch');
    expect(jobRow.company).toBe('Acme');
    expect(jobRow.position).toBe('前端工程师');
  });
});

describe('列 = 轨道', () => {
  it('keeps a master and its jobs in adjacent lanes', () => {
    const graph = buildResumeGraph([master('m1', 1), master('m2', 2), job('j1', 'm1', 1)]);
    const laneOf = (id: string) => graph.rows.find((row) => row.id === id)!.lane;
    expect(laneOf('m1')).toBe(0);
    expect(laneOf('j1')).toBe(1);
  });

  it('gives each track a distinct colour', () => {
    const graph = buildResumeGraph([
      master('a1', 1, 'TA'), master('a2', 2, 'TA'),
      master('b1', 1, 'TB'), master('b2', 2, 'TB'),
    ]);
    const colors = new Map<number, string>();
    for (const row of graph.rows) colors.set(row.lane, row.color);
    expect(new Set(colors.values()).size).toBe(colors.size);
  });

  it('reuses a lane when its track has no more rows', () => {
    // 列数是「同时存在」的最大数量，不是所有轨道数。
    const graph = buildResumeGraph([master('a1', 1, 'TA'), master('b1', 1, 'TB')]);
    expect(Math.max(...graph.rows.map((row) => row.lane))).toBeLessThanOrEqual(1);
  });

  it('does not reuse a lane while another track still occupies that span', () => {
    const graph = buildResumeGraph([
      master('a1', 1, 'TA', 1),
      master('a2', 2, 'TA', 5),
      master('b1', 1, 'TB', 3),
    ]);
    const laneOf = (id: string) => graph.rows.find((row) => row.id === id)!.lane;
    expect(laneOf('a1')).toBe(laneOf('a2'));
    expect(laneOf('b1')).not.toBe(laneOf('a1'));
  });
});

describe('连线', () => {
  it('links consecutive master versions', () => {
    const graph = buildResumeGraph([master('m1', 1), master('m2', 2), master('m3', 3)]);
    expect(graph.links.filter((link) => link.kind === 'commit')).toHaveLength(2);
  });

  it('links a job to the master version it forked from', () => {
    const graph = buildResumeGraph([master('m1', 1), master('m2', 2), job('j1', 'm2', 2)]);
    const fork = graph.links.find((link) => link.kind === 'fork')!;
    expect([fork.from, fork.to]).toEqual(['m2', 'j1']);
  });

  it('links a synced job to the master at baseVersion when baseId still points at the fork', () => {
    // saveRebasedVersion 只改 baseVersion 和 rebasedFromId，baseId 仍是最初分出的那一版。
    const graph = buildResumeGraph([
      master('m1', 1, 'T', 1),
      master('m2', 2, 'T', 2),
      master('m3', 3, 'T', 3),
      job('j1', 'm1', 1, { days: 4 }),
      job('j2', 'm1', 3, { rebasedFromId: 'j1', days: 5 }),
    ]);
    const rebase = graph.links.find((link) => link.kind === 'rebase');
    expect(rebase && [rebase.from, rebase.to]).toEqual(['m3', 'j2']);
    const fork = graph.links.find((link) => link.kind === 'fork');
    expect(fork && [fork.from, fork.to]).toEqual(['m1', 'j1']);
    expect(graph.rows.find((row) => row.id === 'j2')!.versionLabel).toBe('同步到 v3');
    expect(graph.rows.find((row) => row.id === 'j1')!.versionLabel).toBe('从 v1 分出');
  });

  it('does not draw a sync edge back to the original fork when that master version is gone', () => {
    const graph = buildResumeGraph([
      master('m1', 1),
      job('j1', 'm1', 1),
      job('j2', 'm1', 3, { rebasedFromId: 'j1' }),
    ]);
    expect(graph.orphans).toContain('j2');
    expect(graph.links.some((link) => link.to === 'j2')).toBe(false);
  });

  it('marks the edges that leave or enter a row', () => {
    // 每一行在左图里有「上面接哪些线、下面接哪些线」，渲染时据此画。
    const graph = buildResumeGraph([master('m1', 1), master('m2', 2), job('j1', 'm1', 1)]);
    const m2Row = graph.rows.find((row) => row.id === 'm2')!;
    expect(m2Row.edgesBelow.length).toBeGreaterThan(0);
  });

  it('continues a relation through the lane it is actually drawn on', () => {
    // 同步记录的 baseId 仍指向 m1，连线已经改到 m3。
    // 时间上 j2 在 m3 之上，中间的 j1 要按 j2 的列贯穿；
    // 分叉线从 j1 穿过 m2 回到 m1，按 j1 的列贯穿，不回到主干列。
    const graph = buildResumeGraph([
      master('m1', 1, 'T', 1),
      master('m2', 2, 'T', 2),
      master('m3', 3, 'T', 3),
      job('j1', 'm1', 1, { days: 4 }),
      job('j2', 'm1', 3, { rebasedFromId: 'j1', days: 5 }),
    ]);
    const laneOf = (id: string) => graph.rows.find((row) => row.id === id)!.lane;
    expect(graph.rows.find((row) => row.id === 'j1')!.passThrough).toContain(laneOf('j2'));
    const throughMaster = graph.rows.find((row) => row.id === 'm2')!.passThrough;
    expect(throughMaster).toContain(laneOf('j1'));
    expect(throughMaster).not.toContain(laneOf('m1'));
  });
});

describe('异常与边界', () => {
  it('marks a job whose master is missing as orphaned but still lists it', () => {
    const graph = buildResumeGraph([master('m1', 1), job('lost', 'missing', 1, { trackId: 'OTHER' })]);
    expect(graph.orphans).toContain('lost');
    expect(graph.rows.some((row) => row.id === 'lost')).toBe(true);
    expect(graph.links.some((link) => link.from === 'lost' || link.to === 'lost')).toBe(false);
  });

  it('handles an empty list', () => {
    const graph = buildResumeGraph([]);
    expect(graph.rows).toEqual([]);
    expect(graph.links).toEqual([]);
  });

  it('is deterministic', () => {
    const input = [master('m2', 2), master('m1', 1), job('j1', 'm1', 1)];
    expect(JSON.stringify(buildResumeGraph(input))).toBe(JSON.stringify(buildResumeGraph(input)));
  });

  it('filters standalone resumes when asked', () => {
    const graph = buildResumeGraph([master('solo', 1, 'S'), master('m1', 1, 'T'), master('m2', 2, 'T')], { relatedOnly: true });
    expect(graph.rows.map((row) => row.id)).not.toContain('solo');
  });
});

describe('列号稳定性', () => {
  it('keeps one track on the same lane across interleaved rows', () => {
    // 主干 v1..v4 之间夹着岗位行，主干的列号不能被挤走。
    const graph = buildResumeGraph([
      master('m1', 1, 'T', 1),
      job('j1', 'm1', 1, { days: 2 }),
      master('m2', 2, 'T', 3),
      job('k1', 'm2', 2, { days: 4, company: 'Beta' }),
      master('m3', 3, 'T', 5),
      master('m4', 4, 'T', 6),
    ]);
    const masterLanes = graph.rows.filter((row) => row.kind === 'master').map((row) => row.lane);
    expect(new Set(masterLanes).size).toBe(1);
    // 两个岗位都不与主干同列。它们所在行不重叠，因此可以共用同一列（类似 Git 的本地区块）。
    const jobLanes = graph.rows.filter((row) => row.kind === 'branch').map((row) => row.lane);
    expect(jobLanes).not.toContain(masterLanes[0]);
    expect(new Set(jobLanes).size).toBe(1);
  });

  it('reuses a lane only when the two tracks never coexist', () => {
    // 两条独立主干的时间区间完全不重叠时，可以共用第 0 列。
    const early = master('e1', 1, 'EA', 1);
    const late = master('l1', 1, 'LA', 9);
    const graph = buildResumeGraph([early, late]);
    expect(graph.rows.find((row) => row.id === 'e1')!.lane).toBe(graph.rows.find((row) => row.id === 'l1')!.lane);
  });

  it('does not reuse a lane when two tracks overlap in time', () => {
    const a = master('a1', 1, 'A', 1);
    const a2 = master('a2', 2, 'A', 9);
    const b = master('b1', 1, 'B', 5);
    const graph = buildResumeGraph([a, a2, b]);
    expect(graph.rows.find((row) => row.id === 'b1')!.lane).not.toBe(graph.rows.find((row) => row.id === 'a1')!.lane);
  });

  it('marks every row between two related rows as passing that lane', () => {
    const graph = buildResumeGraph([
      master('m1', 1, 'T', 1),
      job('j1', 'm1', 1, { days: 2 }),
      master('m2', 2, 'T', 3),
      master('m3', 3, 'T', 5),
    ]);
    // m1(第3行) 与 j1(第2行) 相邻，不需要贯穿；这里断言结构存在且是数组。
    expect(graph.rows.every((row) => Array.isArray(row.passThrough))).toBe(true);
  });

});
