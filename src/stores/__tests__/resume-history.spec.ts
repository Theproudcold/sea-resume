import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useResumeStore } from '@/stores/resume';
import { storageManager } from '@/services/storage/StorageManager';
import type { ResumeData, ResumeMeta } from '@/types/resume';

describe('resume editor history and save feedback', () => {
    vi.restoreAllMocks();
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('saves edits, persists undo/redo, and can reload the saved state', async () => {
    const store = useResumeStore();
    store.updateBasic({ name: 'Ada Lovelace' });
    expect(store.saveStatus).toBe('saving');
    await vi.advanceTimersByTimeAsync(500);
    expect(store.saveStatus).toBe('saved');
    const id = store.data.id;
    expect((await storageManager.read(id))?.basic.name).toBe('Ada Lovelace');

    await store.undo();
    expect(store.data.basic.name).toBe('');
    expect((await storageManager.read(id))?.basic.name).toBe('');
    await store.redo();
    expect(store.data.basic.name).toBe('Ada Lovelace');
    const reloaded = useResumeStore();
    await reloaded.loadResume(id);
    expect(reloaded.data.basic.name).toBe('Ada Lovelace');
  });

  it('restores project, experience, theme, and section order snapshots', async () => {
    const store = useResumeStore();
    store.data.experiences = [{ id: 'e', company: 'A', position: 'Dev', startDate: '', endDate: 'present', description: 'Old work' }];
    store.data.projects = [{ id: 'p', name: 'Old project', role: 'Dev', startDate: '', endDate: 'present', description: 'Old detail' }];

    store.updateExperience('e', { description: 'New work' });
    vi.setSystemTime(Date.now() + 701);
    store.updateProject('p', { name: 'New project' });
    vi.setSystemTime(Date.now() + 701);
    const contentBeforeThemeChange = JSON.stringify({ experiences: store.data.experiences, projects: store.data.projects });
    store.updateTheme({ fontSize: 12 });
    vi.setSystemTime(Date.now() + 701);
    store.updateSectionOrder(['projects', 'experience']);
    expect(JSON.stringify({ experiences: store.data.experiences, projects: store.data.projects })).toBe(contentBeforeThemeChange);

    await store.undo();
    expect(store.data.sectionOrder).toEqual(['experience', 'projects', 'education', 'skills']);
    await store.undo();
    expect(store.data.theme.fontSize).toBe(14);
    await store.undo();
    expect(store.data.projects[0]?.name).toBe('Old project');
    await store.undo();
    expect(store.data.experiences[0]?.description).toBe('Old work');
  });

  it('shows save failure and offers a working retry', async () => {
    const store = useResumeStore();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const save = vi.spyOn(storageManager, 'save').mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce();
    await expect(store.retrySave()).rejects.toThrow('disk full');
    expect(store.saveStatus).toBe('error');
    expect(store.saveError).toBe('disk full');
    await store.retrySave();
    expect(store.saveStatus).toBe('saved');
    expect(save).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it('surfaces immediate section-save failures without an unhandled rejection', async () => {
    const store = useResumeStore();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(storageManager, 'save').mockRejectedValue(new Error('file write failed'));

    store.addExperience({ company: 'A', position: 'Engineer', startDate: '', endDate: 'present', description: 'Work' });
    expect(store.saveStatus).toBe('saving');
    await vi.advanceTimersByTimeAsync(0);
    expect(store.saveStatus).toBe('error');
    expect(store.saveError).toBe('file write failed');
  });
  it('flushes a pending edit before switching resumes and isolates undo history', async () => {
    const store = useResumeStore();
    store.createNew('First resume');
    store.data.basic.name = 'Original';
    const first = store.exportData();
    const makeMeta = (data: typeof first): ResumeMeta => ({
      id: data.id,
      title: data.title,
      templateId: data.templateId,
      createdAt: Date.parse(data.createdAt),
      updatedAt: Date.parse(data.updatedAt),
    });
    await storageManager.save(first, makeMeta(first));

    store.createNew('Second resume');
    const second = store.exportData();
    await storageManager.save(second, makeMeta(second));
    await store.loadResume(first.id);
    store.updateBasic({ name: 'Pending first-resume edit' });
    await store.loadResume(second.id);

    expect((await storageManager.read(first.id))?.basic.name).toBe('Pending first-resume edit');
    expect(store.data.id).toBe(second.id);
    expect(store.canUndo).toBe(false);
    await store.undo();
    expect(store.data.id).toBe(second.id);
  });
  it('ignores an older resume load that finishes after a newer request', async () => {
    const store = useResumeStore();
    const slowResume = { ...store.exportData(), id: 'slow-resume', title: 'Slow resume' };
    const fastResume = { ...store.exportData(), id: 'fast-resume', title: 'Fast resume' };
    let resolveSlow!: (resume: ResumeData | null) => void;
    let resolveFast!: (resume: ResumeData | null) => void;
    const read = vi.spyOn(storageManager, 'read').mockImplementation((id) => new Promise((resolve) => {
      if (id === 'slow-resume') resolveSlow = resolve;
      else resolveFast = resolve;
    }));

    try {
      const slowLoad = store.loadResume('slow-resume');
      const fastLoad = store.loadResume('fast-resume');
      resolveFast(fastResume);
      await fastLoad;
      resolveSlow(slowResume);
      await slowLoad;

      expect(store.data.id).toBe('fast-resume');
      expect(store.isLoading).toBe(false);
    } finally {
      read.mockRestore();
    }
  });

  it('resets and persists the current resume without changing its ID, and reset is undoable', async () => {
    const store = useResumeStore();
    store.createNew('Reset candidate');
    store.data.basic.name = 'Ada';
    const resume = store.exportData();
    await storageManager.save(resume, {
      id: resume.id,
      title: resume.title,
      templateId: resume.templateId,
      createdAt: Date.parse(resume.createdAt),
      updatedAt: Date.parse(resume.updatedAt),
    });

    store.reset();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.data.id).toBe(resume.id);
    expect(store.data.title).toBe('Reset candidate');
    expect((await storageManager.read(resume.id))?.basic.name).toBe('');
    expect((await storageManager.list()).map(({ id }) => id)).toEqual([resume.id]);

    await store.undo();
    expect(store.data.basic.name).toBe('Ada');
    expect(store.data.id).toBe(resume.id);
  });
});
