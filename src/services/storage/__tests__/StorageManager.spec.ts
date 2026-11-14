import { beforeEach, describe, expect, it } from 'vitest';
import { storageManager } from '@/services/storage/StorageManager';

const LEGACY_KEY = 'sea-resume_resume_legacy-resume';

describe('StorageManager read normalization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('repairs legacy resumes that were stored without a theme', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({
      id: 'legacy-resume',
      title: '旧简历',
      basic: { name: '张三', title: '', email: '', phone: '' },
      experiences: [],
      education: [],
      skills: [],
      projects: [],
      customBlocks: [],
      templateId: 'modern',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }));

    const resume = await storageManager.read('legacy-resume');

    expect(resume).not.toBeNull();
    expect(resume?.theme.displayIcons).toBe(true);
    expect(resume?.theme.moduleMargins).toEqual({ top: 0, bottom: 24, left: 0, right: 0 });
    expect(resume?.sectionTitles.experience).toBe('工作经历');
    expect(resume?.basic.name).toBe('张三');
  });

  it('returns null for a missing resume', async () => {
    await expect(storageManager.read('missing')).resolves.toBeNull();
  });
});
