import { describe, expect, it } from 'vitest';
import { buildResumeGraph } from '../resumeGraph';
import type { ResumeMeta } from '@/types/resume';

/** 构造一条列表索引记录。 */
function resume(
  id: string,
  trackId: string,
  versionNumber: number,
  extra: Partial<ResumeMeta> = {},
): ResumeMeta {
  return {
    id,
    title: id,
    templateId: 'modern',
    createdAt: Date.parse('2026-01-01T00:00:00Z'),
    updatedAt: Date.parse('2026-01-01T00:00:00Z'),
    trackId,
    versionNumber,
    ...extra,
  };
}

function branch(
  id: string,
  trackId: string,
  baseId: string,
  baseVersion: number,
  extra: Partial<ResumeMeta> = {},
): ResumeMeta {
  return resume(id, trackId, 1, {
    jobTarget: { versionName: id, company: 'Acme', position: '前端', sourceResumeId: baseId, baseId, baseVersion },
    ...extra,
  });
}

describe('主干', () => {
  it('chains master versions into one unbroken lane', () => {
    const graph = buildResumeGraph([
      resume('m1', 'T', 1),
      resume('m2', 'T', 2),
      resume('m3', 'T', 3),
    ]);
    const masters = graph.nodes.filter((node) => node.kind === 'master').sort((a, b) => a.versionNumber - b.versionNumber);
    expect(masters.map((node) => node.lane)).toEqual([0, 0, 0]);
    expect(masters.map((node) => node.parentId)).toEqual([undefined, 'm1', 'm2']);
    expect(graph.edges.filter((edge) => edge.kind === 'commit')).toHaveLength(2);
  });

  it('puts the newest version on top', () => {
    const graph = buildResumeGraph([resume('m1', 'T', 1), resume('m3', 'T', 3), resume('m2', 'T', 2)]);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    // 行号越小越靠上：v3 在最上。
    expect(byId.get('m3')!.row).toBeLessThan(byId.get('m2')!.row);
    expect(byId.get('m2')!.row).toBeLessThan(byId.get('m1')!.row);
  });

  it('marks the highest version as the latest', () => {
    const graph = buildResumeGraph([resume('m1', 'T', 1), resume('m2', 'T', 2)]);
    expect(graph.nodes.find((node) => node.id === 'm2')!.isLatest).toBe(true);
    expect(graph.nodes.find((node) => node.id === 'm1')!.isLatest).toBe(false);
  });
});

describe('岗位分支', () => {
  it('forks from the exact master version it was created from', () => {
    const graph = buildResumeGraph([
      resume('m1', 'T', 1),
      resume('m2', 'T', 2),
      resume('m3', 'T', 3),
      branch('b1', 'T', 'm2', 2),
    ]);
    const node = graph.nodes.find((item) => item.id === 'b1')!;
    expect(node.kind).toBe('branch');
    expect(node.forkFromId).toBe('m2');
    const fork = graph.edges.find((edge) => edge.kind === 'fork')!;
    expect([fork.from, fork.to]).toEqual(['m2', 'b1']);
  });

  it('gives each job its own lane and keeps masters on lane 0', () => {
    const graph = buildResumeGraph([
      resume('m1', 'T', 1),
      resume('m2', 'T', 2),
      branch('b1', 'T', 'm1', 1),
      branch('b2', 'T', 'm1', 1, { jobTarget: { versionName: 'Beta 后端', company: 'Beta', position: '后端', sourceResumeId: 'm1', baseId: 'm1', baseVersion: 1 } }),
    ]);
    const lanes = graph.nodes.filter((node) => node.kind === 'branch').map((node) => node.lane);
    expect(new Set(lanes).size).toBe(2);
    expect(lanes).not.toContain(0);
  });

  it('marks a branch that is behind as behind and points at the newest master', () => {
    const graph = buildResumeGraph([
      resume('m1', 'T', 1),
      resume('m2', 'T', 2),
      resume('m3', 'T', 3),
      branch('b1', 'T', 'm1', 1),
    ]);
    expect(graph.nodes.find((node) => node.id === 'b1')!.behind).toEqual({ baseVersion: 1, latestVersion: 3, latestId: 'm3' });
    expect(graph.nodes.find((node) => node.id === 'm3')!.behind).toBeUndefined();
  });
});

describe('同步之后的链', () => {
  it('links repeated syncs into one branch lane instead of scattering them', () => {
    const first = branch('b1', 'T', 'm1', 1);
    const second = resume('b2', 'T', 1, {
      jobTarget: { versionName: 'B', company: 'Acme', position: '前端', sourceResumeId: 'm2', baseId: 'm2', baseVersion: 2, rebasedFromId: 'b1' },
    });
    const third = resume('b3', 'T', 1, {
      jobTarget: { versionName: 'B', company: 'Acme', position: '前端', sourceResumeId: 'm3', baseId: 'm3', baseVersion: 3, rebasedFromId: 'b2' },
    });
    const graph = buildResumeGraph([resume('m1', 'T', 1), resume('m2', 'T', 2), resume('m3', 'T', 3), first, second, third]);
    const chain = ['b1', 'b2', 'b3'].map((id) => graph.nodes.find((node) => node.id === id)!);
    // 同一岗位的三条记录在同一列，并且 b2 的前驱是 b1、b3 的前驱是 b2。
    expect(new Set(chain.map((node) => node.lane)).size).toBe(1);
    expect(chain[1]!.rebasedFromId).toBe('b1');
    expect(chain[2]!.rebasedFromId).toBe('b2');
    expect(graph.edges.filter((edge) => edge.kind === 'rebase')).toHaveLength(2);
  });

  it('draws a rebase edge from the master version it synced to', () => {
    const graph = buildResumeGraph([
      resume('m1', 'T', 1),
      resume('m2', 'T', 2),
      branch('b1', 'T', 'm1', 1),
      resume('b2', 'T', 1, {
        jobTarget: { versionName: 'B', company: 'Acme', position: '前端', sourceResumeId: 'm2', baseId: 'm2', baseVersion: 2, rebasedFromId: 'b1' },
      }),
    ]);
    const rebase = graph.edges.find((edge) => edge.kind === 'rebase')!;
    expect(rebase.from).toBe('m2');
    expect(rebase.to).toBe('b2');
  });

  it('falls back to ordering by base version for legacy records without rebasedFromId', () => {
    // 旧数据：同一岗位有两条记录，但没有 rebasedFromId。
    const old = branch('o1', 'T', 'm1', 1);
    const newer = resume('o2', 'T', 1, {
      jobTarget: { versionName: 'B', company: 'Acme', position: '前端', sourceResumeId: 'm2', baseId: 'm2', baseVersion: 2 },
    });
    const graph = buildResumeGraph([resume('m1', 'T', 1), resume('m2', 'T', 2), old, newer]);
    // 顺序是推测出来的，必须显式告知调用方。
    expect(graph.uncertain).toContain('o2');
    expect(graph.nodes.filter((node) => ['o1', 'o2'].includes(node.id)).every((node) => node.lane > 0)).toBe(true);
  });

  it('treats a lone legacy record as a chain head without guessing', () => {
    const graph = buildResumeGraph([resume('m1', 'T', 1), branch('b1', 'T', 'm1', 1)]);
    expect(graph.uncertain).not.toContain('b1');
  });
});

describe('异常数据', () => {
  it('does not throw when the master it forked from is gone', () => {
    const graph = buildResumeGraph([branch('b1', 'GONE', 'missing', 1)]);
    const node = graph.nodes.find((item) => item.id === 'b1')!;
    expect(node.forkFromId).toBeUndefined();
    expect(graph.uncertain).toContain('b1');
  });

  it('handles an empty list', () => {
    const graph = buildResumeGraph([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.lanes).toEqual([]);
  });

  it('handles a single master', () => {
    const graph = buildResumeGraph([resume('m1', 'T', 1)]);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.lanes).toHaveLength(1);
    expect(graph.edges).toEqual([]);
  });

  it('keeps branches when the track has no master left', () => {
    const graph = buildResumeGraph([branch('b1', 'T', 'm1', 1), branch('b2', 'T', 'm1', 1)]);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.uncertain).toContain('b1');
  });
});

describe('行号与坐标', () => {
  it('assigns every node a position inside the drawing area', () => {
    const graph = buildResumeGraph([
      resume('m1', 'T', 1),
      resume('m2', 'T', 2),
      branch('b1', 'T', 'm1', 1),
    ]);
    for (const node of graph.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
    }
    expect(graph.width).toBeGreaterThan(0);
    expect(graph.height).toBeGreaterThan(0);
  });

  it('is deterministic for the same input', () => {
    const input = [resume('m2', 'T', 2), resume('m1', 'T', 1), branch('b1', 'T', 'm1', 1)];
    expect(JSON.stringify(buildResumeGraph(input))).toBe(JSON.stringify(buildResumeGraph(input)));
  });

  it('reports the lane labels needed for the legend', () => {
    const graph = buildResumeGraph([resume('m1', 'T', 1), branch('b1', 'T', 'm1', 1)]);
    const masterLane = graph.lanes.find((lane) => lane.kind === 'master')!;
    expect(masterLane.label).toBeTruthy();
    expect(graph.lanes).toHaveLength(2);
  });
});

describe('分组与同步语义', () => {
  it('keeps different jobs in different lanes even when the track matches', () => {
    const graph = buildResumeGraph([
      resume('m1', 'T', 1),
      branch('b1', 'T', 'm1', 1),
      resume('b2', 'T', 1, {
        jobTarget: { versionName: 'Beta 后端', company: 'Beta', position: '后端', sourceResumeId: 'm1', baseId: 'm1', baseVersion: 1 },
      }),
    ]);
    const lanes = graph.nodes.filter((node) => node.kind === 'branch').map((node) => node.lane);
    expect(new Set(lanes).size).toBe(2);
  });

  it('groups the same job across renames into one lane', () => {
    // 同步时用户改过版本名，仍应算同一个岗位。
    const graph = buildResumeGraph([
      resume('m1', 'T', 1),
      resume('m2', 'T', 2),
      branch('b1', 'T', 'm1', 1),
      resume('b2', 'T', 1, {
        jobTarget: { versionName: 'Acme 前端（按官网 JD 调整）', company: 'Acme', position: '前端', sourceResumeId: 'm2', baseId: 'm2', baseVersion: 2, rebasedFromId: 'b1' },
      }),
    ]);
    expect(graph.nodes.filter((node) => node.kind === 'branch').every((node) => node.lane === 1)).toBe(true);
  });

  it('marks a store with no sync history as uncertain except its head', () => {
    const graph = buildResumeGraph([
      resume('m1', 'T', 1),
      resume('m2', 'T', 2),
      branch('o1', 'T', 'm1', 1),
      resume('o2', 'T', 1, {
        jobTarget: { versionName: 'B', company: 'Acme', position: '前端', sourceResumeId: 'm2', baseId: 'm2', baseVersion: 2 },
      }),
    ]);
    // 链头（基线最早的）不标，其余标为推测。
    expect(graph.uncertain).not.toContain('o1');
    expect(graph.uncertain).toContain('o2');
  });
});

describe('链内的上下顺序', () => {
  it('puts the chain head at the bottom of its lane, even when it is newer by time', () => {
    // 旧数据没有 rebasedFromId：基线小的那条在时间上反而更新。
    const head = branch('o1', 'T', 'm1', 1, { updatedAt: 5000 });
    const next = resume('o2', 'T', 1, {
      updatedAt: 1000,
      jobTarget: { versionName: 'B', company: 'Acme', position: '前端', sourceResumeId: 'm2', baseId: 'm2', baseVersion: 2 },
    });
    const graph = buildResumeGraph([resume('m1', 'T', 1), resume('m2', 'T', 2), head, next]);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    // 链头（基线 1）在下，基线 2 的版本在上。
    expect(byId.get('o1')!.row).toBeGreaterThan(byId.get('o2')!.row);
    expect(byId.get('o1')!.lane).toBe(byId.get('o2')!.lane);
  });

  it('puts synced versions above the version they came from', () => {
    const graph = buildResumeGraph([
      resume('m1', 'T', 1),
      resume('m2', 'T', 2),
      branch('b1', 'T', 'm1', 1),
      resume('b2', 'T', 1, {
        jobTarget: { versionName: 'B', company: 'Acme', position: '前端', sourceResumeId: 'm2', baseId: 'm2', baseVersion: 2, rebasedFromId: 'b1' },
      }),
    ]);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    expect(byId.get('b2')!.row).toBeLessThan(byId.get('b1')!.row);
  });
});

describe('只画有版本关系的简历', () => {
  it('drops standalone resumes when relatedOnly is set', () => {
    const graph = buildResumeGraph([
      resume('solo1', 'S1', 1),
      resume('solo2', 'S2', 1),
      resume('m1', 'T', 1),
      resume('m2', 'T', 2),
      branch('b1', 'T', 'm1', 1),
    ], { relatedOnly: true });
    expect(graph.nodes.map((node) => node.id).sort()).toEqual(['b1', 'm1', 'm2']);
    // 无关简历不占列：只剩主干一条 + 岗位一条。
    expect(graph.lanes).toHaveLength(2);
  });

  it('keeps a lone master when it is the base of a job version', () => {
    const graph = buildResumeGraph([resume('m1', 'T', 1), branch('b1', 'T', 'm1', 1)], { relatedOnly: true });
    expect(graph.nodes).toHaveLength(2);
  });

  it('keeps everything when relatedOnly is not set', () => {
    const graph = buildResumeGraph([resume('solo1', 'S1', 1), resume('m1', 'T', 1)]);
    expect(graph.nodes).toHaveLength(2);
  });
});
