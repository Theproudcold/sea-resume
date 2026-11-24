import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AppendCommitInput,
  AppendCommitResult,
  ResumeCommit,
  ResumeCommitMeta,
  ResumeHistoryArchive,
  ResumeRefs,
  StoredAvatar,
} from '@/types/history';
import {
  HISTORY_STORAGE,
  HistoryTagError,
  HistoryUnavailableError,
  NothingToCommitError,
} from '@/types/history';
import { commitHash, estimateJsonBytes, snapshotToResumeData } from './hash';
import { diffStats } from './diff';

const DB_NAME = 'sea-resume-history';
const DB_VERSION = 1;
const REFS_STORE = 'refs';
const COMMITS_STORE = 'commits';
const AVATARS_STORE = 'avatars';

interface HistoryDB extends DBSchema {
  refs: { key: string; value: ResumeRefs };
  commits: {
    key: string;
    value: ResumeCommit;
    indexes: { 'by-resume': string };
  };
  avatars: { key: string; value: StoredAvatar };
}

const commitKey = (resumeId: string, hash: string): string => `${resumeId.length}:${resumeId}:${hash}`;
const avatarKey = (resumeId: string, hash: string): string => `${resumeId.length}:${resumeId}:${hash}`;

function emptyRefs(resumeId: string): ResumeRefs {
  return {
    schemaVersion: 1,
    resumeId,
    head: null,
    commits: [],
    tags: {},
    totalBytes: 0,
    truncated: false,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeMessage(message: string): string {
  const value = message.trim();
  if (!value) throw new Error('提交消息不能为空。');
  if (value.length > HISTORY_STORAGE.maxMessageLength) {
    throw new Error(`提交消息不能超过 ${HISTORY_STORAGE.maxMessageLength} 个字符。`);
  }
  return value;
}

function normalizeTags(tags: string[] | undefined): string[] {
  const result: string[] = [];
  for (const raw of tags ?? []) {
    const tag = raw.trim();
    if (!tag) continue;
    if (tag.length > HISTORY_STORAGE.maxTagLength) {
      throw new HistoryTagError(`标签不能超过 ${HISTORY_STORAGE.maxTagLength} 个字符。`);
    }
    if (tag === '__proto__' || tag === 'constructor' || tag === 'prototype') {
      throw new HistoryTagError('标签名称无效。');
    }
    if (!result.includes(tag)) result.push(tag);
  }
  return result;
}

function assertTagAvailable(refs: ResumeRefs, tags: string[], hash: string): void {
  for (const tag of tags) {
    const owner = refs.tags[tag];
    if (owner && owner !== hash) throw new HistoryTagError(`标签「${tag}」已被其他版本使用。`);
  }
}

function totalBytes(commits: ResumeCommitMeta[]): number {
  return commits.reduce((sum, commit) => sum + commit.bytes, 0);
}

function asHistoryError(error: unknown): Error {
  if (error instanceof NothingToCommitError || error instanceof HistoryTagError || error instanceof HistoryUnavailableError) return error;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new Error('版本历史空间不足。请清理旧版本或先导出备份后重试。');
  }
  return error instanceof Error ? error : new Error('版本历史操作失败。');
}

export interface HistoryRepository {
  readRefs(resumeId: string): Promise<ResumeRefs | null>;
  readCommit(resumeId: string, hash: string): Promise<ResumeCommit | null>;
  readAvatar(resumeId: string, hash: string): Promise<StoredAvatar | null>;
  append(input: AppendCommitInput): Promise<AppendCommitResult>;
  updateTags(resumeId: string, hash: string, tags: string[]): Promise<ResumeRefs>;
  remove(resumeId: string): Promise<void>;
  clear(): Promise<void>;
  exportArchive(resumeId: string, options?: { limit?: number }): Promise<ResumeHistoryArchive | null>;
  importArchive(archive: ResumeHistoryArchive, resumeId: string): Promise<ResumeRefs>;
}

/**
 * 版本历史仓库：IndexedDB 是主存储，保证原子追加与裁剪。
 *
 * 不实现 IStorageAdapter：历史是保存成功后的旁路写入，不能进入 ResumeData / ResumeMeta，
 * 也不能让本地目录的权限、超时和回滚逻辑影响简历正文保存。
 */
export class IndexedDbResumeHistoryRepository implements HistoryRepository {
  private dbPromise: Promise<IDBPDatabase<HistoryDB>> | null = null;

  private async db(): Promise<IDBPDatabase<HistoryDB>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<HistoryDB>(DB_NAME, DB_VERSION, {
        upgrade(database) {
          if (!database.objectStoreNames.contains(REFS_STORE)) database.createObjectStore(REFS_STORE);
          if (!database.objectStoreNames.contains(COMMITS_STORE)) {
            const commits = database.createObjectStore(COMMITS_STORE);
            commits.createIndex('by-resume', 'resumeId');
          }
          if (!database.objectStoreNames.contains(AVATARS_STORE)) database.createObjectStore(AVATARS_STORE);
        },
      }).catch((error: unknown) => {
        this.dbPromise = null;
        throw new HistoryUnavailableError(
          `版本历史不可用：${error instanceof Error ? error.message : '浏览器拒绝打开本地版本库'}。编辑与保存不受影响。`,
        );
      });
    }
    return this.dbPromise;
  }

  async readRefs(resumeId: string): Promise<ResumeRefs | null> {
    try {
      const db = await this.db();
      return (await db.get(REFS_STORE, resumeId)) ?? null;
    } catch (error) {
      throw asHistoryError(error);
    }
  }

  async readCommit(resumeId: string, hash: string): Promise<ResumeCommit | null> {
    try {
      const db = await this.db();
      return (await db.get(COMMITS_STORE, commitKey(resumeId, hash))) ?? null;
    } catch (error) {
      throw asHistoryError(error);
    }
  }

  async readAvatar(resumeId: string, hash: string): Promise<StoredAvatar | null> {
    try {
      const db = await this.db();
      return (await db.get(AVATARS_STORE, avatarKey(resumeId, hash))) ?? null;
    } catch (error) {
      throw asHistoryError(error);
    }
  }

  async append(input: AppendCommitInput): Promise<AppendCommitResult> {
    const message = normalizeMessage(input.message);
    const tags = normalizeTags(input.tags);
    try {
      const db = await this.db();
      const tx = db.transaction([REFS_STORE, COMMITS_STORE, AVATARS_STORE], 'readwrite');
      const refsStore = tx.objectStore(REFS_STORE);
      const commitsStore = tx.objectStore(COMMITS_STORE);
      const avatarsStore = tx.objectStore(AVATARS_STORE);

      const refs = (await refsStore.get(input.resumeId)) ?? emptyRefs(input.resumeId);
      const headCommit = refs.head ? await commitsStore.get(commitKey(input.resumeId, refs.head)) : undefined;
      if (refs.head && !headCommit) throw new Error('版本库索引损坏：HEAD 指向的提交不存在。');
      if (headCommit?.contentHash === input.contentHash) throw new NothingToCommitError();
      assertTagAvailable(refs, tags, 'new');

      const createdAt = new Date().toISOString();
      const hash = commitHash({
        parentHash: refs.head,
        contentHash: input.contentHash,
        createdAt,
        message,
      });
      const headData = headCommit ? snapshotToResumeData(headCommit.snapshot) : null;
      const afterData = snapshotToResumeData(input.snapshot);
      const meta: ResumeCommitMeta = {
        hash,
        contentHash: input.contentHash,
        parentHash: refs.head,
        message,
        author: input.author?.trim() || HISTORY_STORAGE.author,
        createdAt,
        kind: input.kind,
        tags,
        ...(input.avatar ? { avatarHash: input.avatar.hash } : {}),
        stats: diffStats(headData, afterData),
        bytes: estimateJsonBytes({ snapshot: input.snapshot, message }),
      };
      const commit: ResumeCommit = { ...meta, schemaVersion: 1, resumeId: input.resumeId, snapshot: input.snapshot };

      await commitsStore.put(commit, commitKey(input.resumeId, hash));
      if (input.avatar) {
        const key = avatarKey(input.resumeId, input.avatar.hash);
        if (!(await avatarsStore.get(key))) await avatarsStore.put(input.avatar, key);
      }

      refs.commits = [meta, ...refs.commits];
      refs.head = hash;
      tags.forEach((tag) => { refs.tags[tag] = hash; });
      refs.totalBytes = totalBytes(refs.commits);
      refs.updatedAt = createdAt;

      const deletedAvatars = new Set<string>();
      let pruned = false;
      let candidateIndex = refs.commits.length - 1;
      while (
        refs.commits.length > 1
        && (refs.commits.length > HISTORY_STORAGE.maxCommits || refs.totalBytes > HISTORY_STORAGE.maxBytes)
      ) {
        if (candidateIndex < 0) break;
        const candidate = refs.commits[candidateIndex]!;
        // HEAD 与打了标签的版本永久保留；跳过它们继续找更旧的未标记提交。
        if (candidate.hash === refs.head || candidate.tags.length) {
          candidateIndex--;
          continue;
        }
        refs.commits.splice(candidateIndex, 1);
        refs.truncated = true;
        pruned = true;
        await commitsStore.delete(commitKey(input.resumeId, candidate.hash));
        if (candidate.avatarHash && !refs.commits.some((entry) => entry.avatarHash === candidate.avatarHash)) {
          deletedAvatars.add(candidate.avatarHash);
        }
        refs.totalBytes = totalBytes(refs.commits);
        candidateIndex = refs.commits.length - 1;
      }
      for (const avatarHash of deletedAvatars) {
        await avatarsStore.delete(avatarKey(input.resumeId, avatarHash));
      }

      await refsStore.put(refs, input.resumeId);
      await tx.done;
      return { commit, refs, pruned };
    } catch (error) {
      throw asHistoryError(error);
    }
  }

  async updateTags(resumeId: string, hash: string, tags: string[]): Promise<ResumeRefs> {
    const normalized = normalizeTags(tags);
    try {
      const db = await this.db();
      const tx = db.transaction([REFS_STORE, COMMITS_STORE], 'readwrite');
      const refsStore = tx.objectStore(REFS_STORE);
      const commitsStore = tx.objectStore(COMMITS_STORE);
      const refs = await refsStore.get(resumeId);
      if (!refs) throw new Error('这份简历还没有版本记录。');
      const commit = await commitsStore.get(commitKey(resumeId, hash));
      if (!commit) throw new Error('找不到要打标签的版本。');
      assertTagAvailable(refs, normalized, hash);

      for (const [tag, owner] of Object.entries(refs.tags)) {
        if (owner === hash && !normalized.includes(tag)) delete refs.tags[tag];
      }
      normalized.forEach((tag) => { refs.tags[tag] = hash; });
      commit.tags = normalized;
      const meta = refs.commits.find((entry) => entry.hash === hash);
      if (meta) meta.tags = [...normalized];
      await commitsStore.put(commit, commitKey(resumeId, hash));
      refs.updatedAt = new Date().toISOString();
      await refsStore.put(refs, resumeId);
      await tx.done;
      return refs;
    } catch (error) {
      throw asHistoryError(error);
    }
  }

  async remove(resumeId: string): Promise<void> {
    try {
      const db = await this.db();
      const commits = await db.getAllFromIndex(COMMITS_STORE, 'by-resume', resumeId);
      const tx = db.transaction([REFS_STORE, COMMITS_STORE, AVATARS_STORE], 'readwrite');
      const refsStore = tx.objectStore(REFS_STORE);
      const commitsStore = tx.objectStore(COMMITS_STORE);
      const avatarsStore = tx.objectStore(AVATARS_STORE);
      for (const commit of commits) {
        await commitsStore.delete(commitKey(resumeId, commit.hash));
        if (commit.avatarHash) await avatarsStore.delete(avatarKey(resumeId, commit.avatarHash));
      }
      await refsStore.delete(resumeId);
      await tx.done;
    } catch (error) {
      throw asHistoryError(error);
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.db();
      const tx = db.transaction([REFS_STORE, COMMITS_STORE, AVATARS_STORE], 'readwrite');
      await tx.objectStore(REFS_STORE).clear();
      await tx.objectStore(COMMITS_STORE).clear();
      await tx.objectStore(AVATARS_STORE).clear();
      await tx.done;
    } catch (error) {
      throw asHistoryError(error);
    }
  }

  async exportArchive(resumeId: string, options: { limit?: number } = {}): Promise<ResumeHistoryArchive | null> {
    try {
      const db = await this.db();
      const refs = await db.get(REFS_STORE, resumeId);
      if (!refs) return null;
      const limit = Math.max(1, Math.min(options.limit ?? HISTORY_STORAGE.maxArchiveCommits, HISTORY_STORAGE.maxCommits));
      const keep = new Set<string>();
      refs.commits.slice(0, limit).forEach((commit) => keep.add(commit.hash));
      Object.values(refs.tags).forEach((hash) => keep.add(hash));
      if (refs.head) keep.add(refs.head);
      const selected = refs.commits.filter((commit) => keep.has(commit.hash));
      const commits: ResumeCommit[] = [];
      const avatars = new Map<string, StoredAvatar>();
      for (const meta of selected) {
        const commit = await db.get(COMMITS_STORE, commitKey(resumeId, meta.hash));
        if (!commit) continue;
        commits.push(commit);
        if (commit.avatarHash) {
          const avatar = await db.get(AVATARS_STORE, avatarKey(resumeId, commit.avatarHash));
          if (avatar) avatars.set(avatar.hash, avatar);
        }
      }
      return {
        format: 'sea-resume-history',
        version: 1,
        resumeId,
        head: refs.head,
        commits,
        avatars: [...avatars.values()],
        tags: { ...refs.tags },
        truncated: refs.truncated || selected.length < refs.commits.length,
        exportedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw asHistoryError(error);
    }
  }

  async importArchive(archive: ResumeHistoryArchive, resumeId: string): Promise<ResumeRefs> {
    if (!archive || archive.format !== 'sea-resume-history' || archive.version !== 1) {
      throw new Error('版本历史归档格式无效。');
    }
    if (!resumeId) throw new Error('缺少目标简历 ID。');
    if (archive.commits.length > HISTORY_STORAGE.maxCommits) {
      throw new Error(`版本历史归档超过 ${HISTORY_STORAGE.maxCommits} 条提交。`);
    }
    if (archive.head && !archive.commits.some((commit) => commit.hash === archive.head)) {
      throw new Error('版本历史归档缺少 HEAD 提交。');
    }
    for (const commit of archive.commits) {
      if (commit.schemaVersion !== 1 || !commit.snapshot) throw new Error('版本历史归档包含无效提交。');
      if (!Number.isFinite(commit.bytes) || commit.bytes < 0) throw new Error('版本历史归档包含无效体积。');
      if (!commit.stats || !Array.isArray(commit.stats.sections)) throw new Error('版本历史归档包含无效统计。');
    }
    try {
      const db = await this.db();
      const existing = await db.get(REFS_STORE, resumeId);
      if (existing) throw new Error('这份简历已经有版本记录，未覆盖。');
      const tx = db.transaction([REFS_STORE, COMMITS_STORE, AVATARS_STORE], 'readwrite');
      const refsStore = tx.objectStore(REFS_STORE);
      const commitsStore = tx.objectStore(COMMITS_STORE);
      const avatarsStore = tx.objectStore(AVATARS_STORE);
      for (const avatar of archive.avatars) {
        await avatarsStore.put(avatar, avatarKey(resumeId, avatar.hash));
      }
      for (const commit of archive.commits) {
        await commitsStore.put({ ...commit, resumeId }, commitKey(resumeId, commit.hash));
      }
      const refs: ResumeRefs = {
        schemaVersion: 1,
        resumeId,
        head: archive.head,
        commits: archive.commits.map((commit) => {
          const { snapshot: _snapshot, schemaVersion: _version, resumeId: _resumeId, ...meta } = commit;
          return meta;
        }),
        tags: { ...archive.tags },
        totalBytes: archive.commits.reduce((sum, commit) => sum + commit.bytes, 0),
        truncated: archive.truncated,
        updatedAt: new Date().toISOString(),
      };
      await refsStore.put(refs, resumeId);
      await tx.done;
      return refs;
    } catch (error) {
      throw asHistoryError(error);
    }
  }
}

export const resumeHistoryRepository = new IndexedDbResumeHistoryRepository();
