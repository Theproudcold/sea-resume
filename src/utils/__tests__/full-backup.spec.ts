import { describe, expect, it } from 'vitest';
import { templateDemoData } from '@/data/template-demo';
import type { ResumeData } from '@/types/resume';
import { validateResumeData } from '@/utils/export-json';
import {
  FULL_BACKUP_REMINDER_INTERVAL_MS,
  FULL_BACKUP_REMINDER_STORAGE_KEY,
  createFullBackup,
  getFullBackupReminderStatus,
  isFullBackupReminderDue,
  parseFullBackup,
  planFullBackupRestore,
  previewFullBackup,
  recordFullBackupSuccess,
  serializeFullBackup,
  type BackupReminderStorage,
} from '@/utils/fullBackup';

const makeResume = (id: string, title: string): ResumeData => ({
  ...templateDemoData,
  id,
  title,
  basic: { ...templateDemoData.basic },
  experiences: [...templateDemoData.experiences],
  education: [...templateDemoData.education],
  skills: [...templateDemoData.skills],
  projects: [...templateDemoData.projects],
  customBlocks: [...templateDemoData.customBlocks],
  sectionOrder: [...templateDemoData.sectionOrder],
  sectionTitles: { ...templateDemoData.sectionTitles },
  theme: { ...templateDemoData.theme, moduleMargins: { ...templateDemoData.theme.moduleMargins } },
});

class MemoryStorage implements BackupReminderStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('full backup data layer', () => {
  it('round-trips a versioned backup with deterministic serialization', () => {
    const resumes = [makeResume('resume-1', 'First'), makeResume('resume-2', 'Second')];
    resumes[0]!.jobTarget = { versionName: 'First for Acme', company: 'Acme', position: 'Engineer', sourceResumeId: 'source-id' };
    const serialized = serializeFullBackup(resumes);

    expect(serializeFullBackup(resumes)).toBe(serialized);
    expect(parseFullBackup(serialized)).toEqual(createFullBackup(resumes));
    expect(parseFullBackup(serialized).resumes[0]?.jobTarget).toEqual(resumes[0]?.jobTarget);
    expect(JSON.parse(serialized)).toMatchObject({ format: 'sea-resume-full-backup', version: 1 });
  });

  it('rejects malformed, incomplete, and unsupported backup data', () => {
    expect(() => parseFullBackup('{broken')).toThrow();
    expect(() => parseFullBackup(JSON.stringify({ format: 'sea-resume-full-backup', version: 1, resumes: [null] }))).toThrow();
    expect(() => parseFullBackup(JSON.stringify({
      format: 'sea-resume-full-backup', version: 1, resumes: [{ id: 'partial', title: 'Incomplete' }],
    }))).toThrow();
    expect(() => parseFullBackup(JSON.stringify({ format: 'sea-resume-full-backup', version: 2, resumes: [] }))).toThrow(/version/i);
  });
  it('accepts normalized older stored resumes with deprecated theme and custom-block fields', () => {
    const legacy = {
      ...makeResume('legacy-id', 'Legacy resume'),
      theme: {
        color: '#2563eb', fontFamily: 'sans-serif', fontSize: 14, lineHeight: 1.5,
        spacing: 24, displayIcons: true,
      },
      customBlocks: [{ id: 'legacy-block', title: 'Legacy timeline', type: 'timeline', content: '<p>Old content</p>', order: 0 }],
    };
    const normalized = validateResumeData(legacy);

    expect(normalized.theme.moduleMargins).toEqual({ top: 0, bottom: 24, left: 0, right: 0 });
    expect(normalized.customBlocks[0]?.type).toBe('text');
    expect(() => createFullBackup([normalized])).not.toThrow();
  });

  it('previews ID and case-insensitive title conflicts and reports counts', () => {
    const backup = createFullBackup([
      makeResume('existing-id', 'Incoming ID conflict'),
      makeResume('new-id', 'Existing title'),
      makeResume('clean-id', 'Clean title'),
    ]);
    const existing = [
      makeResume('existing-id', 'Something else'),
      makeResume('another-id', 'existing TITLE'),
    ];

    const preview = previewFullBackup(backup, existing);
    expect(preview.items.map(({ idConflict, nameConflict }) => [idConflict, nameConflict])).toEqual([
      [true, false], [false, true], [false, false],
    ]);
    expect(preview.counts).toEqual({ total: 3, idConflicts: 1, nameConflicts: 1, conflicts: 2, conflictFree: 1 });
  });

  it('plans fresh IDs and distinct titles for conflicts while preserving non-conflicting IDs', () => {
    const backup = createFullBackup([
      makeResume('taken-id', 'ID conflict'),
      makeResume('free-id', 'Duplicate title'),
      makeResume('source-title-id', 'ID conflict (Restored)'),
      makeResume('preserved-id', 'Unique title'),
    ]);
    const existing = [makeResume('taken-id', 'Taken'), makeResume('other-id', 'Duplicate title')];
    const plan = planFullBackupRestore(backup, existing, { generateId: () => 'taken-id' });

    expect(plan.resumes.map(({ id }) => id)).toEqual(['taken-id-1', 'taken-id-2', 'source-title-id', 'preserved-id']);
    expect(plan.resumes.map(({ title }) => title)).toEqual([
      'ID conflict (Restored 2)', 'Duplicate title (Restored)', 'ID conflict (Restored)', 'Unique title',
    ]);
    expect(new Set([...existing.map(({ id }) => id), ...plan.resumes.map(({ id }) => id)]).size).toBe(6);
    expect(plan.items.map(({ idConflict, nameConflict }) => [idConflict, nameConflict])).toEqual([
      [true, false], [false, true], [false, false], [false, false],
    ]);
    expect(backup.resumes[0]?.id).toBe('taken-id');
  });

  it('applies the 30-day reminder threshold and records successful backups only', () => {
    const now = Date.UTC(2026, 0, 31);
    const lastMonth = new Date(now - FULL_BACKUP_REMINDER_INTERVAL_MS).toISOString();
    const storage = new MemoryStorage();

    expect(isFullBackupReminderDue(null, now)).toBe(true);
    expect(isFullBackupReminderDue(new Date(now - FULL_BACKUP_REMINDER_INTERVAL_MS + 1).toISOString(), now)).toBe(false);
    expect(isFullBackupReminderDue(lastMonth, now)).toBe(true);
    expect(getFullBackupReminderStatus(storage, now)).toMatchObject({ available: true, due: true });
    expect(recordFullBackupSuccess(storage, now)).toBe(true);
    expect(storage.getItem(FULL_BACKUP_REMINDER_STORAGE_KEY)).toBe(new Date(now).toISOString());
    expect(getFullBackupReminderStatus(storage, now)).toMatchObject({ available: true, due: false });
    expect(getFullBackupReminderStatus(null, now)).toEqual({ available: false, due: false, lastSuccessfulBackupAt: null });
    expect(recordFullBackupSuccess(null, now)).toBe(false);
  });
});
