import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createDefaultResumeData } from '@/utils/resumeData';

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
  transaction: () => ({ objectStore, done: Promise.resolve() }),
};

vi.mock('idb', () => ({ openDB: vi.fn(async () => db) }));

import { useResumeStore } from '@/stores/resume';
import { useHistoryStore } from '@/stores/history';

function resume() {
  const data = createDefaultResumeData();
  data.id = 'resume-1';
  data.basic.name = '张三';
  return data;
}

beforeEach(() => {
  Object.values(stores).forEach((store) => store.clear());
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('版本历史 store', () => {
  it('creates an initial commit on first open and tracks uncommitted changes', async () => {
    const resumeStore = useResumeStore();
    resumeStore.data = resume();
    const history = useHistoryStore();

    await history.open('resume-1');
    expect(history.commits).toHaveLength(1);
    expect(history.headCommit?.message).toBe('初始版本');
    expect(history.dirty).toBe(false);

    resumeStore.data.basic.name = '李四';
    await history.refreshDirty();
    expect(history.dirty).toBe(true);

    await history.commit({ message: '修改姓名', kind: 'manual' });
    expect(history.commits).toHaveLength(2);
    expect(history.dirty).toBe(false);
    expect(history.headCommit?.message).toBe('修改姓名');
    expect(history.diff?.hunks.some((hunk) => hunk.label.includes('姓名'))).toBe(true);
  });

  it('restores an old version by appending a new commit and keeps all history', async () => {
    const resumeStore = useResumeStore();
    resumeStore.data = resume();
    const history = useHistoryStore();
    await history.open('resume-1');
    const initialHash = history.headHash!;
    const initialData = JSON.parse(JSON.stringify(resumeStore.data));

    resumeStore.data.basic.name = '李四';
    await history.commit({ message: '修改姓名', kind: 'manual' });
    expect(resumeStore.data.basic.name).toBe('李四');

    await history.restore(initialHash);
    expect(resumeStore.data.basic.name).toBe('张三');
    expect(history.commits).toHaveLength(3);
    expect(history.headCommit?.kind).toBe('restore');
    expect(history.headCommit?.message).toContain(initialHash.slice(0, 7));
    expect(history.commits.some((commit) => commit.hash === initialHash)).toBe(true);
    expect(history.dirty).toBe(false);
    expect(initialData.id).toBe(resumeStore.data.id);
  });

  it('saves uncommitted work before restoring and keeps tags', async () => {
    const resumeStore = useResumeStore();
    resumeStore.data = resume();
    const history = useHistoryStore();
    await history.open('resume-1');
    const initialHash = history.headHash!;

    resumeStore.data.basic.name = '王五';
    await history.setTags(initialHash, ['基线']);
    await history.restore(initialHash);

    expect(history.commits.map((commit) => commit.message)).toEqual(expect.arrayContaining(['恢复前自动保存']));
    expect(history.commits.some((commit) => commit.tags.includes('基线'))).toBe(true);
    expect(history.refs?.tags['基线']).toBe(initialHash);
  });

  it('records a checkpoint only when the content changed', async () => {
    const resumeStore = useResumeStore();
    resumeStore.data = resume();
    const history = useHistoryStore();
    await history.open('resume-1');
    await history.checkpoint('auto', '没有变化');
    expect(history.commits).toHaveLength(1);
    resumeStore.data.basic.name = '李四';
    await history.checkpoint('auto', '离开编辑器时自动保存');
    expect(history.commits).toHaveLength(2);
    expect(history.headCommit?.kind).toBe('auto');
  });

  it('does not commit unchanged content', async () => {
    const resumeStore = useResumeStore();
    resumeStore.data = resume();
    const history = useHistoryStore();
    await history.open('resume-1');
    await expect(history.commit({ message: '空提交', kind: 'manual' })).rejects.toThrow('没有可提交的更改');
    expect(history.commits).toHaveLength(1);
  });
});
