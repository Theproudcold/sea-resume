import { defineStore } from 'pinia';
import type { ResumeData } from '@/types/resume';
import type {
  AppendCommitResult,
  ResumeCommit,
  ResumeCommitKind,
  ResumeCommitMeta,
  ResumeRefs,
} from '@/types/history';
import { NothingToCommitError } from '@/types/history';
import { useResumeStore } from '@/stores/resume';
import { resumeHistoryRepository } from '@/services/history/repository';
import {
  commitResume,
  currentContentHash,
  loadHistoryFromMirror,
  readHistoryAvatar,
  syncHistoryMirror,
} from '@/services/history/service';
import { fileSystemHistoryMirror } from '@/services/history/mirror';
import { storageManager } from '@/services/storage/StorageManager';
import { buildCommitDiff, suggestCommitMessage, type CommitDiff } from '@/services/history/diff';
import {
  materializeSnapshot,
  shortHash,
  snapshotToResumeData,
} from '@/services/history/hash';
import { describeError } from '@/utils/globalErrorReporting';
import { sanitizeResumeDataContent } from '@/utils/sanitizeResumeData';

let dirtyTimer: ReturnType<typeof setTimeout> | null = null;
let selectionToken = 0;
let openGeneration = 0;

function cloneRefs(refs: ResumeRefs): ResumeRefs {
  return {
    ...refs,
    commits: refs.commits.map((commit) => ({ ...commit, tags: [...commit.tags], stats: { ...commit.stats, sections: [...commit.stats.sections] } })),
    tags: { ...refs.tags },
  };
}

export const useHistoryStore = defineStore('history', {
  state: () => ({
    resumeId: '',
    refs: null as ResumeRefs | null,
    loading: false,
    committing: false,
    restoring: false,
    error: '',
    mirrorError: '',
    available: true,
    dirty: false,
    selectedHash: null as string | null,
    detail: null as ResumeCommit | null,
    diff: null as CommitDiff | null,
    diffLoading: false,
    parentMissing: false,
  }),

  getters: {
    commits: (state): ResumeCommitMeta[] => state.refs?.commits ?? [],
    headHash: (state): string | null => state.refs?.head ?? null,
    headCommit: (state): ResumeCommitMeta | null => state.refs?.commits[0] ?? null,
    hasHistory: (state): boolean => (state.refs?.commits.length ?? 0) > 0,
    selectedCommit: (state): ResumeCommitMeta | null => (
      state.selectedHash
        ? state.refs?.commits.find((commit) => commit.hash === state.selectedHash) ?? null
        : state.refs?.commits[0] ?? null
    ),
    isWorkingTreeSelected: (state): boolean => state.selectedHash === null,
  },

  actions: {
    async open(resumeId: string): Promise<void> {
      if (!resumeId) return;
      this.close();
      const token = ++openGeneration;
      this.resumeId = resumeId;
      this.loading = true;
      this.available = true;
      this.error = '';
      try {
        let refs = await resumeHistoryRepository.readRefs(resumeId);
        if (!refs) {
          refs = await loadHistoryFromMirror(resumeId);
        }
        const resumeStore = useResumeStore();
        if (!refs && resumeStore.data.id === resumeId) {
          await resumeStore.flushSave();
          if (token !== openGeneration) return;
          await commitResume(resumeStore.data, { message: '初始版本', kind: 'initial' });
          refs = await resumeHistoryRepository.readRefs(resumeId);
        }
        if (token !== openGeneration || this.resumeId !== resumeId) return;
        this.refs = refs ? cloneRefs(refs) : null;
        this.dirty = await this.computeDirty();
        if (refs?.head) await this.select(refs.head);
        else await this.select(null);
        if (refs && storageManager.getActiveFileSystemDirectoryHandle()
          && !fileSystemHistoryMirror.isCurrent(resumeId, refs)) {
          void this.syncMirror();
        }
      } catch (error) {
        if (token === openGeneration) {
          this.available = false;
          this.error = describeError(error);
        }
      } finally {
        if (token === openGeneration && this.resumeId === resumeId) this.loading = false;
      }
    },

    async refresh(): Promise<void> {
      if (!this.resumeId) return;
      try {
        const refs = await resumeHistoryRepository.readRefs(this.resumeId);
        this.refs = refs ? cloneRefs(refs) : null;
        this.dirty = await this.computeDirty();
      } catch (error) {
        this.error = describeError(error);
        this.available = false;
      }
    },

    async computeDirty(): Promise<boolean> {
      const resumeStore = useResumeStore();
      if (!this.refs || resumeStore.data.id !== this.resumeId) return true;
      const head = this.refs.commits[0];
      if (!head) return true;
      return currentContentHash(resumeStore.data) !== head.contentHash;
    },

    scheduleDirtyCheck(): void {
      if (dirtyTimer) clearTimeout(dirtyTimer);
      dirtyTimer = setTimeout(() => {
        dirtyTimer = null;
        void this.refreshDirty();
      }, 900);
    },

    async refreshDirty(): Promise<void> {
      if (!this.resumeId || this.loading) return;
      this.dirty = await this.computeDirty();
    },

    async suggestMessage(): Promise<string> {
      if (!this.refs?.head) return '初始版本';
      const head = await resumeHistoryRepository.readCommit(this.resumeId, this.refs.head);
      if (!head) return '更新简历';
      const resumeStore = useResumeStore();
      const diff = buildCommitDiff(
        { data: snapshotToResumeData(head.snapshot), avatarHash: head.avatarHash },
        { data: resumeStore.data },
      );
      return suggestCommitMessage(diff);
    },

    async commit(input: {
      message: string;
      kind: ResumeCommitKind;
      tags?: string[];
    }): Promise<AppendCommitResult> {
      if (this.committing) throw new Error('正在提交版本，请稍后。');
      if (!this.resumeId) throw new Error('版本库尚未加载。');
      this.committing = true;
      this.error = '';
      try {
        const resumeStore = useResumeStore();
        await resumeStore.flushSave();
        if (resumeStore.data.id !== this.resumeId) throw new Error('当前简历已经切换，请重新打开版本历史。');
        const outcome = await commitResume(resumeStore.data, {
          message: input.message,
          kind: input.kind,
          ...(input.tags?.length ? { tags: input.tags } : {}),
        });
        this.refs = cloneRefs(outcome.refs);
        this.dirty = false;
        this.mirrorError = outcome.mirrorError ?? '';
        this.selectedHash = outcome.commit.hash;
        await this.select(outcome.commit.hash);
        return { commit: outcome.commit, refs: outcome.refs, pruned: outcome.pruned };
      } catch (error) {
        if (error instanceof NothingToCommitError) this.dirty = false;
        this.error = describeError(error);
        throw error;
      } finally {
        this.committing = false;
      }
    },

    /**
     * 自动检查点：只在内容确实变化时提交，失败不打断编辑。
     * 覆盖离开编辑器、10 分钟定时、页面隐藏/关闭、AI 应用、重置前、恢复前。
     */
    async checkpoint(kind: ResumeCommitKind, message: string): Promise<void> {
      if (!this.resumeId) return;
      try {
        await this.refreshDirty();
        if (!this.dirty) return;
        await this.commit({ message, kind });
      } catch (error) {
        if (!(error instanceof NothingToCommitError)) {
          console.warn(`版本检查点（${message}）失败:`, error);
        }
      }
    },

    async select(hash: string | null): Promise<void> {
      const token = ++selectionToken;
      this.selectedHash = hash;
      this.detail = null;
      this.diff = null;
      this.parentMissing = false;
      if (!this.resumeId) return;
      this.diffLoading = true;
      try {
        const resumeStore = useResumeStore();
        if (!hash) {
          const head = this.refs?.head
            ? await resumeHistoryRepository.readCommit(this.resumeId, this.refs.head)
            : null;
          if (token !== selectionToken) return;
          this.diff = buildCommitDiff(
            head ? { data: snapshotToResumeData(head.snapshot), avatarHash: head.avatarHash } : null,
            { data: resumeStore.data },
            { fromHash: head?.hash ?? null, toHash: null },
          );
          return;
        }
        const commit = await resumeHistoryRepository.readCommit(this.resumeId, hash);
        if (token !== selectionToken) return;
        if (!commit) throw new Error('找不到这个版本。');
        const parent = commit.parentHash
          ? await resumeHistoryRepository.readCommit(this.resumeId, commit.parentHash)
          : null;
        if (token !== selectionToken) return;
        this.detail = commit;
        this.parentMissing = !!commit.parentHash && !parent;
        this.diff = buildCommitDiff(
          parent ? { data: snapshotToResumeData(parent.snapshot), avatarHash: parent.avatarHash } : null,
          { data: snapshotToResumeData(commit.snapshot), avatarHash: commit.avatarHash },
          { fromHash: parent?.hash ?? null, toHash: commit.hash },
        );
      } catch (error) {
        if (token === selectionToken) this.error = describeError(error);
      } finally {
        if (token === selectionToken) this.diffLoading = false;
      }
    },

    async restore(hash: string): Promise<void> {
      if (this.restoring) return;
      if (!this.resumeId) throw new Error('版本库尚未加载。');
      this.restoring = true;
      this.error = '';
      try {
        const resumeStore = useResumeStore();
        await resumeStore.flushSave();
        await this.refreshDirty();
        if (this.dirty) {
          await this.commit({ message: '恢复前自动保存', kind: 'auto' });
        }
        const commit = await resumeHistoryRepository.readCommit(this.resumeId, hash);
        if (!commit) throw new Error('找不到要恢复的版本。');
        if (commit.hash === this.refs?.head && !this.dirty) {
          throw new Error('当前已经是这个版本，无需恢复。');
        }
        const avatar = await readHistoryAvatar(this.resumeId, commit.avatarHash);
        const hasAvatarBlob = !!avatar;
        const data = sanitizeResumeDataContent(materializeSnapshot(
          commit.snapshot,
          resumeStore.data,
          commit.avatarHash ? (hasAvatarBlob ? avatar!.dataUrl : undefined) : null,
        ));
        await resumeStore.importData(data);
        const outcome = await commitResume(resumeStore.data, {
          message: `恢复至 ${shortHash(hash)}`,
          kind: 'restore',
        });
        this.refs = cloneRefs(outcome.refs);
        this.dirty = false;
        this.mirrorError = outcome.mirrorError ?? '';
        if (commit.avatarHash && !hasAvatarBlob) {
          this.mirrorError = this.mirrorError || '头像图片未能从版本库读取，恢复时保留了当前头像。';
        }
        this.selectedHash = outcome.commit.hash;
        await this.select(outcome.commit.hash);
      } catch (error) {
        this.error = describeError(error);
        this.dirty = await this.computeDirty().catch(() => true);
        throw error;
      } finally {
        this.restoring = false;
      }
    },

    async setTags(hash: string, tags: string[]): Promise<void> {
      if (!this.resumeId) return;
      this.refs = cloneRefs(await resumeHistoryRepository.updateTags(this.resumeId, hash, tags));
      if (this.detail?.hash === hash) {
        this.detail.tags = [...tags];
        this.detail = { ...this.detail };
      }
      const updated = await resumeHistoryRepository.readCommit(this.resumeId, hash);
      if (updated) {
        try {
          await fileSystemHistoryMirror.updateCommit(this.resumeId, this.refs, updated);
        } catch (error) {
          this.mirrorError = describeError(error);
        }
      }
      if (this.selectedHash === hash) await this.select(hash);
    },

    async syncMirror(): Promise<void> {
      if (!this.refs || !this.resumeId) return;
      if (!this.refs.commits.length) return;
      try {
        await syncHistoryMirror(this.resumeId, this.refs);
        this.mirrorError = '';
      } catch (error) {
        this.mirrorError = `版本历史已保存在浏览器，但镜像到本地目录失败：${describeError(error)}`;
      }
    },

    close(): void {
      openGeneration++;
      selectionToken++;
      if (dirtyTimer) {
        clearTimeout(dirtyTimer);
        dirtyTimer = null;
      }
      this.resumeId = '';
      this.refs = null;
      this.loading = false;
      this.committing = false;
      this.restoring = false;
      this.error = '';
      this.mirrorError = '';
      this.available = true;
      this.dirty = false;
      this.selectedHash = null;
      this.detail = null;
      this.diff = null;
      this.parentMissing = false;
    },
  },
});

export type { CommitDiff };
