import { describe, expect, it } from 'vitest';
import { buildResumeGraph } from '../resumeGraph';
import type { ResumeMeta } from '@/types/resume';

/**
 * 布局的核心主张：
 * - 纵向 = 主干版本（新的在上）
 * - 横向 = 分支深度（从主干分出算第 1 列，同步再分出算第 2 列……）
 * - 连线只连相邻位置，结构上不存在「横穿整张图」的线
 */

const T0 = Date.parse('2026-01-01T00:00:00Z');
const DAY = 86_400_000;

function master(id: string, versionNumber: number, trackId = 'T', offsetDays = versionNumber): ResumeMeta {
  return {
    id,
    title: '我的简历',
    templateId: 'modern',
    createdAt: T0,
    updatedAt: T0 + offsetDays * DAY,
    trackId,
    versionNumber,
  };
}

function job(
  id: string,
  baseId: string,
  baseVersion: number,
  extra: { trackId?: string; company?: string; position?: string; rebasedFromId?: string; offsetDays?: number } = {},
): ResumeMeta {
  return master(id, 1, extra.trackId ?? 'T', extra.offsetDays ?? 10)
    && {
      ...master(id, 1, extra.trackId ?? 'T', extra.offsetDays ?? 10),
      title: extra.company ?? 'Acme 前端',
      jobTarget: {
        versionName: extra.company ?? 'Acme 前端',
        company: extra.company ?? 'Acme',
        position: extra.position ?? '前端工程师',
        sourceResumeId: baseId,
        baseId,
        baseVersion,
        ...(extra.rebasedFromId ? { rebasedFromId: extra.rebasedFromId } : {}),
      },
    };
}

describe('主干列', () => {
  it('keeps every master version in one column ordered by version', () => {
    const graph = buildResumeGraph([master('m1', 1), master('m2', 2), master('m3', 3)]);
    const masters = graph.nodes.filter((node) => node.kind === 'master').sort((a, b) => a.versionNumber - b.versionNumber);
    expect(new Set(masters.map((node) => node.lane)).size).toBe(1);
    // row 是主干版本序号：越大越新；渲染时换算成 y（row 大 → y 小 → 更靠上）。
    expect(masters[2]!.row).toBeGreaterThan(masters[1]!.row);
    expect(masters[1]!.row).toBeGreaterThan(masters[0]!.row);
    expect(masters[2]!.y).toBeLessThan(masters[0]!.y);
  });

  it('gives independent masters their own column', () => {
    const graph = buildResumeGraph([master('a1', 1, 'TA'), master('b1', 1, 'TB')], { relatedOnly: false });
    expect(new Set(graph.nodes.map((node) => node.lane)).size).toBe(2);
  });
});

describe('岗位挂在派生行上', () => {
  it('places a job beside the exact master version it forked from', () => {
    const graph = buildResumeGraph([master('m1', 1), master('m2', 2), master('m3', 3), job('j1', 'm2', 2)]);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    // 与 v2 同一行，且比主干靠右一列。
    expect(byId.get('j1')!.row).toBe(byId.get('m2')!.row);
    expect(byId.get('j1')!.lane).toBe(byId.get('m2')!.lane + 1);
  });

  it('stacks two jobs forked from the same version on different columns', () => {
    const graph = buildResumeGraph([
      master('m1', 1), master('m2', 2),
      job('a1', 'm2', 2, { company: 'Acme' }),
      job('b1', 'm2', 2, { company: 'Beta' }),
    ]);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    expect(byId.get('a1')!.row).toBe(byId.get('m2')!.row);
    expect(byId.get('b1')!.row).toBe(byId.get('m2')!.row);
    // 不能叠在同一格。
    expect(byId.get('a1')!.lane).not.toBe(byId.get('b1')!.lane);
  });

  it('places a synced version beside the master version it synced to', () => {
    const graph = buildResumeGraph([
      master('m1', 1), master('m2', 2), master('m3', 3),
      job('j1', 'm1', 1),
      job('j2', 'm3', 3, { rebasedFromId: 'j1' }),
    ]);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    // 同步来的版本与它同步到的那版主干同一行，并在主干右一列。
    expect(byId.get('j2')!.row).toBe(byId.get('m3')!.row);
    expect(byId.get('j2')!.lane).toBe(byId.get('m3')!.lane + 1);
    // j1 挂在 m1 旁，两者可以同列不同行——布局优先「连线不跨列」，而不是「链必须逐层右移」。
    expect(byId.get('j1')!.lane).toBe(byId.get('m1')!.lane + 1);
  });
});

describe('连线只连相邻位置', () => {
  it('never produces an edge that skips more than one column', () => {
    const graph = buildResumeGraph([
      master('m1', 1), master('m2', 2), master('m3', 3),
      job('j1', 'm1', 1),
      job('j2', 'm3', 3, { rebasedFromId: 'j1' }),
      job('k1', 'm2', 2, { company: 'Beta' }),
    ]);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const edge of graph.edges) {
      const from = byId.get(edge.from)!;
      const to = byId.get(edge.to)!;
      expect(Math.abs(from.lane - to.lane), `${edge.kind} ${edge.from}->${edge.to}`).toBeLessThanOrEqual(1);
    }
  });

  it('connects master versions with vertical commit edges', () => {
    const graph = buildResumeGraph([master('m1', 1), master('m2', 2), master('m3', 3)]);
    const commits = graph.edges.filter((edge) => edge.kind === 'commit');
    expect(commits).toHaveLength(2);
  });

  it('connects a job to the master version it forked from', () => {
    const graph = buildResumeGraph([master('m1', 1), master('m2', 2), job('j1', 'm2', 2)]);
    const fork = graph.edges.find((edge) => edge.kind === 'fork')!;
    expect([fork.from, fork.to]).toEqual(['m2', 'j1']);
  });

  it('connects a synced version back to the master version it synced to', () => {
    const graph = buildResumeGraph([
      master('m1', 1), master('m3', 3),
      job('j1', 'm1', 1),
      job('j2', 'm3', 3, { rebasedFromId: 'j1' }),
    ]);
    const rebase = graph.edges.find((edge) => edge.kind === 'rebase')!;
    expect([rebase.from, rebase.to]).toEqual(['m3', 'j2']);
  });
});

describe('找不到主干的分支', () => {
  it('reports it as orphaned instead of drawing a long edge', () => {
    const graph = buildResumeGraph([master('m1', 1), job('lost', 'missing', 1, { trackId: 'OTHER' })]);
    expect(graph.orphans).toContain('lost');
    // 孤立节点不产生任何指向不存在目标的连线。
    expect(graph.edges.some((edge) => edge.from === 'lost' || edge.to === 'lost')).toBe(false);
  });

  it('keeps an orphan visible with its own column', () => {
    const graph = buildResumeGraph([master('m1', 1), job('lost', 'missing', 1, { trackId: 'OTHER' })]);
    expect(graph.nodes.some((node) => node.id === 'lost')).toBe(true);
  });
});

describe('尺寸与确定性', () => {
  it('sizes the canvas from real rows and columns', () => {
    const graph = buildResumeGraph([master('m1', 1), master('m2', 2), job('j1', 'm1', 1)]);
    expect(graph.width).toBeGreaterThan(0);
    expect(graph.height).toBeGreaterThan(0);
    // 两行两列：高度不该按节点数（3）算成三行。
    const rows = new Set(graph.nodes.map((node) => node.row));
    expect(rows.size).toBe(2);
  });

  it('is deterministic', () => {
    const input = [master('m3', 3), master('m1', 1), job('j1', 'm1', 1), master('m2', 2)];
    expect(JSON.stringify(buildResumeGraph(input))).toBe(JSON.stringify(buildResumeGraph(input)));
  });

  it('handles an empty list', () => {
    const graph = buildResumeGraph([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});
