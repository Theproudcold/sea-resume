import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkbenchStore } from '@/stores/workbench';
import { storageManager } from '@/services/storage/StorageManager';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';

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
    expect(saved?.jobTarget).toEqual({ versionName: 'Acme 前端', company: 'Acme', position: '前端', sourceResumeId: source.id });
    expect(saved?.basic.name).toBe('Alex');
    expect(source.jobTarget).toBeUndefined();
    expect(store.resumeList.map((resume) => resume.id)).toEqual([id]);
  });
});
