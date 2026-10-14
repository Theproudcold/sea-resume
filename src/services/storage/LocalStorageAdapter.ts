import type { IStorageAdapter, StorageType } from '@/types/storage';
import type { ResumeData, ResumeMeta } from '@/types/resume';

const STORAGE_PREFIX = 'sea-resume_';
const INDEX_KEY = `${STORAGE_PREFIX}index`;
const RESUME_KEY_PREFIX = `${STORAGE_PREFIX}resume_`;

/**
 * LocalStorage 适配器
 * 使用索引与详情分离的存储策略
 */
export class LocalStorageAdapter implements IStorageAdapter {
  readonly type: StorageType = 'local_storage';
  private _isReady = false;

  async init(): Promise<void> {
    try {
      // 检查 LocalStorage 是否可用
      const testKey = `${STORAGE_PREFIX}test`;
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      this._isReady = true;
    } catch (error) {
      console.error('LocalStorage 不可用:', error);
      throw new Error('LocalStorage 不可用，可能是隐私模式或存储已满');
    }
  }

  isReady(): boolean {
    return this._isReady;
  }

  /**
   * 获取所有简历的元数据列表
   */
  async list(): Promise<ResumeMeta[]> {
    const indexJson = localStorage.getItem(INDEX_KEY);
    if (indexJson === null) return [];

    let value: unknown;
    try {
      value = JSON.parse(indexJson);
    } catch {
      throw new Error('读取简历索引失败：JSON 格式无效，数据未修改。');
    }
    if (!Array.isArray(value) || value.some((item) =>
      !item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id
      || typeof item.title !== 'string' || typeof item.templateId !== 'string'
      || !Number.isFinite(item.updatedAt),
    )) {
      throw new Error('读取简历索引失败：索引格式无效，数据未修改。');
    }
    return (value as ResumeMeta[]).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 读取指定简历的完整数据
   */
  async read(id: string): Promise<ResumeData | null> {
    const dataJson = localStorage.getItem(`${RESUME_KEY_PREFIX}${id}`);
    if (dataJson === null) return null;
    try {
      return JSON.parse(dataJson) as ResumeData;
    } catch {
      throw new Error(`读取简历 ${id} 失败：JSON 格式无效。`);
    }
  }

  /**
   * 保存简历数据和元数据
   */
  async save(data: ResumeData, meta: ResumeMeta): Promise<void> {
    if (data.id !== meta.id) throw new Error('简历数据与元数据 ID 不一致。');
    const key = `${RESUME_KEY_PREFIX}${data.id}`;
    const previousData = localStorage.getItem(key);
    try {
      const index = await this.list();
      const existingIndex = index.findIndex((item) => item.id === data.id);
      if (existingIndex >= 0) index[existingIndex] = meta;
      else index.push(meta);

      let detailWritten = false;
      try {
        localStorage.setItem(key, JSON.stringify(data));
        detailWritten = true;
        localStorage.setItem(INDEX_KEY, JSON.stringify(index));
      } catch (error) {
        if (detailWritten) {
          try {
            if (previousData === null) localStorage.removeItem(key);
            else localStorage.setItem(key, previousData);
          } catch (rollbackError) {
            throw new Error(`保存失败且详情回滚未完成：${rollbackError instanceof Error ? rollbackError.message : '未知错误'}`);
          }
        }
        throw error;
      }
    } catch (error) {
      console.error(`保存简历 ${data.id} 失败:`, error);
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new Error('存储空间不足，请考虑切换到本地文件系统存储');
      }
      throw error;
    }
  }

  /**
   * 删除指定简历
   */
  async delete(id: string): Promise<void> {
    try {
      const index = await this.list();
      const key = `${RESUME_KEY_PREFIX}${id}`;
      const previousData = localStorage.getItem(key);
      const newIndex = index.filter((item) => item.id !== id);
      try {
        localStorage.removeItem(key);
        localStorage.setItem(INDEX_KEY, JSON.stringify(newIndex));
      } catch (error) {
        if (previousData !== null) {
          try {
            localStorage.setItem(key, previousData);
          } catch (rollbackError) {
            throw new Error(`删除失败且详情回滚未完成：${rollbackError instanceof Error ? rollbackError.message : '未知错误'}`);
          }
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

  /**
   * 获取存储使用情况（估算）
   */
  getStorageSize(): number {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const value = localStorage.getItem(key);
        if (value) {
          total += key.length + value.length;
        }
      }
    }
    return total;
  }

  /**
   * 获取存储使用百分比（假设 5MB 限制）
   */
  getStorageUsagePercent(): number {
    const size = this.getStorageSize();
    const limit = 5 * 1024 * 1024; // 5MB
    return Math.round((size / limit) * 100);
  }
}
