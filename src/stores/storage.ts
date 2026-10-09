import { defineStore } from 'pinia';
import type { StorageType, StorageConfig, SyncStatus, MigrationProgress } from '@/types/storage';
import { storageManager } from '@/services/storage/StorageManager';

const STORAGE_CONFIG_KEY = 'sea-resume_storage-config';

/**
 * 存储配置 Store
 */
export const useStorageStore = defineStore('storage', {
  state: () => ({
    currentType: 'local_storage' as StorageType,
    config: null as StorageConfig | null,
    syncStatus: 'idle' as SyncStatus,
    lastSyncTime: null as number | null,
    migrationProgress: null as MigrationProgress | null,
    isMigrating: false,
    initializationWarning: '',
  }),

  getters: {
    /**
     * 是否正在同步
     */
    isSyncing: (state) => state.syncStatus === 'syncing',

    /**
     * 存储类型显示名称
     */
    storageTypeName: (state) => {
      const names: Record<StorageType, string> = {
        local_storage: '浏览器缓存',
        file_system: '本地文件系统',
        webdav: 'WebDAV',
        baidu_disk: '百度网盘',
      };
      return names[state.currentType] || '未知';
    },

    /**
     * 迁移进度百分比
     */
    migrationPercent: (state) => {
      if (!state.migrationProgress) return 0;
      const { current, total } = state.migrationProgress;
      return total > 0 ? Math.round((current / total) * 100) : 0;
    },
  },

  actions: {
    /**
     * 初始化存储配置
     */
    async init() {
      this.initializationWarning = '';
      try {
        const savedConfig = localStorage.getItem(STORAGE_CONFIG_KEY);
        const config: StorageConfig = savedConfig ? JSON.parse(savedConfig) : { type: 'local_storage' };
        this.config = config;
        this.currentType = config.type;
        await storageManager.init(savedConfig ? config : undefined);
      } catch (error) {
        console.error('初始化存储配置失败:', error);
        this.initializationWarning = `本地文件夹暂不可用，已回退到浏览器缓存。${error instanceof Error ? ` ${error.message}` : ''}`;
        this.currentType = 'local_storage';
        this.config = { type: 'local_storage' };
        await storageManager.init();
      }
    },

    async switchToFileSystem(directoryHandle: FileSystemDirectoryHandle, useExisting = false) {
      this.isMigrating = true;
      try {
        const result = await storageManager.switchToFileSystem(directoryHandle, useExisting);
        const config: StorageConfig = { type: 'file_system', fileSystem: { directoryPath: result.directoryName } };
        this.currentType = 'file_system';
        this.config = config;
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
     * 切换存储类型
     */
    async switchStorageType(type: StorageType, config?: Partial<StorageConfig>) {
      try {
        const newConfig: StorageConfig = {
          type,
          ...config,
        };

        // 切换适配器
        await storageManager.switchAdapter(type, newConfig);

        // 更新状态
        this.currentType = type;
        this.config = newConfig;

        // 保存配置
        localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(newConfig));
      } catch (error) {
        console.error('切换存储类型失败:', error);
        throw error;
      }
    },

    /**
     * 开始数据迁移
     */
    async startMigration(from: StorageType, to: StorageType) {
      this.isMigrating = true;
      this.migrationProgress = {
        total: 0,
        current: 0,
        status: 'pending',
      };

      try {
        await storageManager.migrate(from, to, (progress) => {
          this.migrationProgress = progress;
        });

        // 迁移成功，更新当前类型
        this.currentType = to;
      } catch (error) {
        console.error('数据迁移失败:', error);
        if (this.migrationProgress) {
          this.migrationProgress.status = 'error';
          this.migrationProgress.error = error instanceof Error ? error.message : '未知错误';
        }
        throw error;
      } finally {
        this.isMigrating = false;
      }
    },

    /**
     * 更新同步状态
     */
    updateSyncStatus(status: SyncStatus) {
      this.syncStatus = status;
      if (status === 'success') {
        this.lastSyncTime = Date.now();
      }
    },

    /**
     * 清除迁移进度
     */
    clearMigrationProgress() {
      this.migrationProgress = null;
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
