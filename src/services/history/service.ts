import type { ResumeData } from '@/types/resume';
import type {
  AppendCommitInput,
  AppendCommitResult,
  ResumeCommit,
  ResumeCommitKind,
  ResumeRefs,
  StoredAvatar,
} from '@/types/history';
import { NothingToCommitError } from '@/types/history';
import {
  buildAvatarRecord,
  resumeContentHash,
  toResumeSnapshot,
} from './hash';
import { resumeHistoryRepository, type HistoryRepository } from './repository';
import { fileSystemHistoryMirror, historyMirrorErrorMessage } from './mirror';

export interface CommitOptions {
  message: string;
  kind: ResumeCommitKind;
  tags?: string[];
  author?: string;
}

export interface CommitOutcome extends AppendCommitResult {
  mirrorError: string | null;
}

export interface HistoryDependencies {
  repository?: HistoryRepository;
  mirror?: typeof fileSystemHistoryMirror;
}

export function buildCommitInput(data: ResumeData, options: CommitOptions): AppendCommitInput {
  const { snapshot, avatar } = toResumeSnapshot(data);
  const avatarRecord = avatar ? buildAvatarRecord(avatar) : undefined;
  return {
    resumeId: data.id,
    snapshot,
    contentHash: resumeContentHash(snapshot, avatarRecord?.hash),
    message: options.message,
    kind: options.kind,
    ...(options.tags ? { tags: options.tags } : {}),
    ...(options.author ? { author: options.author } : {}),
    ...(avatarRecord ? { avatar: avatarRecord } : {}),
  };
}

/** 计算当前工作区的内容哈希，用于判断“未提交更改”。 */
export function currentContentHash(data: ResumeData): string {
  const { snapshot, avatar } = toResumeSnapshot(data);
  return resumeContentHash(snapshot, avatar ? buildAvatarRecord(avatar).hash : undefined);
}

/**
 * 追加一条版本提交。调用方负责先 `flushSave()`：这里不读取存储，只接收已落盘的内存数据。
 * 镜像失败只返回提示，不抛出——简历已经保存，历史也已经写进 IndexedDB。
 */
export async function commitResume(
  data: ResumeData,
  options: CommitOptions,
  dependencies: HistoryDependencies = {},
): Promise<CommitOutcome> {
  const repository = dependencies.repository ?? resumeHistoryRepository;
  const mirror = dependencies.mirror ?? fileSystemHistoryMirror;
  const input = buildCommitInput(data, options);
  const result = await repository.append(input);
  let mirrorError: string | null = null;
  const avatar = input.avatar;
  try {
    if (result.pruned) await mirror.resync(data.id, result.refs);
    else await mirror.append(data.id, result.refs, result.commit as ResumeCommit, avatar);
  } catch (error) {
    mirrorError = historyMirrorErrorMessage(error);
    console.warn('版本历史镜像失败:', error);
  }
  return { ...result, mirrorError };
}

/** 新建/复制/导入时建立基线；失败不能影响简历创建。 */
export async function recordInitialResumeCommit(
  data: ResumeData,
  message: string,
  kind: ResumeCommitKind = 'initial',
): Promise<CommitOutcome | null> {
  try {
    return await commitResume(data, { message, kind });
  } catch (error) {
    if (error instanceof NothingToCommitError) return null;
    console.warn('创建初始版本失败:', error);
    return null;
  }
}

export async function readHistoryAvatar(resumeId: string, hash: string | undefined): Promise<StoredAvatar | null> {
  return hash ? resumeHistoryRepository.readAvatar(resumeId, hash) : null;
}

export async function removeResumeHistory(resumeId: string): Promise<void> {
  try {
    await resumeHistoryRepository.remove(resumeId);
  } catch (error) {
    console.warn(`删除简历 ${resumeId} 的版本历史失败:`, error);
  }
  try {
    await fileSystemHistoryMirror.remove(resumeId);
  } catch (error) {
    console.warn(`删除简历 ${resumeId} 的版本历史镜像失败:`, error);
  }
}

export async function clearResumeHistory(): Promise<void> {
  await Promise.allSettled([
    resumeHistoryRepository.clear(),
    fileSystemHistoryMirror.clear(),
  ]);
}

/** 浏览器里的历史丢失时，尝试从本地目录镜像恢复。 */
export async function loadHistoryFromMirror(resumeId: string): Promise<ResumeRefs | null> {
  try {
    const archive = await fileSystemHistoryMirror.readArchive(resumeId);
    if (!archive) return null;
    return await resumeHistoryRepository.importArchive(archive, resumeId);
  } catch (error) {
    console.warn('从本地目录恢复版本历史失败:', error);
    return null;
  }
}

export async function syncHistoryMirror(resumeId: string, refs: ResumeRefs): Promise<void> {
  await fileSystemHistoryMirror.sync(resumeId, refs);
}
