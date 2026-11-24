import type { BasicInfo, ResumeData } from './resume';

/**
 * 版本历史的提交类型。
 *
 * `initial` 只出现在一份简历的第一个版本；`restore` 表示用户从旧版本恢复，
 * 它不是“回到过去”，而是把旧内容写回工作区后新增的一条提交。
 */
export type ResumeCommitKind = 'initial' | 'manual' | 'auto' | 'restore' | 'import' | 'ai';

export interface CommitStats {
  additions: number;
  deletions: number;
  /** 变化涉及的章节名，用于版本列表摘要。 */
  sections: string[];
}

/**
 * 简历正文快照。
 *
 * 不包含 `id` / `createdAt` / `updatedAt`：这些字段会随保存、复制、恢复变化，
 * 放进快照会让“内容没变”也被判定成新版本。头像单独按内容寻址存放，避免每个
 * 版本都复制一份 base64 图片。
 */
export type ResumeSnapshot = Omit<ResumeData, 'id' | 'createdAt' | 'updatedAt' | 'basic'> & {
  basic: Omit<BasicInfo, 'avatar'>;
};

export interface ResumeCommitMeta {
  /** 提交 ID：由父提交、内容哈希、时间和消息派生；与内容哈希分开，允许恢复出与旧版本相同的内容。 */
  hash: string;
  /** 正文内容哈希，用于判断工作区是否有未提交修改。 */
  contentHash: string;
  parentHash: string | null;
  message: string;
  author: string;
  createdAt: string;
  kind: ResumeCommitKind;
  tags: string[];
  avatarHash?: string;
  stats: CommitStats;
  bytes: number;
}

export interface ResumeCommit extends ResumeCommitMeta {
  schemaVersion: 1;
  resumeId: string;
  snapshot: ResumeSnapshot;
}

export interface ResumeRefs {
  schemaVersion: 1;
  resumeId: string;
  head: string | null;
  /** 新 → 旧，按追加顺序，不按时间排序。 */
  commits: ResumeCommitMeta[];
  /** 标签名 → 提交 hash。 */
  tags: Record<string, string>;
  totalBytes: number;
  /** 是否因为保留策略删除过更早的提交。 */
  truncated: boolean;
  updatedAt: string;
}

export interface StoredAvatar {
  hash: string;
  dataUrl: string;
  bytes: number;
}

/** 单份简历的可导出历史归档，用于全量备份与本地目录镜像。 */
export interface ResumeHistoryArchive {
  format: 'sea-resume-history';
  version: 1;
  resumeId: string;
  head: string | null;
  commits: ResumeCommit[];
  avatars: StoredAvatar[];
  tags: Record<string, string>;
  truncated: boolean;
  exportedAt: string;
}

export interface AppendCommitInput {
  resumeId: string;
  snapshot: ResumeSnapshot;
  contentHash: string;
  message: string;
  author?: string;
  kind: ResumeCommitKind;
  tags?: string[];
  avatar?: StoredAvatar;
}

export interface AppendCommitResult {
  commit: ResumeCommit;
  refs: ResumeRefs;
  /** 本次追加是否触发了保留策略裁剪（镜像需要整体重建）。 */
  pruned: boolean;
}

export const HISTORY_STORAGE = {
  maxCommits: 200,
  maxBytes: 30 * 1024 * 1024,
  maxArchiveCommits: 50,
  maxMessageLength: 120,
  maxTagLength: 32,
  author: '本机',
} as const;

export class NothingToCommitError extends Error {
  constructor() {
    super('当前内容与最新版本一致，没有可提交的更改。');
    this.name = 'NothingToCommitError';
  }
}

export class HistoryUnavailableError extends Error {
  constructor(message = '版本历史不可用：浏览器无法打开本地版本库。') {
    super(message);
    this.name = 'HistoryUnavailableError';
  }
}

export class HistoryTagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoryTagError';
  }
}
