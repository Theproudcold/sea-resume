import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResumeData, ResumeMeta } from '@/types/resume';
import { LocalStorageAdapter } from '../LocalStorageAdapter';

const INDEX_KEY = 'sea-resume_index';
const RESUME_KEY = 'sea-resume_resume_resume-1';
const data = (title: string): ResumeData => ({ id: 'resume-1', title } as unknown as ResumeData);
const meta = (title: string): ResumeMeta => ({
  id: 'resume-1', title, templateId: 'modern', createdAt: 1, updatedAt: 1,
});

const adapter = () => new LocalStorageAdapter();

afterEach(() => vi.restoreAllMocks());

describe('LocalStorageAdapter integrity', () => {
  it('refuses to save when the existing index is malformed', async () => {
    localStorage.setItem(INDEX_KEY, '{broken');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(adapter().save(data('New title'), meta('New title'))).rejects.toThrow('索引');
    expect(localStorage.getItem(RESUME_KEY)).toBeNull();
    expect(localStorage.getItem(INDEX_KEY)).toBe('{broken');
    log.mockRestore();
  });

  it('rolls back an updated resume when committing the index fails', async () => {
    const previous = data('Original title');
    localStorage.setItem(RESUME_KEY, JSON.stringify(previous));
    localStorage.setItem(INDEX_KEY, JSON.stringify([meta('Original title')]));
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === INDEX_KEY) throw new DOMException('Storage full', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(adapter().save(data('Updated title'), meta('Updated title'))).rejects.toThrow('存储空间不足');
    expect(JSON.parse(localStorage.getItem(RESUME_KEY) || '{}')).toEqual(previous);
    expect(JSON.parse(localStorage.getItem(INDEX_KEY) || '[]')).toEqual([meta('Original title')]);
  });

  it('removes a newly written resume when the index commit fails', async () => {
    localStorage.setItem(INDEX_KEY, '[]');
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === INDEX_KEY) throw new DOMException('Storage full', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(adapter().save(data('New title'), meta('New title'))).rejects.toThrow('存储空间不足');
    expect(localStorage.getItem(RESUME_KEY)).toBeNull();
    expect(localStorage.getItem(INDEX_KEY)).toBe('[]');
  });

  it('restores the resume detail if deletion cannot commit the index', async () => {
    const previous = data('Keep this');
    localStorage.setItem(RESUME_KEY, JSON.stringify(previous));
    localStorage.setItem(INDEX_KEY, JSON.stringify([meta('Keep this')]));
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === INDEX_KEY) throw new DOMException('Storage full', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(adapter().delete('resume-1')).rejects.toThrow('Storage full');
    expect(JSON.parse(localStorage.getItem(RESUME_KEY) || '{}')).toEqual(previous);
    expect(JSON.parse(localStorage.getItem(INDEX_KEY) || '[]')).toEqual([meta('Keep this')]);
  });
});
