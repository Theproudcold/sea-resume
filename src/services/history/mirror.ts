import type {
  ResumeCommit,
  ResumeHistoryArchive,
  ResumeRefs,
  StoredAvatar,
} from '@/types/history';
import { storageManager } from '@/services/storage/StorageManager';
import { resumeHistoryRepository, type HistoryRepository } from './repository';

const HISTORY_DIRECTORY = '.history';
const REFS_FILE = 'refs.json';
const COMMITS_DIRECTORY = 'commits';
const AVATARS_DIRECTORY = 'avatars';
const MIRROR_MARKER_PREFIX = 'sea-resume_history-mirror:';

const markerKey = (resumeId: string) => (
  `${MIRROR_MARKER_PREFIX}${storageManager.getFileSystemDirectoryName()}:${resumeId}`
);

function readMarker(resumeId: string): string | null {
  try {
    return localStorage.getItem(markerKey(resumeId));
  } catch {
    return null;
  }
}

function writeMarker(resumeId: string, value: string): void {
  try {
    localStorage.setItem(markerKey(resumeId), value);
  } catch {
    // 浏览器禁止 localStorage 时，镜像仍然可用，只是每次打开会重新同步。
  }
}

async function writeJson(directory: FileSystemDirectoryHandle, name: string, value: unknown): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(JSON.stringify(value));
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

async function readJson<T>(directory: FileSystemDirectoryHandle, name: string): Promise<T | null> {
  try {
    const handle = await directory.getFileHandle(name);
    const file = await handle.getFile();
    return JSON.parse(await file.text()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') return null;
    throw error;
  }
}

async function getDirectory(
  source: FileSystemDirectoryHandle,
  name: string,
  create = false,
): Promise<FileSystemDirectoryHandle> {
  return source.getDirectoryHandle(name, { create });
}

/**
 * 把版本历史镜像到当前本地目录的 `.history/<resumeId>/`。
 *
 * IndexedDB 是主存储；镜像只做 best-effort：目录授权失效、只读盘或写入超时都不能
 * 反向影响简历保存，调用方显示提示即可。目录里的结构是增量文件，不整体重写。
 */
export class FileSystemHistoryMirror {
  private readonly repository: HistoryRepository;

  constructor(repository: HistoryRepository = resumeHistoryRepository) {
    this.repository = repository;
  }

  private async historyRoot(create = true): Promise<FileSystemDirectoryHandle | null> {
    const root = storageManager.getActiveFileSystemDirectoryHandle();
    if (!root) return null;
    try {
      return await getDirectory(root, HISTORY_DIRECTORY, create);
    } catch (error) {
      if (!create && error instanceof Error && error.name === 'NotFoundError') return null;
      throw error;
    }
  }

  private async resumeDirectory(resumeId: string, create = true): Promise<FileSystemDirectoryHandle | null> {
    const root = await this.historyRoot();
    if (!root) return null;
    return getDirectory(root, encodeURIComponent(resumeId), create);
  }

  isCurrent(resumeId: string, refs: ResumeRefs): boolean {
    return readMarker(resumeId) === refs.updatedAt;
  }

  async append(resumeId: string, refs: ResumeRefs, commit: ResumeCommit, avatar?: StoredAvatar): Promise<void> {
    const directory = await this.resumeDirectory(resumeId);
    if (!directory) return;
    const commits = await getDirectory(directory, COMMITS_DIRECTORY, true);
    await writeJson(commits, `${commit.hash}.json`, commit);
    if (avatar) {
      const avatars = await getDirectory(directory, AVATARS_DIRECTORY, true);
      await writeJson(avatars, `${avatar.hash}.json`, avatar);
    }
    await writeJson(directory, REFS_FILE, refs);
    writeMarker(resumeId, refs.updatedAt);
  }

  async updateCommit(resumeId: string, refs: ResumeRefs, commit: ResumeCommit): Promise<void> {
    const directory = await this.resumeDirectory(resumeId);
    if (!directory) return;
    const commits = await getDirectory(directory, COMMITS_DIRECTORY, true);
    await writeJson(commits, `${commit.hash}.json`, commit);
    await writeJson(directory, REFS_FILE, refs);
    writeMarker(resumeId, refs.updatedAt);
  }

  /** 首次切到本地目录或镜像落后时，补齐所有被引用的提交与头像。 */
  async sync(resumeId: string, refs: ResumeRefs): Promise<void> {
    const directory = await this.resumeDirectory(resumeId);
    if (!directory) return;
    const commitsDirectory = await getDirectory(directory, COMMITS_DIRECTORY, true);
    const avatarsDirectory = await getDirectory(directory, AVATARS_DIRECTORY, true);
    for (const meta of refs.commits) {
      const commit = await this.repository.readCommit(resumeId, meta.hash);
      if (!commit) continue;
      await writeJson(commitsDirectory, `${commit.hash}.json`, commit);
      if (commit.avatarHash) {
        const avatar = await this.repository.readAvatar(resumeId, commit.avatarHash);
        if (avatar) await writeJson(avatarsDirectory, `${avatar.hash}.json`, avatar);
      }
    }
    await writeJson(directory, REFS_FILE, refs);
    writeMarker(resumeId, refs.updatedAt);
  }

  /** 从目录读回历史；用于浏览器数据被清理后仍能从本地目录恢复版本记录。 */
  async readArchive(resumeId: string): Promise<ResumeHistoryArchive | null> {
    const root = await this.historyRoot(false);
    if (!root) return null;
    let directory: FileSystemDirectoryHandle;
    try {
      directory = await getDirectory(root, encodeURIComponent(resumeId), false);
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') return null;
      throw error;
    }
    const refs = await readJson<ResumeRefs>(directory, REFS_FILE);
    if (!refs || !Array.isArray(refs.commits)) return null;
    const commitsDirectory = await getDirectory(directory, COMMITS_DIRECTORY, false).catch(() => null);
    const avatarsDirectory = await getDirectory(directory, AVATARS_DIRECTORY, false).catch(() => null);
    if (!commitsDirectory) return null;
    const commits: ResumeCommit[] = [];
    const avatars = new Map<string, StoredAvatar>();
    for (const meta of refs.commits) {
      const commit = await readJson<ResumeCommit>(commitsDirectory, `${meta.hash}.json`);
      if (!commit) continue;
      commits.push(commit);
      if (commit.avatarHash && avatarsDirectory) {
        const avatar = await readJson<StoredAvatar>(avatarsDirectory, `${commit.avatarHash}.json`);
        if (avatar) avatars.set(avatar.hash, avatar);
      }
    }
    if (!commits.length) return null;
    return {
      format: 'sea-resume-history',
      version: 1,
      resumeId,
      head: refs.head,
      commits,
      avatars: [...avatars.values()],
      tags: { ...refs.tags },
      truncated: refs.truncated,
      exportedAt: new Date().toISOString(),
    };
  }

  async resync(resumeId: string, refs: ResumeRefs): Promise<void> {
    await this.remove(resumeId);
    await this.sync(resumeId, refs);
  }

  async remove(resumeId: string): Promise<void> {
    const root = await this.historyRoot(false);
    if (!root) return;
    try {
      await root.removeEntry(encodeURIComponent(resumeId), { recursive: true });
    } catch (error) {
      if (!(error instanceof Error && error.name === 'NotFoundError')) throw error;
    }
    try {
      localStorage.removeItem(markerKey(resumeId));
    } catch {
      // ignore
    }
  }

  async clear(): Promise<void> {
    const root = storageManager.getActiveFileSystemDirectoryHandle();
    if (!root) return;
    try {
      await root.removeEntry(HISTORY_DIRECTORY, { recursive: true });
    } catch (error) {
      if (!(error instanceof Error && error.name === 'NotFoundError')) throw error;
    }
  }
}

export const fileSystemHistoryMirror = new FileSystemHistoryMirror();

export function historyMirrorErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : '未知错误';
  return `版本历史已保存在浏览器，但镜像到本地目录失败：${detail}`;
}
