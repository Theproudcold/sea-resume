import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { storageManager } from '@/services/storage/StorageManager';
import type { ResumeData } from '@/types/resume';

const experience = { id: 'e', company: 'A', position: 'Dev', startDate: '', endDate: 'present', description: 'Old' };

describe('bounded automatic save scheduler', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('updates memory immediately but saves a typing burst only once', async () => {
    const store = useResumeStore();
    store.data.experiences = [{ ...experience }];
    const save = vi.spyOn(storageManager, 'save').mockResolvedValue();
    for (const text of ['新', '新内', '新内容']) {
      store.updateExperience('e', { description: text });
      expect(store.data.experiences[0]?.description).toBe(text);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].experiences[0]?.description).toBe('新内容');
    expect(store.saveStatus).toBe('saved');
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('persists continuous input at the two-second bound', async () => {
    const store = useResumeStore();
    const save = vi.spyOn(storageManager, 'save').mockResolvedValue();
    for (let i = 0; i < 10; i++) {
      store.updateBasic({ name: String(i) });
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].basic.name).toBe('9');
    expect(store.saveStatus).toBe('saved');
  });

  it('flushes the latest draft and cancels duplicate delayed writes', async () => {
    const store = useResumeStore();
    const save = vi.spyOn(storageManager, 'save').mockResolvedValue();
    store.updateBasic({ name: 'Draft' });
    await store.flushSave();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].basic.name).toBe('Draft');
    await vi.advanceTimersByTimeAsync(2500);
    await store.flushSave();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('an immediate operation includes and cancels pending text edits', async () => {
    const store = useResumeStore();
    const save = vi.spyOn(storageManager, 'save').mockResolvedValue();
    store.updateBasic({ name: 'Draft' });
    store.addExperience(experience);
    await store.flushSave();
    await vi.advanceTimersByTimeAsync(2500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].basic.name).toBe('Draft');
    expect(save.mock.calls[0]?.[0].experiences).toHaveLength(1);
  });

  it('keeps an old in-flight save from marking a newer draft as saved', async () => {
    const store = useResumeStore();
    let finish!: () => void;
    vi.spyOn(storageManager, 'save').mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; })).mockResolvedValue();
    store.updateBasic({ name: 'First' });
    await vi.advanceTimersByTimeAsync(500);
    store.updateBasic({ name: 'Second' });
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.saveStatus).toBe('saving');
    await store.flushSave();
    expect(store.saveStatus).toBe('saved');
  });

  it('coalesces queued background saves without interrupting an active write', async () => {
    const store = useResumeStore();
    let finish!: () => void;
    const saved: ResumeData[] = [];
    const save = vi.spyOn(storageManager, 'save').mockImplementation(async (data) => {
      saved.push(data);
      if (saved.length === 1) await new Promise<void>((resolve) => { finish = resolve; });
    });
    store.updateTitle('First');
    await vi.advanceTimersByTimeAsync(500);
    store.updateTitle('Second');
    await vi.advanceTimersByTimeAsync(500);
    store.updateTitle('Latest');
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    finish();
    await store.flushSave();
    expect(saved.map((data) => data.title)).toEqual(['First', 'Latest']);
    expect(store.saveStatus).toBe('saved');
  });

  it('does not discard explicit save barriers behind automatic saves', async () => {
    const store = useResumeStore();
    let finish!: () => void;
    const titles: string[] = [];
    vi.spyOn(storageManager, 'save').mockImplementation(async (data) => {
      titles.push(data.title);
      if (titles.length === 1) await new Promise<void>((resolve) => { finish = resolve; });
    });
    store.updateTitle('Active');
    await vi.advanceTimersByTimeAsync(500);
    store.updateTitle('Explicit');
    const explicit = store.autoSave();
    store.updateTitle('Final');
    await vi.advanceTimersByTimeAsync(500);
    finish();
    await explicit;
    await store.flushSave();
    expect(titles).toEqual(['Active', 'Explicit', 'Final']);
  });

  it('propagates flush failures and retries the current draft', async () => {
    const store = useResumeStore();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const save = vi.spyOn(storageManager, 'save').mockRejectedValueOnce(new Error('disk full')).mockResolvedValue();
    store.updateBasic({ name: 'Unsaved' });
    await expect(store.flushSave()).rejects.toThrow('disk full');
    expect(store.saveStatus).toBe('error');
    await store.flushSave();
    expect(save).toHaveBeenCalledTimes(2);
    expect(store.saveStatus).toBe('saved');
  });

  it('undo cancels a delayed draft so it cannot reappear on disk', async () => {
    const store = useResumeStore();
    const save = vi.spyOn(storageManager, 'save').mockResolvedValue();
    store.updateBasic({ name: 'Pending' });
    await store.undo();
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.data.basic.name).toBe('');
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].basic.name).toBe('');
  });

  it.each(['undo', 'redo', 'import'] as const)('preserves newer input when a pending %s save fails', async (operation) => {
    const store = useResumeStore();
    const save = vi.spyOn(storageManager, 'save').mockResolvedValue();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    store.updateBasic({ name: 'Before' });
    await store.flushSave();
    if (operation === 'redo') await store.undo();
    let fail!: (error: Error) => void;
    save.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
    const pending = operation === 'import'
      ? store.importData({ ...store.exportData(), basic: { ...store.data.basic, name: 'Imported' } })
      : store[operation]();
    const failure = expect(pending).rejects.toThrow('slow failure');
    await vi.advanceTimersByTimeAsync(0);
    store.updateBasic({ name: 'Typed while saving' });
    fail(new Error('slow failure'));
    await failure;
    expect(store.data.basic.name).toBe('Typed while saving');
    await store.flushSave();
    expect(save.mock.calls[save.mock.calls.length - 1]?.[0].basic.name).toBe('Typed while saving');
    expect(store.saveStatus).toBe('saved');
  });

  it('still restores the current snapshot on undo failure without subsequent edits', async () => {
    const store = useResumeStore();
    const save = vi.spyOn(storageManager, 'save').mockResolvedValue();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    store.updateBasic({ name: 'Before' });
    await store.flushSave();
    save.mockRejectedValueOnce(new Error('write failure'));
    await expect(store.undo()).rejects.toThrow('write failure');
    expect(store.data.basic.name).toBe('Before');
    expect(store.canUndo).toBe(true);
    expect(store.canRedo).toBe(false);
  });
});
