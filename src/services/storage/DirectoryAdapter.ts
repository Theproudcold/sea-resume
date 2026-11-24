import type { IStorageAdapter, StorageType } from '@/types/storage';
import type { ResumeData, ResumeMeta } from '@/types/resume';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { withTimeout } from '@/utils/asyncTimeout';

/**
 * IndexedDB Schema
 */
interface FileSystemDB extends DBSchema {
  handles: {
    key: string;
    value: FileSystemDirectoryHandle;
  };
}

const DB_NAME = 'sea-resume-fs';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const HANDLE_KEY = 'directory-handle';
const INDEX_FILE_NAME = 'index.json';
const MANIFEST_FILE_NAME = 'manifest.json';
const MANIFEST_VERSION = 1;
interface ResumeManifest {
  schemaVersion: number;
  resumes: ResumeMeta[];
}

const RESUMES_DIRECTORY_NAME = 'resumes';
const RESUME_FILE_PREFIX = 'resume-';

/** Directory permission methods are not in all DOM typings. */
type PermissionCapableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (options?: { mode?: string }) => Promise<PermissionState>;
  requestPermission?: (options?: { mode?: string }) => Promise<PermissionState>;
};

const WRITE_TIMEOUT_MS = 15000;
const PERMISSION_TIMEOUT_MS = 5000;
const PERMISSION_LOST_MESSAGE = '本地目录的读写权限已失效。请在“管理 → 数据与存储设置”中重新选择并授权该目录，然后重试。';

function writeTimeoutMessage(fileName: string): string {
  return `写入本地目录超时（${fileName}）。目录可能位于云同步盘、被其他程序占用或权限已失效；请检查后重试。`;
}

/**
 * 用户授权的本地目录。
 * 目录句柄放在 IndexedDB（sea-resume-fs），简历正文写在选中的文件夹里。
 * 读取同时认旧的 index.json 和新的 manifest.json；写入只更新 manifest，旧文件留着。
 * 配置里的类型值仍是 file_system。
 */
export class DirectoryAdapter implements IStorageAdapter {
  readonly type: StorageType = 'file_system';
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private db: IDBPDatabase<FileSystemDB> | null = null;
  private _isReady = false;

  constructor(directoryHandle?: FileSystemDirectoryHandle) {
    this.directoryHandle = directoryHandle ?? null;
  }

  private async openDatabase(): Promise<IDBPDatabase<FileSystemDB>> {
    if (!this.db) {
      this.db = await openDB<FileSystemDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        },
      });
    }
    return this.db;
  }

  /** Restore an already-authorized directory only; requesting a new one is always user initiated. */
  async init(): Promise<void> {
    const db = await this.openDatabase();

    if (this.directoryHandle) {
      await db.put(STORE_NAME, this.directoryHandle, HANDLE_KEY);
      this._isReady = true;
      return;
    }

    const savedHandle = await db.get(STORE_NAME, HANDLE_KEY);
    if (!savedHandle) return;
    try {
      const handle = savedHandle as PermissionCapableDirectoryHandle;
      const permission = await withTimeout(
        handle.queryPermission?.({ mode: 'readwrite' }) ?? Promise.resolve('denied' as PermissionState),
        PERMISSION_TIMEOUT_MS,
        '目录授权状态查询超时',
      );
      if (permission === 'granted') {
        this.directoryHandle = savedHandle;
        this._isReady = true;
      }
    } catch (error) {
      console.warn('恢复目录句柄失败；需要用户重新授权:', error);
    }
  }

  /**
   * 重新申请已保存目录的读写权限。必须在用户手势（点击）中调用，否则浏览器不会弹出授权框。
   */
  async reauthorizeSavedDirectory(): Promise<void> {
    const db = await this.openDatabase();
    const savedHandle = this.directoryHandle ?? await db.get(STORE_NAME, HANDLE_KEY);
    if (!savedHandle) throw new Error('没有已保存的本地目录；请重新选择目录。');
    const previousHandle = this.directoryHandle;
    this.directoryHandle = savedHandle;
    try {
      await this.ensureWritePermission();
    } catch (error) {
      this.directoryHandle = previousHandle;
      this._isReady = false;
      throw error;
    }
    await db.put(STORE_NAME, this.directoryHandle, HANDLE_KEY);
    this._isReady = true;
  }

  isReady(): boolean {
    return this._isReady && this.directoryHandle !== null;
  }

  /**
   * 写盘前确认目录仍然可写。授权可能在两次访问之间失效；此时必须立刻给出可操作的提示，
   * 而不是让 createWritable 长时间挂起。
   */
  private async ensureWritePermission(): Promise<void> {
    const root = this.directoryHandle;
    if (!root) throw new Error('文件系统未初始化');
    const handle = root as PermissionCapableDirectoryHandle;
    // 浏览器未实现权限 API 时不做拦截，交由后续写盘报错。
    if (typeof handle.queryPermission !== 'function') return;
    const options = { mode: 'readwrite' };
    let permission = await withTimeout(handle.queryPermission(options), PERMISSION_TIMEOUT_MS, PERMISSION_LOST_MESSAGE);
    if (permission === 'granted') return;
    if (typeof handle.requestPermission === 'function') {
      try {
        // 需要用户手势才会弹出授权框；失败时按“未授权”处理并给出同样的提示。
        permission = await withTimeout(handle.requestPermission(options), PERMISSION_TIMEOUT_MS, PERMISSION_LOST_MESSAGE);
      } catch {
        permission = 'denied';
      }
    }
    if (permission !== 'granted') throw new Error(PERMISSION_LOST_MESSAGE);
  }

  /** Ensure a selected folder is upgraded to the current manifest layout. */
  async upgradeLayout(): Promise<void> {
    const currentList = await this.list();
    await this.upgradeLegacyLayout(currentList);
  }

  /**
   * 获取所有简历的元数据列表
   */
  async list(): Promise<ResumeMeta[]> {
    if (!this.directoryHandle) throw new Error('文件系统未初始化');
    const manifest = await this.readManifest();
    return (manifest ?? await this.readLegacyIndex()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 读取指定简历的完整数据
   */
  async read(id: string): Promise<ResumeData | null> {
    if (!this.directoryHandle) throw new Error('文件系统未初始化');
    try {
      const modernManifest = await this.readManifest();
      const dataDirectory = modernManifest
        ? await this.directoryHandle.getDirectoryHandle(RESUMES_DIRECTORY_NAME)
        : this.directoryHandle;
      const fileName = modernManifest ? `${encodeURIComponent(id)}.json` : `${RESUME_FILE_PREFIX}${id}.json`;
      const fileHandle = await dataDirectory.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || (parsed as ResumeData).id !== id) {
        throw new Error(`简历文件 ${id} 数据无效或 ID 不匹配。`);
      }
      return parsed as ResumeData;
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') return null;
      throw error;
    }
  }

  /**
   * 保存简历数据和元数据
   */
  async save(data: ResumeData, meta: ResumeMeta): Promise<void> {
    const root = this.directoryHandle;
    if (!root) throw new Error('文件系统未初始化');
    if (data.id !== meta.id) throw new Error('简历数据与元数据 ID 不一致。');
    await this.ensureWritePermission();
    try {
      const currentList = await this.list();
      await this.upgradeLegacyLayout(currentList);
      const index = await this.readManifest();
      if (!index) throw new Error('目录清单升级失败；原目录数据保持不变。');
      const existingIndex = index.findIndex((item) => item.id === data.id);
      const previousData = existingIndex >= 0 ? await this.read(data.id) : null;
      if (existingIndex >= 0 && !previousData) throw new Error(`清单记录 ${data.id} 对应的简历文件缺失；已取消覆盖。`);
      if (existingIndex >= 0) index[existingIndex] = meta;
      else index.push(meta);
      const resumesDirectory = await root.getDirectoryHandle(RESUMES_DIRECTORY_NAME, { create: true });
      const resumeFileName = `${encodeURIComponent(data.id)}.json`;
      try {
        await this.writeJsonFile(resumesDirectory, resumeFileName, data);
        await this.writeJsonFile(root, MANIFEST_FILE_NAME, { schemaVersion: MANIFEST_VERSION, resumes: index });
      } catch (error) {
        try {
          if (previousData) await this.writeJsonFile(resumesDirectory, resumeFileName, previousData);
          else await resumesDirectory.removeEntry(resumeFileName);
        } catch (rollbackError) {
          throw new Error(`保存失败且回滚未完成：${rollbackError instanceof Error ? rollbackError.message : '未知错误'}`);
        }
        throw error;
      }
    } catch (error) {
      console.error(`保存简历 ${data.id} 失败:`, error);
      throw error;
    }
  }

  /**
   * 删除指定简历
   */
  async delete(id: string): Promise<void> {
    const root = this.directoryHandle;
    if (!root) throw new Error('文件系统未初始化');
    await this.ensureWritePermission();
    try {
      const currentList = await this.list();
      await this.upgradeLegacyLayout(currentList);
      const manifest = await this.readManifest();
      if (!manifest) throw new Error('目录清单不可用，无法安全删除。');
      const updatedManifest = manifest.filter((item) => item.id !== id);
      await this.writeJsonFile(root, MANIFEST_FILE_NAME, { schemaVersion: MANIFEST_VERSION, resumes: updatedManifest });
      const resumesDirectory = await root.getDirectoryHandle(RESUMES_DIRECTORY_NAME);
      try {
        await resumesDirectory.removeEntry(`${encodeURIComponent(id)}.json`);
      } catch (error) {
        try {
          await this.writeJsonFile(root, MANIFEST_FILE_NAME, { schemaVersion: MANIFEST_VERSION, resumes: manifest });
        } catch (rollbackError) {
          throw new Error(`删除失败且目录清单回滚失败：${rollbackError instanceof Error ? rollbackError.message : '未知错误'}`);
        }
        throw error;
      }
    } catch (error) {
      console.error(`删除简历 ${id} 失败:`, error);
      throw error;
    }
  }

  private async readManifest(): Promise<ResumeMeta[] | null> {
    const root = this.directoryHandle;
    if (!root) throw new Error('文件系统未初始化');
    try {
      const fileHandle = await root.getFileHandle(MANIFEST_FILE_NAME);
      const file = await fileHandle.getFile();
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object') throw new Error('目录清单格式无效；原数据未修改。');
      const manifest = parsed as Partial<ResumeManifest>;
      if (manifest.schemaVersion !== MANIFEST_VERSION) throw new Error(`不支持的目录数据版本：${String(manifest.schemaVersion)}`);
      return this.validateMetaList(manifest.resumes, '目录清单');
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') return null;
      throw error;
    }
  }

  private async readLegacyIndex(): Promise<ResumeMeta[]> {
    const root = this.directoryHandle;
    if (!root) throw new Error('文件系统未初始化');
    try {
      const fileHandle = await root.getFileHandle(INDEX_FILE_NAME);
      const file = await fileHandle.getFile();
      return this.validateMetaList(JSON.parse(await file.text()), '旧版索引');
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') return [];
      throw error;
    }
  }

  private validateMetaList(value: unknown, label: string): ResumeMeta[] {
    if (!Array.isArray(value)) throw new Error(`${label}格式无效；原数据未修改。`);
    const index = value as ResumeMeta[];
    const ids = new Set<string>();
    for (const item of index) {
      if (!item || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' || !Number.isFinite(item.updatedAt) || ids.has(item.id)) {
        throw new Error(`${label}包含无效或重复的简历记录；原数据未修改。`);
      }
      ids.add(item.id);
    }
    return index;
  }

  /** Copy the legacy layout and commit the new manifest last; legacy files remain untouched. */
  private async upgradeLegacyLayout(legacyIndex: ResumeMeta[]): Promise<void> {
    if (await this.readManifest()) return;
    const root = this.directoryHandle;
    if (!root) throw new Error('文件系统未初始化');
    const resumesDirectory = await root.getDirectoryHandle(RESUMES_DIRECTORY_NAME, { create: true });
    for (const meta of legacyIndex) {
      const legacyFile = await root.getFileHandle(`${RESUME_FILE_PREFIX}${meta.id}.json`);
      const parsed: unknown = JSON.parse(await (await legacyFile.getFile()).text());
      if (!parsed || typeof parsed !== 'object' || (parsed as ResumeData).id !== meta.id) {
        throw new Error(`旧版简历 ${meta.id} 缺失或损坏；原数据未修改。`);
      }
      await this.writeJsonFile(resumesDirectory, `${encodeURIComponent(meta.id)}.json`, parsed);
    }
    await this.writeJsonFile(root, MANIFEST_FILE_NAME, { schemaVersion: MANIFEST_VERSION, resumes: legacyIndex });
  }

  private async writeJsonFile(directory: FileSystemDirectoryHandle, fileName: string, value: unknown): Promise<void> {
    const fileHandle = await withTimeout(directory.getFileHandle(fileName, { create: true }), WRITE_TIMEOUT_MS, writeTimeoutMessage(fileName));
    const writable = await withTimeout(fileHandle.createWritable(), WRITE_TIMEOUT_MS, writeTimeoutMessage(fileName));
    try {
      await withTimeout(writable.write(JSON.stringify(value, null, 2)), WRITE_TIMEOUT_MS, writeTimeoutMessage(fileName));
      await withTimeout(writable.close(), WRITE_TIMEOUT_MS, writeTimeoutMessage(fileName));
    } catch (error) {
      await writable.abort().catch(() => undefined);
      throw error;
    }
  }

  /**
   * 获取当前目录名称
   */
  getDirectoryName(): string {
    return this.directoryHandle?.name || '未选择';
  }
}
