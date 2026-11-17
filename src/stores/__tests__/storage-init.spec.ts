import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { coerceStorageType } from '@/types/storage';
import { useStorageStore } from '@/stores/storage';
import { storageManager } from '@/services/storage/StorageManager';
import { LocalStorageAdapter } from '@/services/storage/LocalStorageAdapter';

const CONFIG_KEY = 'sea-resume_storage-config';

describe('coerceStorageType', () => {
  it('keeps the two implemented types', () => {
    expect(coerceStorageType('local_storage')).toBe('local_storage');
    expect(coerceStorageType('file_system')).toBe('file_system');
  });

  it('falls back to browser storage for retired types', () => {
    // 旧版本存过 WebDAV / 网盘；没有适配器，必须收敛而不是让初始化抛错。
    expect(coerceStorageType('webdav')).toBe('local_storage');
    expect(coerceStorageType('baidu_disk')).toBe('local_storage');
    expect(coerceStorageType(undefined)).toBe('local_storage');
    expect(coerceStorageType({ type: 'webdav' })).toBe('local_storage');
  });
});

describe('storage store init with a retired stored type', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('opens on browser storage instead of failing', async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ type: 'webdav', webdav: { endpoint: 'https://example.test' } }));
    const initSpy = vi.spyOn(storageManager, 'init').mockResolvedValue(undefined);

    const store = useStorageStore();
    await store.init();

    expect(store.currentType).toBe('local_storage');
    expect(store.initializationWarning).toBe('');
    expect(initSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'local_storage' }));
  });

  it('still reports a saved local directory so it can be reauthorized', async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ type: 'file_system', fileSystem: { directoryPath: '简历' } }));
    vi.spyOn(storageManager, 'init').mockResolvedValue(undefined);

    const store = useStorageStore();
    await store.init();

    expect(store.currentType).toBe('file_system');
    expect(store.hasFileSystemConfig).toBe(true);
  });

  it('falls back to browser storage when the adapter cannot initialize', async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ type: 'file_system', fileSystem: { directoryPath: '简历' } }));
    vi.spyOn(storageManager, 'init')
      .mockRejectedValueOnce(new Error('本地文件夹尚未授权'))
      .mockResolvedValue(undefined);

    const store = useStorageStore();
    await store.init();

    expect(store.currentType).toBe('local_storage');
    expect(store.initializationWarning).toContain('已回退到浏览器缓存');
    expect(store.hasFileSystemConfig).toBe(true);
  });
});

describe('LocalStorageAdapter readiness', () => {
  it('reports not ready before init', () => {
    expect(new LocalStorageAdapter().isReady()).toBe(false);
  });
});
