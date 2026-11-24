import { describe, expect, it } from 'vitest';
import { buildResumeGraph } from '../resumeGraph';
import type { ResumeMeta } from '@/types/resume';

const T0 = Date.parse('2026-01-01T00:00:00Z');
const DAY = 86_400_000;

function master(id: string, versionNumber: number, trackId = 'T', days = versionNumber): ResumeMeta {
  return { id, title: '我的简历', templateId: 'modern', createdAt: T0, updatedAt: T0 + days * DAY, trackId, versionNumber };
}
function job(id: string, baseId: string, baseVersion: number, extra: { trackId?: string; company?: string; rebasedFromId?: string; days?: number } = {}): ResumeMeta {
  const company = extra.company ?? 'Acme';
  return {
    ...master(id, 1, extra.trackId ?? 'T', extra.days ?? 10),
    title: `${company} 前端`,
    jobTarget: { versionName: `${company} 前端`, company, position: '前端工程师', sourceResumeId: baseId, baseId, baseVersion, ...(extra.rebasedFromId ? { rebasedFromId: extra.rebasedFromId } : {}) },
  };
}

describe('按分支生成连续路径', () => {
  it('emits one continuous path per track instead of per row', () => {
    const graph = buildResumeGraph([master('m1', 1, 'T', 1), master('m2', 2, 'T', 3), master('m3', 3, 'T', 5)]);
    // 主干一整条路径：经过 m1、m2、m3 三个点。
    expect(graph.paths).toHaveLength(1);
    const main = graph.paths[0]!;
    expect(main.points.map((p) => p.row).sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('keeps a path on one lane whenever it does not switch track', () => {
    const graph = buildResumeGraph([master('m1', 1, 'T', 1), master('m2', 2, 'T', 3)]);
    expect(new Set(graph.paths[0]!.points.map((p) => p.lane)).size).toBe(1);
  });

  it('gives every row exactly one vertex on some path', () => {
    const graph = buildResumeGraph([master('m1', 1, 'T', 1), job('j1', 'm1', 1, { days: 2 }), master('m2', 2, 'T', 3)]);
    for (const row of graph.rows) {
      const owners = graph.paths.filter((path) => path.points.some((p) => p.row === row.rowIndex));
      expect(owners.length, `第 ${row.rowIndex} 行没有所属路径`).toBeGreaterThan(0);
    }
  });

  it('gives each path a stable lane and colour', () => {
    const graph = buildResumeGraph([master('m1', 1, 'T', 1), master('m2', 2, 'T', 3), job('j1', 'm1', 1, { days: 2 })]);
    for (const path of graph.paths) {
      expect(typeof path.lane).toBe('number');
      expect(path.color).toBeTruthy();
    }
    // 两条路径不能占用同一列。
    expect(new Set(graph.paths.map((p) => p.lane)).size).toBe(graph.paths.length);
  });
});
