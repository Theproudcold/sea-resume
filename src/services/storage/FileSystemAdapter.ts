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

  /**
   * 初始化适配器
   * 1. 打开 IndexedDB
   * 2. 尝试从 IndexedDB 恢复目录句柄
   * 3. 如果没有，提示用户选择目录
   */
  async init(): Promise<void> {
    // 1. 打开 IndexedDB
    this.db = await openDB<FileSystemDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });

    // 2. 尝试恢复目录句柄
    const savedHandle = await this.db.get(STORE_NAME, HANDLE_KEY);
    if (savedHandle) {
      try {
        // 验证句柄是否仍然有效（尝试获取权限）
        // @ts-ignore - File System Access API 权限方法
        const permission = await savedHandle.queryPermission?.({ mode: 'readwrite' });

        if (permission === 'granted') {
          this.directoryHandle = savedHandle;
          this._isReady = true;
          return;
        } else if (permission === 'prompt') {
          // @ts-ignore - File System Access API 权限方法
          const newPermission = await savedHandle.requestPermission?.({ mode: 'readwrite' });
          if (newPermission === 'granted') {
            this.directoryHandle = savedHandle;
            this._isReady = true;
            return;
          }
        }
      } catch (error) {
        console.warn('恢复目录句柄失败:', error);
      }
    }

    // 3. 如果没有保存的句柄或权限被拒绝，提示用户选择目录
    await this.pickDirectory();
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

  /**
   * 获取所有简历的元数据列表
   */
  async list(): Promise<ResumeMeta[]> {
    if (!this.directoryHandle) {
      throw new Error('文件系统未初始化');
    }

    try {
      // 读取 index.json
      const fileHandle = await this.directoryHandle.getFileHandle(INDEX_FILE_NAME);
      const file = await fileHandle.getFile();
      const text = await file.text();
      const index: ResumeMeta[] = JSON.parse(text);

      // 按更新时间倒序排列
      return index.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      // 如果 index.json 不存在，返回空数组
      if (error instanceof Error && error.name === 'NotFoundError') {
        return [];
      }
      throw error;
    }
  }

  /**
   * 读取指定简历的完整数据
   */
  async read(id: string): Promise<ResumeData | null> {
    if (!this.directoryHandle) {
      throw new Error('文件系统未初始化');
    }

    try {
      const fileName = `${RESUME_FILE_PREFIX}${id}.json`;
      const fileHandle = await this.directoryHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text) as ResumeData;
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 保存简历数据和元数据
   */
  async save(data: ResumeData, meta: ResumeMeta): Promise<void> {
    if (!this.directoryHandle) {
      throw new Error('文件系统未初始化');
    }

    try {
      // 1. 保存详情数据
      const fileName = `${RESUME_FILE_PREFIX}${data.id}.json`;
      const fileHandle = await this.directoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();

      // 2. 更新索引
      const index = await this.list();
      const existingIndex = index.findIndex((item) => item.id === data.id);

      if (existingIndex >= 0) {
        index[existingIndex] = meta;
      } else {
        index.push(meta);
      }

      // 保存索引文件
      const indexFileHandle = await this.directoryHandle.getFileHandle(INDEX_FILE_NAME, {
        create: true,
      });
      const indexWritable = await indexFileHandle.createWritable();
      await indexWritable.write(JSON.stringify(index, null, 2));
      await indexWritable.close();
    } catch (error) {
      console.error(`保存简历 ${data.id} 失败:`, error);
      throw error;
    }
  }

  /**
   * 删除指定简历
   */
  async delete(id: string): Promise<void> {
    if (!this.directoryHandle) {
      throw new Error('文件系统未初始化');
    }

    try {
      // 1. 删除详情文件
      const fileName = `${RESUME_FILE_PREFIX}${id}.json`;
      await this.directoryHandle.removeEntry(fileName);

      // 2. 从索引中移除
      const index = await this.list();
      const newIndex = index.filter((item) => item.id !== id);

      // 保存索引文件
      const indexFileHandle = await this.directoryHandle.getFileHandle(INDEX_FILE_NAME, {
        create: true,
      });
      const writable = await indexFileHandle.createWritable();
      await writable.write(JSON.stringify(newIndex, null, 2));
      await writable.close();
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
