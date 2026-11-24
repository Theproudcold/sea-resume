import type { IStorageAdapter, StorageType, StorageConfig } from '@/types/storage';
import type { ResumeData, ResumeMeta } from '@/types/resume';
import { withTimeout } from '@/utils/asyncTimeout';
import { normalizeResumeData } from '@/utils/resumeData';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { FileSystemAdapter } from './FileSystemAdapter';

/** 存储适配器兜底超时：任何写操作都必须让界面拿到结果，不能无限等待。 */
const ADAPTER_WRITE_TIMEOUT_MS = 25000;
const ADAPTER_WRITE_TIMEOUT_MESSAGE = '保存超时：存储位置 25 秒内没有响应。请检查本地目录授权是否失效、目录是否可写，然后重试。';

/**
 * 由简历正文派生出列表索引。这是 `ResumeMeta` 的唯一构造点：
 * 列表只读索引、不读正文，因此索引字段一旦漏写，界面上就会出现「读不到岗位版本」这类
 * 只在特定入口发生的缺陷。把构造收敛到一处，新增索引字段时只需要改这里。
 */
export function metaFromResume(data: ResumeData): ResumeMeta {
  return {
    id: data.id,
    title: data.title,
    templateId: data.templateId,
    createdAt: Date.parse(data.createdAt),
    updatedAt: Date.parse(data.updatedAt),
    ...(data.jobTarget ? { jobTarget: { ...data.jobTarget } } : {}),
  };
}

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
    if (type === 'file_system' && !adapter.isReady()) throw new Error('本地文件夹尚未授权；请在设置中手动选择文件夹。');
    this.currentAdapter = adapter;
  }

  /** Merge current resumes into a selected folder without overwriting existing IDs. */
  async switchToFileSystem(
    directoryHandle: FileSystemDirectoryHandle,
    mergeExisting = false,
  ): Promise<{ directoryName: string; addedCount: number; conflictCount: number }> {
    const sourceAdapter = this.currentAdapter;
    const targetAdapter = new FileSystemAdapter(directoryHandle);
    await targetAdapter.init();
    if (!targetAdapter.isReady()) throw new Error('所选目录尚未获得读写授权。');

    const initialResumes = await targetAdapter.list();
    if (initialResumes.length && !mergeExisting) {
      const error = new Error('所选目录已有 Sea Resume 数据。');
      error.name = 'DirectoryContainsResumeDataError';
      throw error;
    }
    await targetAdapter.upgradeLayout();
    const existingResumes = await targetAdapter.list();

    const existingIds = new Set(existingResumes.map((resume) => resume.id));
    const sourceResumes = await sourceAdapter.list();
    let addedCount = 0;
    let conflictCount = 0;
    for (const meta of sourceResumes) {
      if (existingIds.has(meta.id)) {
        conflictCount++;
        continue;
      }
      const resume = await sourceAdapter.read(meta.id);
      if (resume) {
        await targetAdapter.save(normalizeResumeData(resume), meta);
        existingIds.add(meta.id);
        addedCount++;
      }
    }
    this.adapterCache.set('file_system', targetAdapter);
    this.currentAdapter = targetAdapter;
    return { directoryName: targetAdapter.getDirectoryName(), addedCount, conflictCount };
  }

  /**
   * 创建存储适配器。契约：`type` 必须是已校验的 `StorageType`。
   *
   * 已下线的存储类型（旧版本可能存进配置里）在进入这里之前就要被
   * `coerceStorageType` 收敛掉；因此这里的 default 是「不可能到达」的分支，
   * 写成穷尽检查，让新增 `StorageType` 却忘了适配器时编译失败。
   */
  private createAdapter(type: StorageType, config?: StorageConfig): IStorageAdapter {
    switch (type) {
      case 'local_storage':
        return new LocalStorageAdapter();

      case 'file_system':
        return new FileSystemAdapter(config?.fileSystem?.directoryHandle);

      default: {
        const unknown: never = type;
        throw new Error(`未知的存储类型: ${String(unknown)}`);
      }
    }
  }

  /**
   * 把一份存储里的简历原样搬到另一份存储，然后切到目标适配器。
   * 索引按源列表搬运，不按正文重算。
   */
  async migrate(from: StorageType, to: StorageType): Promise<void> {
    const sourceAdapter = this.adapterCache.get(from) || this.createAdapter(from);
    const targetAdapter = this.adapterCache.get(to) || this.createAdapter(to);

    if (!sourceAdapter.isReady()) {
      await sourceAdapter.init();
    }
    if (!targetAdapter.isReady()) {
      await targetAdapter.init();
    }

    const sourceList = await sourceAdapter.list();
    for (const meta of sourceList) {
      if (!meta) continue;
      try {
        const data = await sourceAdapter.read(meta.id);
        if (!data) {
          console.warn(`简历 ${meta.id} 不存在，跳过`);
          continue;
        }
        await targetAdapter.save(normalizeResumeData(data), meta);
      } catch (error) {
        console.error(`迁移简历 ${meta.id} 失败:`, error);
        throw error;
      }
    }

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
   * 历史数据可能缺少 theme 等新增字段，读取后按默认值补齐再交给界面。
   */
  async read(id: string): Promise<ResumeData | null> {
    const resume = await this.currentAdapter.read(id);
    return resume ? normalizeResumeData(resume) : null;
  }

  /**
   * 保存一份简历：索引由正文派生，调用方不需要也不应该手工拼 `ResumeMeta`。
   *
   * 这是应用代码的统一写入入口。保留下面的 `save(data, meta)` 只是为了迁移：
   * 迁移必须原样搬运源索引，不能按正文重新推导。磁盘上多出来的旧键跟着对象走，不在这里剔除。
   */
  async saveResume(data: ResumeData): Promise<void> {
    await this.save(data, metaFromResume(data));
  }

  /**
   * 代理方法：保存简历
   */
  async save(data: ResumeData, meta: ResumeMeta): Promise<void> {
    try {
      return await withTimeout(this.currentAdapter.save(data, meta), ADAPTER_WRITE_TIMEOUT_MS, ADAPTER_WRITE_TIMEOUT_MESSAGE);
    } catch (error) {
      console.error(`保存简历 ${data.id} 失败（${this.currentAdapter.type}）:`, error);
      throw error;
    }
  }

  /**
   * 代理方法：删除简历
   */
  async delete(id: string): Promise<void> {
    try {
      return await withTimeout(this.currentAdapter.delete(id), ADAPTER_WRITE_TIMEOUT_MS, ADAPTER_WRITE_TIMEOUT_MESSAGE);
    } catch (error) {
      console.error(`删除简历 ${id} 失败（${this.currentAdapter.type}）:`, error);
      throw error;
    }
  }

  /**
   * 重新申请已保存本地目录的权限，并把当前存储切回该目录。
   * 必须在用户点击等手势中调用，否则浏览器不会弹出授权框。
   */
  async reauthorizeFileSystem(): Promise<void> {
    if (this.currentAdapter instanceof FileSystemAdapter) {
      await this.currentAdapter.reauthorizeSavedDirectory();
      return;
    }
    const cached = this.adapterCache.get('file_system');
    if (!(cached instanceof FileSystemAdapter)) {
      throw new Error('本地目录尚未初始化；请在设置中重新选择目录。');
    }
    await cached.reauthorizeSavedDirectory();
    this.currentAdapter = cached;
  }

  /** 当前缓存中本地目录的名称；未选择时返回占位文本。 */
  getFileSystemDirectoryName(): string {
    const adapter = this.currentAdapter instanceof FileSystemAdapter
      ? this.currentAdapter
      : this.adapterCache.get('file_system');
    return adapter instanceof FileSystemAdapter ? adapter.getDirectoryName() : '未选择';
  }
}

// 导出单例
export const storageManager = StorageManager.getInstance();
