import { describe, expect, it } from 'vitest';
import { templateDemoData } from '@/data/template-demo';
import { builtinToRecipe } from '@/utils/layout-template';
import type { ResumeData } from '@/types/resume';
import { validateResumeData } from '@/utils/export-json';
import {
  FULL_BACKUP_FORMAT,
  FULL_BACKUP_VERSION,
  FULL_BACKUP_REMINDER_INTERVAL_MS,
  FULL_BACKUP_REMINDER_STORAGE_KEY,
  createFullBackup,
  dismissFullBackupReminder,
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

  it('round-trips the avatar shape and drops unknown shapes instead of failing the restore', () => {
    const resume = makeResume('resume-shape', 'Shape');
    resume.basic.avatarShape = 'square';

    expect(parseFullBackup(serializeFullBackup([resume])).resumes[0]?.basic.avatarShape).toBe('square');

    // 未知取值属于「未知字段」：渲染层会回落到圆形，不该让整份备份无法恢复。
    const tampered = JSON.parse(serializeFullBackup([resume])) as { resumes: Array<{ basic: Record<string, unknown> }> };
    tampered.resumes[0]!.basic.avatarShape = 'triangle';
    expect(parseFullBackup(JSON.stringify(tampered)).resumes[0]?.basic.avatarShape).toBeUndefined();

    // 类型错误仍是结构损坏，照旧拒绝。
    tampered.resumes[0]!.basic.avatarShape = 42;
    expect(() => parseFullBackup(JSON.stringify(tampered))).toThrow(/avatarShape/);
  });

  it('round-trips a layout recipe and rejects an unknown layout version', () => {
    const resume = makeResume('resume-layout', 'Layout');
    resume.layout = builtinToRecipe('tech', resume.theme);
    expect(parseFullBackup(serializeFullBackup([resume])).resumes[0]?.layout?.paper).toBe('dark');

    const tampered = JSON.parse(serializeFullBackup([resume])) as { resumes: Array<{ layout: { schemaVersion: number } }> };
    tampered.resumes[0]!.layout.schemaVersion = 2;
    expect(() => parseFullBackup(JSON.stringify(tampered))).toThrow(/layout/);
  });

  it('rejects malformed, incomplete, and unsupported backup data', () => {
    expect(() => parseFullBackup('{broken')).toThrow();
    expect(() => parseFullBackup(JSON.stringify({ format: 'sea-resume-full-backup', version: 1, resumes: [null] }))).toThrow();
    expect(() => parseFullBackup(JSON.stringify({
      format: 'sea-resume-full-backup', version: 1, resumes: [{ id: 'partial', title: 'Incomplete' }],
    }))).toThrow();
    expect(() => parseFullBackup(JSON.stringify({ format: 'sea-resume-full-backup', version: 2, resumes: [] }))).toThrow(/version/i);
  });
  it('fills default module margins when an older theme omits them and treats string custom blocks as text', () => {
    const legacy = {
      ...makeResume('legacy-id', 'Legacy resume'),
      theme: {
        color: '#2563eb', fontFamily: 'sans-serif', fontSize: 14, lineHeight: 1.5,
        spacing: 8, displayIcons: true,
      },
      customBlocks: [{ id: 'legacy-block', title: 'Legacy timeline', type: 'timeline', content: '<p>Old content</p>', order: 0 }],
    };
    const normalized = validateResumeData(legacy);

    // spacing 不参与迁移；缺 moduleMargins 时下边距就是默认值 24。
    expect(normalized.theme.moduleMargins).toEqual({ top: 0, bottom: 24, left: 0, right: 0 });
    expect(normalized.theme).not.toHaveProperty('spacing');
    expect(normalized.customBlocks[0]?.type).toBe('text');
    expect(() => createFullBackup([normalized])).not.toThrow();
  });

  it('sanitizes untrusted backup content without dropping resume visibility fields', () => {
    const unsafe = JSON.parse(JSON.stringify(makeResume('unsafe', 'Unsafe resume'))) as ResumeData;
    unsafe.basic.summary = '<p>Safe <strong>summary</strong></p><img src=x onerror=alert(1)><script>alert(2)</script><a href="javascript:alert(3)">bad link</a>';
    unsafe.basic.website = 'javascript:alert(1)';
    unsafe.basic.avatar = 'https://tracker.example/pixel.png';
    unsafe.experiences = [{ id: 'exp-1', company: 'Acme', position: 'Dev', startDate: '', endDate: '', description: '<img src=x onerror=alert(1)><p>Work</p>', visible: false }];
    unsafe.projects = [{ id: 'project-1', name: 'Project', role: 'Dev', startDate: '', endDate: '', description: '<p>Project</p>', link: 'javascript:alert(1)' }];
    unsafe.customBlocks = [{
      id: 'block-1', title: 'Awards', type: 'list', order: 0,
      content: [{ id: 'item-1', title: 'Award', description: '<svg onload=alert(1)></svg><p>Custom text</p>', visible: false }],
    }];

    const parsed = parseFullBackup(JSON.stringify({
      format: FULL_BACKUP_FORMAT, version: FULL_BACKUP_VERSION, resumes: [unsafe],
    }));
    const safe = parsed.resumes[0]!;
    expect(safe.basic.summary).toContain('<strong>summary</strong>');
    expect(safe.basic.summary).not.toMatch(/<script|<img|onerror|javascript:/i);
    expect(safe.basic.website).toBeUndefined();
    expect(safe.basic.avatar).toBeUndefined();
    expect(safe.experiences[0]?.description).not.toMatch(/<img|onerror/i);
    expect(safe.experiences[0]?.visible).toBe(false);
    expect(safe.projects[0]?.link).toBeUndefined();
    const customItems = safe.customBlocks[0]?.content;
    expect(Array.isArray(customItems)).toBe(true);
    if (Array.isArray(customItems)) {
      expect(customItems[0]?.description).not.toMatch(/<svg|onload/i);
      expect(customItems[0]?.visible).toBe(false);
    }
  });

  it('rejects oversized backup strings and record arrays', () => {
    const oversizedText = JSON.parse(JSON.stringify(makeResume('large-text', 'Large'))) as ResumeData;
    oversizedText.title = 'x'.repeat(100_001);
    expect(() => createFullBackup([oversizedText])).toThrow(/size limit/i);

    const oversizedArray = JSON.parse(JSON.stringify(makeResume('large-array', 'Large'))) as ResumeData;
    oversizedArray.skills = Array.from({ length: 501 }, (_, index) => ({ id: `skill-${index}`, category: 'Skills', items: [] }));
    expect(() => createFullBackup([oversizedArray])).toThrow(/array with at most/i);
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
    const pending = new MemoryStorage();
    expect(dismissFullBackupReminder(pending, now)).toBe(true);
    expect(getFullBackupReminderStatus(pending, now + FULL_BACKUP_REMINDER_INTERVAL_MS - 1).due).toBe(false);
    expect(getFullBackupReminderStatus(pending, now + FULL_BACKUP_REMINDER_INTERVAL_MS).due).toBe(true);
  });
});
