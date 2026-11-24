import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkbenchStore } from '@/stores/workbench';
import { storageManager } from '@/services/storage/StorageManager';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { normalizeResumeData } from '@/utils/resumeData';

describe('workbench job versions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setActivePinia(createPinia());
  });

  it('persists an isolated copy with job metadata and leaves the source untouched', async () => {
    const source = parseResumeMarkdown('# Alex').resume;
    source.basic.name = 'Alex';
    const adapter = storageManager.getCurrentAdapter();
    vi.spyOn(storageManager, 'read').mockImplementation(async (id) => id === source.id ? source : adapter.read(id));
    vi.spyOn(storageManager, 'save').mockImplementation((data, meta) => adapter.save(data, meta));
    vi.spyOn(storageManager, 'list').mockImplementation(() => adapter.list());
    const store = useWorkbenchStore();

    const id = await store.createJobVersion(source.id, { versionName: 'Acme 前端', company: 'Acme', position: '前端' });
    const saved = await storageManager.read(id);
    expect(id).not.toBe(source.id);
    expect(saved?.id).toBe(id);
    // 新增 baseId / baseVersion：记录分支从哪一版主干派生，用于落后检测。
    expect(saved?.jobTarget).toEqual({ versionName: 'Acme 前端', company: 'Acme', position: '前端', sourceResumeId: source.id, baseId: source.id, baseVersion: 1 });
    expect(saved?.trackId).toBe(source.id);
    expect(saved?.versionNumber).toBe(1);
    expect(saved?.basic.name).toBe('Alex');
    expect(source.jobTarget).toBeUndefined();
    expect(store.resumeList.map((resume) => resume.id)).toEqual([id]);
  });

  it('does not let a duplicated branch keep its job or track identity', async () => {
    // 复制是「另起一份」，不是「派生」：副本既不是岗位版本，也不能混进主干轨道。
    const source = parseResumeMarkdown('# Alex').resume;
    source.trackId = 'track-a';
    source.versionNumber = 2;
    source.jobTarget = { versionName: 'Acme', company: 'Acme', position: '前端', sourceResumeId: 'main', baseId: 'main', baseVersion: 2 };
    const adapter = storageManager.getCurrentAdapter();
    vi.spyOn(storageManager, 'read').mockImplementation(async (id) => id === source.id ? source : adapter.read(id));
    vi.spyOn(storageManager, 'save').mockImplementation((data, meta) => adapter.save(data, meta));
    vi.spyOn(storageManager, 'list').mockImplementation(() => adapter.list());
    const store = useWorkbenchStore();

    const id = await store.duplicateResume(source.id);
    const copy = normalizeResumeData(await storageManager.read(id));
    expect(copy?.jobTarget).toBeUndefined();
    expect(copy?.trackId).toBe(id);
    expect(copy?.versionNumber).toBe(1);
    // 原简历不受影响。
    expect(source.jobTarget?.company).toBe('Acme');
    expect(source.trackId).toBe('track-a');
  });

  it('keeps a duplicated master inside its own new track, not the source track', async () => {
    const source = parseResumeMarkdown('# Alex').resume;
    source.trackId = 'track-a';
    source.versionNumber = 3;
    const adapter = storageManager.getCurrentAdapter();
    vi.spyOn(storageManager, 'read').mockImplementation(async (id) => id === source.id ? source : adapter.read(id));
    vi.spyOn(storageManager, 'save').mockImplementation((data, meta) => adapter.save(data, meta));
    vi.spyOn(storageManager, 'list').mockImplementation(() => adapter.list());
    const store = useWorkbenchStore();

    const id = await store.duplicateResume(source.id);
    const copy = normalizeResumeData(await storageManager.read(id));
    // 副本若沿用 track-a 且版本号 +1，会被当成主干新版本，导致所有分支误报落后。
    expect(copy?.trackId).toBe(id);
    expect(copy?.versionNumber).toBe(1);
  });

  it('numbers a new master version after the latest one on its track', async () => {
    const source = parseResumeMarkdown('# Alex').resume;
    source.trackId = 'track-a';
    source.versionNumber = 3;
    const adapter = storageManager.getCurrentAdapter();
    vi.spyOn(storageManager, 'read').mockImplementation(async (id) => id === source.id ? source : adapter.read(id));
    vi.spyOn(storageManager, 'save').mockImplementation((data, meta) => adapter.save(data, meta));
    vi.spyOn(storageManager, 'list').mockResolvedValue([
      { id: source.id, title: source.title, templateId: source.templateId, createdAt: 1, updatedAt: 1, trackId: 'track-a', versionNumber: 3 },
      // 分支的版本号更大，但不能抬高主干版本号。
      { id: 'branch', title: 'Acme', templateId: source.templateId, createdAt: 1, updatedAt: 1, trackId: 'track-a', versionNumber: 9, jobTarget: { versionName: 'Acme', company: 'Acme', position: '前端', sourceResumeId: source.id } },
    ]);
    const store = useWorkbenchStore();

    const id = await store.createMasterVersion(source.id);
    const next = await storageManager.read(id);
    expect(next?.trackId).toBe('track-a');
    expect(next?.versionNumber).toBe(4);
    expect(next?.jobTarget).toBeUndefined();
  });

  it('refuses to branch a master version off a job version', async () => {
    const branch = parseResumeMarkdown('# Alex').resume;
    branch.jobTarget = { versionName: 'Acme', company: 'Acme', position: '前端', sourceResumeId: 'main' };
    vi.spyOn(storageManager, 'read').mockResolvedValue(branch);
    const store = useWorkbenchStore();
    await expect(store.createMasterVersion(branch.id)).rejects.toThrow('岗位版本');
  });
});
