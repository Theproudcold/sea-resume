import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultResumeData } from '@/utils/resumeData';
import type { ResumeData } from '@/types/resume';
import { NothingToCommitError } from '@/types/history';
import { buildAvatarRecord, resumeContentHash, toResumeSnapshot } from '../hash';

const stores = {
  refs: new Map<string, any>(),
  commits: new Map<string, any>(),
  avatars: new Map<string, any>(),
};

function objectStore(name: keyof typeof stores) {
  return {
    get: async (key: string) => stores[name].get(key),
    put: async (value: any, key?: string) => { stores[name].set(key ?? value.id, value); },
    delete: async (key: string) => { stores[name].delete(key); },
    clear: async () => { stores[name].clear(); },
  };
}

const db = {
  get: async (name: keyof typeof stores, key: string) => stores[name].get(key),
  put: async (name: keyof typeof stores, value: any, key: string) => { stores[name].set(key, value); },
  delete: async (name: keyof typeof stores, key: string) => { stores[name].delete(key); },
  getAllFromIndex: async (_name: string, _index: string, resumeId: string) =>
    [...stores.commits.values()].filter((commit) => commit.resumeId === resumeId),
  transaction: () => ({
    objectStore,
    done: Promise.resolve(),
  }),
};

vi.mock('idb', () => ({
  openDB: vi.fn(async () => db),
}));

import { IndexedDbResumeHistoryRepository } from '../repository';

function resume(name = '张三'): ResumeData {
  const data = createDefaultResumeData();
  data.id = 'resume-1';
  data.basic.name = name;
  data.experiences = [{
    id: 'e1', company: 'Acme', position: '前端', startDate: '2022-01', endDate: 'present',
    description: '负责前端开发',
  }];
  return data;
}

async function append(repo: IndexedDbResumeHistoryRepository, data: ResumeData, message: string) {
  const { snapshot, avatar } = toResumeSnapshot(data);
  const record = avatar ? buildAvatarRecord(avatar) : undefined;
  return repo.append({
    resumeId: data.id,
    snapshot,
    contentHash: resumeContentHash(snapshot, record?.hash),
    message,
    kind: 'manual',
    ...(record ? { avatar: record } : {}),
  });
}

beforeEach(() => {
  Object.values(stores).forEach((store) => store.clear());
});

describe('IndexedDb 版本仓库', () => {
  it('appends an initial commit and links the parent commit', async () => {
    const repo = new IndexedDbResumeHistoryRepository();
    const first = await append(repo, resume(), '初始版本');
    expect(first.refs.head).toBe(first.commit.hash);
    expect(first.commit.parentHash).toBeNull();
    expect(first.commit.stats.additions).toBeGreaterThan(0);

    const changed = resume('李四');
    const second = await append(repo, changed, '修改姓名');
    expect(second.commit.parentHash).toBe(first.commit.hash);
    expect(second.refs.commits.map((commit) => commit.hash)).toEqual([second.commit.hash, first.commit.hash]);
    expect(second.commit.stats.sections).toContain('个人信息');
  });

  it('rejects an empty commit but allows identical content after the head moved', async () => {
    const repo = new IndexedDbResumeHistoryRepository();
    const first = await append(repo, resume(), '初始版本');
    await expect(append(repo, resume(), '没有变化')).rejects.toBeInstanceOf(NothingToCommitError);

    await append(repo, resume('李四'), '修改姓名');
    const restored = await append(repo, resume(), '恢复至初始内容');
    expect(restored.commit.contentHash).toBe(first.commit.contentHash);
    expect(restored.commit.hash).not.toBe(first.commit.hash);
    expect(restored.commit.parentHash).not.toBeNull();
  });

  it('keeps tags unique and pins tagged commits out of tag updates', async () => {
    const repo = new IndexedDbResumeHistoryRepository();
    const first = await append(repo, resume(), '初始版本');
    const tagged = await repo.updateTags('resume-1', first.commit.hash, ['投递 Acme']);
    expect(tagged.tags['投递 Acme']).toBe(first.commit.hash);
    expect((await repo.readCommit('resume-1', first.commit.hash))?.tags).toEqual(['投递 Acme']);

    const second = await append(repo, resume('李四'), '修改姓名');
    await expect(repo.updateTags('resume-1', second.commit.hash, ['投递 Acme'])).rejects.toThrow('已被其他版本使用');
  });

  it('exports and imports an archive under a new resume id without changing hashes', async () => {
    const repo = new IndexedDbResumeHistoryRepository();
    const first = await append(repo, resume(), '初始版本');
    const second = await append(repo, resume('李四'), '修改姓名');
    await repo.updateTags('resume-1', first.commit.hash, ['基线']);

    const archive = await repo.exportArchive('resume-1');
    expect(archive?.commits).toHaveLength(2);
    expect(archive?.tags['基线']).toBe(first.commit.hash);

    const refs = await repo.importArchive(archive!, 'resume-2');
    expect(refs.resumeId).toBe('resume-2');
    expect(refs.head).toBe(second.commit.hash);
    expect(refs.tags['基线']).toBe(first.commit.hash);
    const imported = await repo.readCommit('resume-2', first.commit.hash);
    expect(imported?.resumeId).toBe('resume-2');
    expect(imported?.snapshot.basic.name).toBe('张三');
    await expect(repo.importArchive(archive!, 'resume-2')).rejects.toThrow('已经有版本记录');
  });

  it('prunes oldest untagged commits but keeps HEAD and tagged versions', async () => {
    const repo = new IndexedDbResumeHistoryRepository();
    const first = await append(repo, resume('n-0'), '初始版本');
    await repo.updateTags('resume-1', first.commit.hash, ['基线']);
    for (let index = 1; index <= 205; index++) {
      await append(repo, resume(`n-${index}`), `修改 ${index}`);
    }
    const refs = await repo.readRefs('resume-1');
    expect(refs?.commits.length).toBeLessThanOrEqual(200);
    expect(refs?.truncated).toBe(true);
    expect(refs?.commits.some((commit) => commit.hash === first.commit.hash)).toBe(true);
    expect(refs?.tags['基线']).toBe(first.commit.hash);
    expect(refs?.commits[0]?.hash).toBe(refs?.head);
  });

  it('removes every commit and avatar of a resume', async () => {
    const repo = new IndexedDbResumeHistoryRepository();
    const data = resume();
    data.basic.avatar = 'data:image/png;base64,AAAA';
    await append(repo, data, '初始版本');
    expect(stores.avatars.size).toBeGreaterThan(0);
    await repo.remove('resume-1');
    expect(stores.refs.size).toBe(0);
    expect(stores.commits.size).toBe(0);
    expect(stores.avatars.size).toBe(0);
  });
});
