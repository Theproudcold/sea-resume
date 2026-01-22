import type { IStorageAdapter, StorageType, StorageConfig, MigrationProgress } from '@/types/storage';
import type { ResumeData, ResumeMeta } from '@/types/resume';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { FileSystemAdapter } from './FileSystemAdapter';

/**
 * 存储管理器（单例模式）
 * 负责管理不同的存储适配器，提供统一的存储接口
 */
export class StorageManager {
  private static instance: StorageManager | null = null;
  private currentAdapter: IStorageAdapter;
  private adapterCache: Map<StorageType, IStorageAdapter> = new Map();

  private constructor() {
    // 默认使用 LocalStorage 适配器
    this.currentAdapter = new LocalStorageAdapter();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  /**
   * 初始化存储管理器
   */
  async init(config?: StorageConfig): Promise<void> {
    if (config) {
      await this.switchAdapter(config.type, config);
    } else {
      await this.currentAdapter.init();
    }
  }

  /**
   * 获取当前适配器
   */
  getCurrentAdapter(): IStorageAdapter {
    return this.currentAdapter;
  }

  /**
   * 获取当前适配器类型
   */
  getCurrentType(): StorageType {
    return this.currentAdapter.type;
  }

  /**
   * 切换存储适配器
   */
  async switchAdapter(type: StorageType, config?: StorageConfig): Promise<void> {
    // 从缓存中获取或创建新适配器
    let adapter = this.adapterCache.get(type);

    if (!adapter) {
      adapter = this.createAdapter(type, config);
      this.adapterCache.set(type, adapter);
    }

    // 初始化适配器
    await adapter.init();
    this.currentAdapter = adapter;
  }

  /**
   * 创建存储适配器
   */
  private createAdapter(type: StorageType, config?: StorageConfig): IStorageAdapter {
    switch (type) {
      case 'local_storage':
        return new LocalStorageAdapter();

      case 'file_system':
        return new FileSystemAdapter();

      case 'webdav':
        // TODO: 实现 WebDavAdapter
        throw new Error('WebDAV 适配器尚未实现');

      case 'baidu_disk':
        // TODO: 实现 BaiduDiskAdapter
        throw new Error('百度网盘适配器尚未实现');

      default:
        throw new Error(`未知的存储类型: ${type}`);
    }
  }

  /**
   * 数据迁移
   * @param from 源存储类型
   * @param to 目标存储类型
   * @param onProgress 进度回调
   */
  async migrate(
    from: StorageType,
    to: StorageType,
    onProgress?: (progress: MigrationProgress) => void
  ): Promise<void> {
    const sourceAdapter = this.adapterCache.get(from) || this.createAdapter(from);
    const targetAdapter = this.adapterCache.get(to) || this.createAdapter(to);

    // 确保两个适配器都已初始化
    if (!sourceAdapter.isReady()) {
      await sourceAdapter.init();
    }
    if (!targetAdapter.isReady()) {
      await targetAdapter.init();
    }

    // 获取源数据列表
    const sourceList = await sourceAdapter.list();
    const total = sourceList.length;

    for (let i = 0; i < total; i++) {
      const meta = sourceList[i];
      if (!meta) continue;

      // 报告进度
      onProgress?.({
        total,
        current: i + 1,
        currentItem: meta.title,
        status: 'processing',
      });

      try {
        // 读取完整数据
        const data = await sourceAdapter.read(meta.id);
        if (!data) {
          console.warn(`简历 ${meta.id} 不存在，跳过`);
          continue;
        }

        // 保存到目标存储
        await targetAdapter.save(data, meta);
      } catch (error) {
        console.error(`迁移简历 ${meta.id} 失败:`, error);
        onProgress?.({
          total,
          current: i + 1,
          currentItem: meta.title,
          status: 'error',
          error: error instanceof Error ? error.message : '未知错误',
        });
        throw error;
      }
    }

    // 迁移完成
    onProgress?.({
      total,
      current: total,
      status: 'completed',
    });

    // 切换到新适配器
    this.currentAdapter = targetAdapter;
  }

  /**
   * 代理方法：获取简历列表
   */
  async list(): Promise<ResumeMeta[]> {
    return this.currentAdapter.list();
  }

  /**
   * 代理方法：读取简历
   */
  async read(id: string): Promise<ResumeData | null> {
    return this.currentAdapter.read(id);
  }

  /**
   * 代理方法：保存简历
   */
  async save(data: ResumeData, meta: ResumeMeta): Promise<void> {
    return this.currentAdapter.save(data, meta);
  }

  /**
   * 代理方法：删除简历
   */
  async delete(id: string): Promise<void> {
    return this.currentAdapter.delete(id);
  }

  /**
   * 代理方法：导出简历
   */
  async export(id: string): Promise<Blob | undefined> {
    if (this.currentAdapter.export) {
      return this.currentAdapter.export(id);
    }
    return undefined;
  }
}

// 导出单例
export const storageManager = StorageManager.getInstance();
