import { defineStore } from 'pinia';
import type { StorageType, StorageConfig } from '@/types/storage';
import { coerceStorageType } from '@/types/storage';
import { storageManager } from '@/services/storage/StorageManager';

const STORAGE_CONFIG_KEY = 'sea-resume_storage-config';

/**
 * 存储配置 Store
 */
export const useStorageStore = defineStore('storage', {
  state: () => ({
    currentType: 'local_storage' as StorageType,
    config: null as StorageConfig | null,
    isMigrating: false,
    initializationWarning: '',
    /** 是否保存过本地目录配置（授权失效回退到浏览器缓存时仍为 true，用于提示重新授权）。 */
    hasFileSystemConfig: false,
  }),

  getters: {
    /**
     * 存储类型显示名称
     */
    storageTypeName: (state) => {
      const names: Record<StorageType, string> = {
        local_storage: '浏览器缓存',
        file_system: '本地文件系统',
      };
      return names[state.currentType] || '未知';
    },
  },

  actions: {
    /**
     * 初始化存储配置
     */
    async init() {
      this.initializationWarning = '';
      let wantsFileSystem = false;
      try {
        const savedConfig = localStorage.getItem(STORAGE_CONFIG_KEY);
        const parsed: unknown = savedConfig ? JSON.parse(savedConfig) : undefined;
        const stored = (parsed && typeof parsed === 'object' ? parsed : {}) as Partial<StorageConfig>;
        // 配置来自 localStorage，可能是旧版本写下的已下线存储类型，这里统一收敛。
        const type = coerceStorageType(stored.type);
        const config: StorageConfig = { ...stored, type };
        wantsFileSystem = type === 'file_system';
        this.config = config;
        this.currentType = type;
        await storageManager.init(savedConfig ? config : undefined);
      } catch (error) {
        console.error('初始化存储配置失败:', error);
        this.initializationWarning = `本地文件夹暂不可用，已回退到浏览器缓存。${error instanceof Error ? ` ${error.message}` : ''}`;
        this.currentType = 'local_storage';
        this.config = { type: 'local_storage' };
        await storageManager.init();
      } finally {
        this.hasFileSystemConfig = wantsFileSystem;
      }
    },

    /** 重新授权已保存的本地目录；切换回该目录并返回目录名。 */
    async reauthorizeFileSystem() {
      await storageManager.reauthorizeFileSystem();
      const config: StorageConfig = {
        type: 'file_system',
        fileSystem: { directoryPath: storageManager.getFileSystemDirectoryName() },
      };
      this.currentType = 'file_system';
      this.config = config;
      this.hasFileSystemConfig = true;
      this.initializationWarning = '';
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
      return config.fileSystem?.directoryPath || '本地目录';
    },

    async switchToFileSystem(directoryHandle: FileSystemDirectoryHandle, useExisting = false) {
      this.isMigrating = true;
      try {
        const result = await storageManager.switchToFileSystem(directoryHandle, useExisting);
        const config: StorageConfig = { type: 'file_system', fileSystem: { directoryPath: result.directoryName } };
        this.currentType = 'file_system';
        this.config = config;
        this.hasFileSystemConfig = true;
        this.initializationWarning = '';
        localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
        return { addedCount: result.addedCount, conflictCount: result.conflictCount };
      } finally {
        this.isMigrating = false;
      }
    },

    async switchToBrowserStorage() {
      this.isMigrating = true;
      try {
        if (this.currentType === 'file_system') await storageManager.migrate('file_system', 'local_storage');
        const config: StorageConfig = { type: 'local_storage' };
        this.currentType = 'local_storage';
        this.config = config;
        localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
      } finally {
        this.isMigrating = false;
      }
    },

    /**
     * 清空当前存储中的所有简历
     */
    async clearAll() {
      const resumes = await storageManager.list();
      await Promise.all(resumes.map((resume) => storageManager.delete(resume.id)));
    },
  },
});
