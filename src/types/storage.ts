import type { ResumeData, ResumeMeta } from './resume';

/**
 * 存储类型
 */
export type StorageType = 'local_storage' | 'file_system';

/**
 * 存储配置
 */
export interface StorageConfig {
  type: StorageType;
  // 文件系统配置
  fileSystem?: {
    directoryHandle?: FileSystemDirectoryHandle;  // 存储在 IndexedDB 中
    directoryPath?: string;  // 显示用的路径名称
  };
}

/**
 * 存储适配器接口
 */
export interface IStorageAdapter {
  /** 适配器类型 */
  readonly type: StorageType;

  /** 初始化适配器（如：请求权限、验证Token） */
  init(): Promise<void>;

  /** 获取所有简历的元数据列表 */
  list(): Promise<ResumeMeta[]>;

  /** 读取指定简历的完整数据 */
  read(id: string): Promise<ResumeData | null>;

  /** 保存简历数据和元数据 */
  save(data: ResumeData, meta: ResumeMeta): Promise<void>;

  /** 删除指定简历 */
  delete(id: string): Promise<void>;

  /** 导出简历为文件（可选） */
  export?(id: string): Promise<Blob>;

  /** 检查是否已初始化/已授权 */
  isReady(): boolean;
}

/**
 * 数据迁移进度
 */
export interface MigrationProgress {
  total: number;
  current: number;
  currentItem?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}
