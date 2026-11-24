import { describe, expect, it } from 'vitest';
import { createDefaultResumeData } from '@/utils/resumeData';
import type { ResumeHistoryArchive } from '@/types/history';
import { parseFullBackup, serializeFullBackup } from '../fullBackup';

function archive(): ResumeHistoryArchive {
  return {
    format: 'sea-resume-history',
    version: 1,
    resumeId: 'resume-1',
    head: 'hash-1',
    commits: [{
      hash: 'hash-1', contentHash: 'content-1', parentHash: null, message: '初始版本', author: '本机',
      createdAt: '2026-01-01T00:00:00.000Z', kind: 'initial', tags: ['基线'], avatarHash: undefined,
      stats: { additions: 1, deletions: 0, sections: ['个人信息'] }, bytes: 10,
      schemaVersion: 1, resumeId: 'resume-1', snapshot: { title: '简历', basic: {} } as any,
    }],
    avatars: [],
    tags: { '基线': 'hash-1' },
    truncated: false,
    exportedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('全量备份携带版本历史', () => {
  it('round-trips optional history archives while staying version 1 compatible', () => {
    const resume = createDefaultResumeData();
    resume.id = 'resume-1';
    const serialized = serializeFullBackup([resume], [archive()]);
    const parsed = parseFullBackup(serialized);
    expect(parsed.histories).toHaveLength(1);
    expect(parsed.histories?.[0]?.tags['基线']).toBe('hash-1');
    expect(parsed.resumes[0]?.id).toBe('resume-1');
  });

  it('accepts old backups without histories', () => {
    const resume = createDefaultResumeData();
    const parsed = parseFullBackup(serializeFullBackup([resume]));
    expect(parsed.histories).toBeUndefined();
  });

  it('rejects an archive whose commit is malformed', () => {
    const resume = createDefaultResumeData();
    const broken = archive() as any;
    delete broken.commits[0].snapshot;
    expect(() => serializeFullBackup([resume], [broken])).toThrow();
  });
});
