import type { IStorageAdapter, StorageType } from '@/types/storage';
import type { ResumeData, ResumeMeta } from '@/types/resume';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

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

/**
 * 本地文件系统适配器
 * 使用 File System Access API
 */
export class FileSystemAdapter implements IStorageAdapter {
  readonly type: StorageType = 'file_system';
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private db: IDBPDatabase<FileSystemDB> | null = null;
  private _isReady = false;

  constructor(directoryHandle?: FileSystemDirectoryHandle) {
    this.directoryHandle = directoryHandle ?? null;
  }

  /** Restore an already-authorized directory only; requesting a new one is always user initiated. */
  async init(): Promise<void> {
    this.db = await openDB<FileSystemDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      },
    });

    if (this.directoryHandle) {
      await this.db.put(STORE_NAME, this.directoryHandle, HANDLE_KEY);
      this._isReady = true;
      return;
    }

    const savedHandle = await this.db.get(STORE_NAME, HANDLE_KEY);
    if (!savedHandle) return;
    try {
      // @ts-ignore File System Access API permission methods are not in all DOM typings.
      const permission = await savedHandle.queryPermission?.({ mode: 'readwrite' });
      if (permission === 'granted') {
        this.directoryHandle = savedHandle;
        this._isReady = true;
      }
    } catch (error) {
      console.warn('恢复目录句柄失败；需要用户重新授权:', error);
    }
  }

  /**
   * 提示用户选择目录
   */
  async pickDirectory(): Promise<void> {
    try {
      // 检查浏览器支持
      if (!('showDirectoryPicker' in window)) {
        throw new Error('您的浏览器不支持 File System Access API');
      }

      // 打开目录选择器
      // @ts-ignore - File System Access API
      this.directoryHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });

      // 保存到 IndexedDB
      if (this.db && this.directoryHandle) {
        await this.db.put(STORE_NAME, this.directoryHandle, HANDLE_KEY);
      }

      this._isReady = true;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('用户取消了目录选择');
      }
      throw error;
    }
  }

  isReady(): boolean {
    return this._isReady && this.directoryHandle !== null;
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

  /**
   * 导出简历为 JSON Blob
   */
  async export(id: string): Promise<Blob> {
    const data = await this.read(id);
    if (!data) {
      throw new Error(`简历 ${id} 不存在`);
    }
    const jsonStr = JSON.stringify(data, null, 2);
    return new Blob([jsonStr], { type: 'application/json' });
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
    const fileHandle = await directory.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(JSON.stringify(value, null, 2));
      await writable.close();
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

  /**
   * 清除已保存的目录句柄（重新选择目录时使用）
   */
  async clearHandle(): Promise<void> {
    if (this.db) {
      await this.db.delete(STORE_NAME, HANDLE_KEY);
    }
    this.directoryHandle = null;
    this._isReady = false;
  }
}
