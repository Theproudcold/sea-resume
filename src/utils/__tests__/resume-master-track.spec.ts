import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { createJobResumeVersion, masterBehindStatus } from '@/utils/resumeVersions';
import { normalizeResumeData } from '@/utils/resumeData';
import { metaFromResume } from '@/services/storage/StorageManager';
import type { ResumeData, ResumeMeta } from '@/types/resume';

function resume(overrides: Partial<ResumeData> = {}): ResumeData {
  const base = parseResumeMarkdown('# Alex').resume;
  return { ...base, ...overrides };
}

/** 构造一条列表索引；不传 jobTarget 即为工作台主简历。 */
function meta(id: string, extra: Partial<ResumeMeta> = {}): ResumeMeta {
  return {
    id,
    title: id,
    templateId: 'modern',
    createdAt: Date.parse('2026-01-01T00:00:00Z'),
    updatedAt: Date.parse('2026-01-01T00:00:00Z'),
    ...extra,
  };
}

describe('轨道字段：归一化补齐', () => {
  it('fills trackId with the resume id and versionNumber with 1 for legacy data', () => {
    const legacy = JSON.parse(JSON.stringify(resume())) as ResumeData;
    delete legacy.trackId;
    delete legacy.versionNumber;
    const normalized = normalizeResumeData(legacy);
    expect(normalized.trackId).toBe(legacy.id);
    expect(normalized.versionNumber).toBe(1);
  });

  it('keeps existing track fields and rejects junk values', () => {
    const normalized = normalizeResumeData({ ...resume(), trackId: 'track-a', versionNumber: 4 });
    expect(normalized.trackId).toBe('track-a');
    expect(normalized.versionNumber).toBe(4);

    const junk = normalizeResumeData({ ...resume(), trackId: '   ', versionNumber: 0 });
    expect(junk.trackId).toBeTruthy();
    expect(junk.versionNumber).toBe(1);
    const negative = normalizeResumeData({ ...resume(), versionNumber: -3 });
    expect(negative.versionNumber).toBe(1);
  });

  it('does not migrate jobTarget into track fields', () => {
    // 旧的岗位版本没有轨道字段，不能被误认成主干。
    const legacyBranch = normalizeResumeData({
      ...resume(),
      jobTarget: { versionName: 'Acme', company: 'Acme', position: '前端', sourceResumeId: 'main-1' },
    });
    expect(legacyBranch.trackId).toBe(legacyBranch.id);
  });
});

describe('轨道字段：索引派生', () => {
  it('carries track fields into the list index', () => {
    const data = resume({ trackId: 'track-a', versionNumber: 3 });
    const index = metaFromResume(data);
    expect(index.trackId).toBe('track-a');
    expect(index.versionNumber).toBe(3);
  });
});

describe('创建岗位版本', () => {
  it('records the source track and the base version', () => {
    const source = resume({ trackId: 'track-a', versionNumber: 2 });
    const branch = createJobResumeVersion(source, { versionName: 'Acme 前端', company: 'Acme', position: '前端' }, 'branch-1');
    expect(branch.trackId).toBe('track-a');
    expect(branch.versionNumber).toBe(1);
    expect(branch.jobTarget).toMatchObject({
      sourceResumeId: source.id,
      baseId: source.id,
      baseVersion: 2,
    });
  });

  it('uses the source id as the track when the source has no track yet', () => {
    const source = resume();
    delete source.trackId;
    delete source.versionNumber;
    const branch = createJobResumeVersion(source, { versionName: '', company: 'Acme', position: '前端' }, 'branch-2');
    expect(branch.trackId).toBe(source.id);
    expect(branch.jobTarget!.baseVersion).toBe(1);
  });

  it('derives from a master, not from another branch', () => {
    const master = resume({ trackId: 'track-a', versionNumber: 3 });
    const first = createJobResumeVersion(master, { versionName: 'A', company: 'Acme', position: '前端' }, 'branch-a');
    const second = createJobResumeVersion(master, { versionName: 'B', company: 'Beta', position: '后端' }, 'branch-b');
    expect(first.trackId).toBe(second.trackId);
    expect(first.jobTarget!.baseVersion).toBe(3);
    expect(second.jobTarget!.baseVersion).toBe(3);
  });
});

describe('落后主干判定', () => {
  const master = (id: string, versionNumber: number) => meta(id, { trackId: 'track-a', versionNumber });

  it('reports behind when the branch base is older than the latest master', () => {
    const branch = meta('b1', {
      trackId: 'track-a',
      versionNumber: 1,
      jobTarget: { versionName: 'Acme', company: 'Acme', position: '前端', sourceResumeId: 'm1', baseId: 'm1', baseVersion: 1 },
    });
    const status = masterBehindStatus(branch, [master('m1', 1), master('m2', 2), master('m3', 3)]);
    expect(status).toMatchObject({ behind: true, baseVersion: 1, latestVersion: 3 });
  });

  it('reports not behind when the branch is already on the latest version', () => {
    const branch = meta('b1', {
      trackId: 'track-a',
      versionNumber: 1,
      jobTarget: { versionName: 'Acme', company: 'Acme', position: '前端', sourceResumeId: 'm3', baseId: 'm3', baseVersion: 3 },
    });
    expect(masterBehindStatus(branch, [master('m1', 1), master('m3', 3)]).behind).toBe(false);
  });

  it('treats a branch of a deleted master as not behind instead of throwing', () => {
    const branch = meta('b1', {
      trackId: 'track-gone',
      jobTarget: { versionName: 'Acme', company: 'Acme', position: '前端', sourceResumeId: 'x', baseId: 'x', baseVersion: 1 },
    });
    expect(masterBehindStatus(branch, [master('m1', 1)])).toMatchObject({ behind: false, latestVersion: null });
  });

  it('ignores branches when looking for the latest master', () => {
    const branch = meta('b2', {
      trackId: 'track-a',
      versionNumber: 9,
      jobTarget: { versionName: 'Other', company: 'Beta', position: '后端', sourceResumeId: 'm1', baseId: 'm1', baseVersion: 1 },
    });
    const target = meta('b1', {
      trackId: 'track-a',
      versionNumber: 1,
      jobTarget: { versionName: 'Acme', company: 'Acme', position: '前端', sourceResumeId: 'm1', baseId: 'm1', baseVersion: 1 },
    });
    // b2 的 versionNumber 更大，但它是分支，不能算作「更新的主干」。
    expect(masterBehindStatus(target, [master('m1', 2), branch]).latestVersion).toBe(2);
  });

  it('treats a master resume (no jobTarget) as never behind', () => {
    expect(masterBehindStatus(master('m1', 1), [master('m1', 1), master('m2', 2)]).behind).toBe(false);
  });

  it('does not report a legacy branch without baseVersion as behind', () => {
    const legacy = meta('legacy', {
      jobTarget: { versionName: 'Acme', company: 'Acme', position: '前端', sourceResumeId: 'm1' },
    });
    expect(masterBehindStatus(legacy, [master('m1', 1), master('m2', 2)]).behind).toBe(false);
  });
});

describe('同步来源字段', () => {
  it('keeps rebasedFromId through normalization', () => {
    const source = resume();
    source.jobTarget = {
      versionName: 'Acme', company: 'Acme', position: '前端',
      sourceResumeId: 'm1', baseId: 'm1', baseVersion: 2, rebasedFromId: 'previous-branch',
    };
    const normalized = normalizeResumeData(source);
    expect(normalized.jobTarget?.rebasedFromId).toBe('previous-branch');
  });

  it('does not invent rebasedFromId for legacy records', () => {
    const legacy = normalizeResumeData({
      ...resume(),
      jobTarget: { versionName: 'Acme', company: 'Acme', position: '前端', sourceResumeId: 'main-1' },
    });
    // 旧分支没有同步来源：留空，由图谱按「链头」处理，不伪造。
    expect(legacy.jobTarget?.rebasedFromId).toBeUndefined();
  });
});
