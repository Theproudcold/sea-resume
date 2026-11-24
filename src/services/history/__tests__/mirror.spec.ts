import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResumeCommit, ResumeRefs, StoredAvatar } from '@/types/history';

class FakeFile {
  content = '';
  async getFile() {
    return { text: async () => this.content };
  }
  async createWritable() {
    return {
      write: async (value: string) => { this.content = value; },
      close: async () => undefined,
      abort: async () => undefined,
    };
  }
}

class FakeDirectory {
  files = new Map<string, FakeFile>();
  directories = new Map<string, FakeDirectory>();
  name: string;
  constructor(name: string) { this.name = name; }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!options?.create) {
        const error = new Error('not found');
        error.name = 'NotFoundError';
        throw error;
      }
      this.files.set(name, new FakeFile());
    }
    return this.files.get(name)!;
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    if (!this.directories.has(name)) {
      if (!options?.create) {
        const error = new Error('not found');
        error.name = 'NotFoundError';
        throw error;
      }
      this.directories.set(name, new FakeDirectory(name));
    }
    return this.directories.get(name)!;
  }
  async removeEntry(name: string) {
    if (!this.directories.delete(name)) {
      const error = new Error('not found');
      error.name = 'NotFoundError';
      throw error;
    }
  }
}

const root = new FakeDirectory('root');
const fakeRepository = {
  readCommit: async (_resumeId: string, hash: string) => commits.find((commit) => commit.hash === hash) ?? null,
  readAvatar: async (_resumeId: string, hash: string) => avatars.find((avatar) => avatar.hash === hash) ?? null,
};

vi.mock('@/services/storage/StorageManager', () => ({
  storageManager: {
    getActiveFileSystemDirectoryHandle: () => root,
    getFileSystemDirectoryName: () => 'test-dir',
  },
}));

import { FileSystemHistoryMirror } from '../mirror';
import { storageManager } from '@/services/storage/StorageManager';

function refs(): ResumeRefs {
  return {
    schemaVersion: 1,
    resumeId: 'resume-1',
    head: 'hash-2',
    commits: [
      { hash: 'hash-2', contentHash: 'c2', parentHash: 'hash-1', message: '修改', author: '本机', createdAt: '2026-01-02T00:00:00.000Z', kind: 'manual', tags: [], stats: { additions: 1, deletions: 0, sections: ['个人信息'] }, bytes: 10 },
      { hash: 'hash-1', contentHash: 'c1', parentHash: null, message: '初始', author: '本机', createdAt: '2026-01-01T00:00:00.000Z', kind: 'initial', tags: ['基线'], stats: { additions: 1, deletions: 0, sections: ['个人信息'] }, bytes: 10 },
    ],
    tags: { '基线': 'hash-1' },
    totalBytes: 20,
    truncated: false,
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

let commits: ResumeCommit[] = [];
let avatars: StoredAvatar[] = [];

function commit(hash: string, parentHash: string | null): ResumeCommit {
  return {
    hash, contentHash: hash, parentHash, message: hash, author: '本机', createdAt: '2026-01-01T00:00:00.000Z',
    kind: 'manual', tags: [], stats: { additions: 1, deletions: 0, sections: [] }, bytes: 10,
    schemaVersion: 1, resumeId: 'resume-1',
    snapshot: { title: '简历', basic: {}, experiences: [], education: [], skills: [], projects: [], customBlocks: [], templateId: 'modern', theme: { color: '#000', fontFamily: 'sans', fontSize: 14, lineHeight: 1.5, moduleMargins: { top: 0, bottom: 0, left: 0, right: 0 }, pageMargins: 24, dateFormat: 'YYYY.MM', displayIcons: true }, sectionOrder: [], sectionTitles: {} } as any,
  };
}

beforeEach(() => {
  root.files.clear();
  root.directories.clear();
  localStorage.clear();
  commits = [commit('hash-1', null), commit('hash-2', 'hash-1')];
  avatars = [];
});

describe('本地目录镜像', () => {
  it('writes refs and commits incrementally, then reads them back', async () => {
    const mirror = new FileSystemHistoryMirror(fakeRepository as any);
    const state = refs();
    await mirror.sync('resume-1', state);
    await mirror.append('resume-1', state, commits[1]!);
    expect(mirror.isCurrent('resume-1', state)).toBe(true);

    const archive = await mirror.readArchive('resume-1');
    expect(archive?.head).toBe('hash-2');
    expect(archive?.commits).toHaveLength(2);
    expect(archive?.tags['基线']).toBe('hash-1');
  });

  it('syncs every referenced commit and avatar on demand', async () => {
    const mirror = new FileSystemHistoryMirror(fakeRepository as any);
    avatars = [{ hash: 'avatar-1', dataUrl: 'data:image/png;base64,AAAA', bytes: 30 }];
    commits[1] = { ...commits[1]!, avatarHash: 'avatar-1' };
    await mirror.sync('resume-1', refs());
    const archive = await mirror.readArchive('resume-1');
    expect(archive?.commits).toHaveLength(2);
    expect(archive?.avatars[0]?.hash).toBe('avatar-1');
  });

  it('removes the mirrored repository for a deleted resume', async () => {
    const mirror = new FileSystemHistoryMirror(fakeRepository as any);
    await mirror.append('resume-1', refs(), commits[1]!);
    await mirror.remove('resume-1');
    expect(await mirror.readArchive('resume-1')).toBeNull();
  });

  it('does nothing when the active storage is not a local directory', async () => {
    const mirror = new FileSystemHistoryMirror(fakeRepository as any);
    vi.spyOn(storageManager, 'getActiveFileSystemDirectoryHandle').mockReturnValueOnce(null);
    await expect(mirror.append('resume-1', refs(), commits[1]!)).resolves.toBeUndefined();
    expect(root.directories.size).toBe(0);
  });
});
