import type { ResumeData, ResumeMeta } from './resume';

/**
 * 存储类型。
 *
 * 只列真正实现了适配器的类型。`StorageType` 驱动界面上的可选存储位置，
 * 把尚未实现的方案（WebDAV、网盘）放进来只会得到一个「类型上合法、运行时抛错」
 * 的选项，因此它们在有实现之前不入类型。
 */
export type StorageType = 'local_storage' | 'file_system';

/**
 * 把来路不明的值收敛成合法的 `StorageType`。
 *
 * 存储配置存在 `localStorage` 里，可能是旧版本写下的已下线类型（历史上出现过
 * WebDAV、百度网盘）。这类值类型上「合法」、运行时却没有适配器，必须在进入
 * 存储层之前收敛，否则初始化会失败把用户挡在门外。
 */
export function coerceStorageType(value: unknown): StorageType {
  return value === 'file_system' ? 'file_system' : 'local_storage';
}

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
