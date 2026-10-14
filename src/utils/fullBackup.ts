import type { ResumeData } from '@/types/resume';
import { generateId } from '@/utils/helpers';
import { MAX_JSON_IMPORT_FILE_SIZE } from '@/utils/importLimits';

import { sanitizeResumeDataContent } from '@/utils/sanitizeResumeData';

export const FULL_BACKUP_FORMAT = 'sea-resume-full-backup' as const;
export const FULL_BACKUP_VERSION = 1 as const;
export const FULL_BACKUP_REMINDER_STORAGE_KEY = 'sea-resume_full-backup-last-success';
export const FULL_BACKUP_REMINDER_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

export interface FullBackupEnvelope {
  format: typeof FULL_BACKUP_FORMAT;
  version: typeof FULL_BACKUP_VERSION;
  resumes: ResumeData[];
}

export interface FullBackupPreviewItem {
  id: string;
  title: string;
  idConflict: boolean;
  nameConflict: boolean;
}

export interface FullBackupConflictCounts {
  total: number;
  idConflicts: number;
  nameConflicts: number;
  conflicts: number;
  conflictFree: number;
}

export interface FullBackupPreview {
  items: FullBackupPreviewItem[];
  counts: FullBackupConflictCounts;
}

export interface RestorePlanItem extends FullBackupPreviewItem {
  restoredId: string;
  restoredTitle: string;
}

export interface FullBackupRestorePlan {
  resumes: ResumeData[];
  items: RestorePlanItem[];
  counts: FullBackupConflictCounts;
}

export interface FullBackupRestoreOptions {
  /** Injectable ID source for deterministic integrations and tests. */
  generateId?: () => string;
}

export interface BackupReminderStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface FullBackupReminderStatus {
  available: boolean;
  due: boolean;
  lastSuccessfulBackupAt: string | null;
}

const MAX_BACKUP_RESUMES = 500;
const MAX_BACKUP_ARRAY_ITEMS = 500;
const MAX_BACKUP_STRING_LENGTH = 100_000;
const MAX_BACKUP_AVATAR_LENGTH = 16 * 1024 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const assertJsonSafe = (value: unknown, ancestors = new Set<object>()): void => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (value === undefined) return; // Optional object properties are omitted by JSON serialization.
  if (typeof value !== 'object') throw new Error('Full backup contains a non-JSON value.');
  if (ancestors.has(value)) throw new Error('Full backup contains a circular reference.');
  if (!Array.isArray(value) && !isRecord(value)) throw new Error('Full backup contains an unsupported object.');
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (entry === undefined) throw new Error('Full backup arrays cannot contain undefined values.');
      assertJsonSafe(entry, ancestors);
    }
  } else {
    for (const entry of Object.values(value)) assertJsonSafe(entry, ancestors);
  }
  ancestors.delete(value);
};

const requireString = (value: unknown, path: string, maxLength = MAX_BACKUP_STRING_LENGTH): void => {
  if (typeof value !== 'string') throw new Error(`Full backup field "${path}" must be a string.`);
  if (value.length > maxLength) throw new Error(`Full backup field "${path}" exceeds the size limit.`);
};

const requireStringArray = (value: unknown, path: string): void => {
  if (!Array.isArray(value) || value.length > MAX_BACKUP_ARRAY_ITEMS) {
    throw new Error(`Full backup field "${path}" must be an array with at most ${MAX_BACKUP_ARRAY_ITEMS} items.`);
  }
  value.forEach((entry, index) => requireString(entry, `${path}[${index}]`));
};

const requireOptionalString = (record: Record<string, unknown>, key: string, path: string, maxLength = MAX_BACKUP_STRING_LENGTH): void => {
  if (record[key] !== undefined) requireString(record[key], path, maxLength);
};

const requireRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`Full backup field "${path}" must be an object.`);
  return value;
};

function validateResumeData(value: unknown, index: number): asserts value is ResumeData {
  const path = `resumes[${index}]`;
  const resume = requireRecord(value, path);
  for (const field of ['id', 'title', 'templateId', 'createdAt', 'updatedAt']) {
    requireString(resume[field], `${path}.${field}`);
  }
  if (!(resume.id as string).trim()) throw new Error(`Full backup field "${path}.id" cannot be empty.`);
  if (!(resume.title as string).trim()) throw new Error(`Full backup field "${path}.title" cannot be empty.`);
  if (resume.jobTarget !== undefined) {
    const target = requireRecord(resume.jobTarget, `${path}.jobTarget`);
    for (const field of ['versionName', 'company', 'position', 'sourceResumeId']) {
      requireString(target[field], `${path}.jobTarget.${field}`);
    }
  }

  const basic = requireRecord(resume.basic, `${path}.basic`);
  for (const field of ['name', 'title', 'email', 'phone']) requireString(basic[field], `${path}.basic.${field}`);
  for (const field of ['location', 'website', 'avatar', 'birthDate', 'summary']) {
    requireOptionalString(basic, field, `${path}.basic.${field}`, field === 'avatar' ? MAX_BACKUP_AVATAR_LENGTH : MAX_BACKUP_STRING_LENGTH);
  }
  for (const field of ['showAge', 'showExperienceYears']) {
    if (basic[field] !== undefined && typeof basic[field] !== 'boolean') {
      throw new Error(`Full backup field "${path}.basic.${field}" must be a boolean.`);
    }
  }
  if (basic.iconOverrides !== undefined) {
    const overrides = requireRecord(basic.iconOverrides, `${path}.basic.iconOverrides`);
    for (const [key, entry] of Object.entries(overrides)) requireString(entry, `${path}.basic.iconOverrides.${key}`);
  }
  if (basic.customContacts !== undefined) {
    if (!Array.isArray(basic.customContacts) || basic.customContacts.length > 100) {
      throw new Error(`Full backup field "${path}.basic.customContacts" must be an array with at most 100 items.`);
    }
    basic.customContacts.forEach((entry, index) => {
      const itemPath = `${path}.basic.customContacts[${index}]`;
      const contact = requireRecord(entry, itemPath);
      for (const field of ['id', 'label', 'value', 'icon']) requireString(contact[field], `${itemPath}.${field}`);
    });
  }

  const experienceFields = ['id', 'company', 'position', 'startDate', 'endDate', 'description'];
  const educationFields = ['id', 'school', 'degree', 'major', 'startDate', 'endDate'];
  const projectFields = ['id', 'name', 'role', 'startDate', 'endDate', 'description'];
  const validateRecords = (field: string, requiredFields: string[], optionalArrays: string[] = []): void => {
    const entries = resume[field];
    if (!Array.isArray(entries) || entries.length > MAX_BACKUP_ARRAY_ITEMS) {
      throw new Error(`Full backup field "${path}.${field}" must be an array with at most ${MAX_BACKUP_ARRAY_ITEMS} items.`);
    }
    entries.forEach((entry, entryIndex) => {
      const itemPath = `${path}.${field}[${entryIndex}]`;
      const item = requireRecord(entry, itemPath);
      requiredFields.forEach((key) => requireString(item[key], `${itemPath}.${key}`));
      optionalArrays.forEach((key) => {
        if (item[key] !== undefined) requireStringArray(item[key], `${itemPath}.${key}`);
      });
    });
  };
  validateRecords('experiences', experienceFields, ['highlights']);
  validateRecords('education', educationFields);
  validateRecords('projects', projectFields, ['techStack']);
  if (!Array.isArray(resume.skills) || resume.skills.length > MAX_BACKUP_ARRAY_ITEMS) throw new Error(`Full backup field "${path}.skills" must be an array with at most ${MAX_BACKUP_ARRAY_ITEMS} items.`);
  resume.skills.forEach((entry, index) => {
    const itemPath = `${path}.skills[${index}]`;
    const item = requireRecord(entry, itemPath);
    requireString(item.id, `${itemPath}.id`);
    requireString(item.category, `${itemPath}.category`);
    requireStringArray(item.items, `${itemPath}.items`);
    if (item.level !== undefined && !['beginner', 'intermediate', 'advanced', 'expert'].includes(String(item.level))) {
      throw new Error(`Full backup field "${itemPath}.level" is invalid.`);
    }
  });

  if (!Array.isArray(resume.customBlocks) || resume.customBlocks.length > MAX_BACKUP_ARRAY_ITEMS) throw new Error(`Full backup field "${path}.customBlocks" must be an array with at most ${MAX_BACKUP_ARRAY_ITEMS} items.`);
  resume.customBlocks.forEach((entry, index) => {
    const itemPath = `${path}.customBlocks[${index}]`;
    const block = requireRecord(entry, itemPath);
    requireString(block.id, `${itemPath}.id`);
    requireString(block.title, `${itemPath}.title`);
    if (block.type !== 'text' && block.type !== 'list') throw new Error(`Full backup field "${itemPath}.type" is invalid.`);
    if (typeof block.order !== 'number' || !Number.isFinite(block.order)) {
      throw new Error(`Full backup field "${itemPath}.order" must be a finite number.`);
    }
    if (typeof block.content === 'string') return;
    if (!Array.isArray(block.content) || block.content.length > MAX_BACKUP_ARRAY_ITEMS) throw new Error(`Full backup field "${itemPath}.content" must be an array with at most ${MAX_BACKUP_ARRAY_ITEMS} items.`);
    block.content.forEach((entryValue, contentIndex) => {
      const contentPath = `${itemPath}.content[${contentIndex}]`;
      const item = requireRecord(entryValue, contentPath);
      requireString(item.id, `${contentPath}.id`);
      requireString(item.title, `${contentPath}.title`);
      requireString(item.description, `${contentPath}.description`);
      requireOptionalString(item, 'subtitle', `${contentPath}.subtitle`);
      requireOptionalString(item, 'date', `${contentPath}.date`);
    });
  });

  requireStringArray(resume.sectionOrder, `${path}.sectionOrder`);
  if (resume.hiddenSections !== undefined) requireStringArray(resume.hiddenSections, `${path}.hiddenSections`);
  const sectionTitles = requireRecord(resume.sectionTitles, `${path}.sectionTitles`);
  for (const field of ['experience', 'education', 'projects', 'skills']) {
    requireString(sectionTitles[field], `${path}.sectionTitles.${field}`);
  }
  for (const [key, entry] of Object.entries(sectionTitles)) requireString(entry, `${path}.sectionTitles.${key}`);

  const theme = requireRecord(resume.theme, `${path}.theme`);
  requireString(theme.color, `${path}.theme.color`);
  requireString(theme.fontFamily, `${path}.theme.fontFamily`);
  requireString(theme.dateFormat, `${path}.theme.dateFormat`);
  if (typeof theme.fontSize !== 'number' || !Number.isFinite(theme.fontSize)
    || typeof theme.lineHeight !== 'number' || !Number.isFinite(theme.lineHeight)
    || typeof theme.pageMargins !== 'number' || !Number.isFinite(theme.pageMargins)
    || typeof theme.displayIcons !== 'boolean') {
    throw new Error(`Full backup field "${path}.theme" is incomplete or invalid.`);
  }
  const margins = requireRecord(theme.moduleMargins, `${path}.theme.moduleMargins`);
  for (const field of ['top', 'bottom', 'left', 'right']) {
    if (typeof margins[field] !== 'number' || !Number.isFinite(margins[field])) {
      throw new Error(`Full backup field "${path}.theme.moduleMargins.${field}" must be a finite number.`);
    }
  }
}

function validateResumeArray(value: unknown, maxCount = MAX_BACKUP_RESUMES): asserts value is ResumeData[] {
  if (!Array.isArray(value) || value.length > maxCount) throw new Error(`Full backup resumes must contain at most ${maxCount} items.`);
  assertJsonSafe(value);
  value.forEach((resume, index) => validateResumeData(resume, index));
}

/** Validate the complete versioned envelope without filling in missing fields. */
export function validateFullBackupEnvelope(value: unknown): FullBackupEnvelope {
  if (!isRecord(value)) throw new Error('Full backup must be a JSON object.');
  if (value.format !== FULL_BACKUP_FORMAT) throw new Error('File is not a supported full backup format.');
  if (value.version !== FULL_BACKUP_VERSION) throw new Error(`Unsupported full backup version: ${String(value.version)}.`);
  const resumes = value.resumes;
  validateResumeArray(resumes);
  return { format: FULL_BACKUP_FORMAT, version: FULL_BACKUP_VERSION, resumes: resumes.map(sanitizeResumeDataContent) };
}

/** Build a versioned envelope after validating every resume as complete data. */
export function createFullBackup(resumes: readonly ResumeData[]): FullBackupEnvelope {
  const validatedResumes = [...resumes];
  validateResumeArray(validatedResumes);
  return { format: FULL_BACKUP_FORMAT, version: FULL_BACKUP_VERSION, resumes: validatedResumes.map(sanitizeResumeDataContent) };
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().flatMap((key) =>
      value[key] === undefined ? [] : [[key, canonicalize(value[key])]],
    ));
  }
  return value;
};

/** Serialize with recursively sorted object keys; array order is retained. */
export function serializeFullBackup(resumes: readonly ResumeData[]): string {
  return JSON.stringify(canonicalize(createFullBackup(resumes)));
}

/** Parse and validate before returning anything to a restore caller. */
export function parseFullBackup(serialized: string): FullBackupEnvelope {
  if (serialized.length > MAX_JSON_IMPORT_FILE_SIZE) throw new Error('Full backup exceeds the 20 MB size limit.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error('Full backup is not valid JSON.');
  }
  return validateFullBackupEnvelope(parsed);
}

const normalizeName = (name: string): string => name.trim().toLowerCase();

function inspectConflicts(resumes: readonly ResumeData[], existing: readonly ResumeData[]): {
  items: FullBackupPreviewItem[];
  counts: FullBackupConflictCounts;
  existingIds: Set<string>;
  existingNames: Set<string>;
} {
  const existingIds = new Set(existing.map((resume) => resume.id));
  const existingNames = new Set(existing.map((resume) => normalizeName(resume.title)));
  const seenIds = new Set(existingIds);
  const seenNames = new Set(existingNames);
  const items = resumes.map((resume) => {
    const idConflict = seenIds.has(resume.id);
    const nameConflict = seenNames.has(normalizeName(resume.title));
    seenIds.add(resume.id);
    seenNames.add(normalizeName(resume.title));
    return { id: resume.id, title: resume.title, idConflict, nameConflict };
  });
  const idConflicts = items.filter((item) => item.idConflict).length;
  const nameConflicts = items.filter((item) => item.nameConflict).length;
  const conflicts = items.filter((item) => item.idConflict || item.nameConflict).length;
  return {
    items,
    counts: { total: items.length, idConflicts, nameConflicts, conflicts, conflictFree: items.length - conflicts },
    existingIds,
    existingNames,
  };
}

/** Preview incoming resumes against current records; conflicts include duplicate incoming entries. */
export function previewFullBackup(backup: FullBackupEnvelope, existing: readonly ResumeData[]): FullBackupPreview {
  const validatedBackup = validateFullBackupEnvelope(backup);
  validateResumeArray(existing, Number.MAX_SAFE_INTEGER);
  const { items, counts } = inspectConflicts(validatedBackup.resumes, existing);
  return { items, counts };
}

/** Plan a restore without mutating input or overwriting any existing/planned ID. */
export function planFullBackupRestore(
  backup: FullBackupEnvelope,
  existing: readonly ResumeData[],
  options: FullBackupRestoreOptions = {},
): FullBackupRestorePlan {
  const validatedBackup = validateFullBackupEnvelope(backup);
  validateResumeArray(existing, Number.MAX_SAFE_INTEGER);
  const inspected = inspectConflicts(validatedBackup.resumes, existing);
  const protectedIds = new Set([
    ...inspected.existingIds,
    ...validatedBackup.resumes.map((resume) => resume.id),
  ]);
  const usedNames = new Set([
    ...inspected.existingNames,
    ...validatedBackup.resumes.map((resume) => normalizeName(resume.title)),
  ]);
  const nextId = options.generateId ?? generateId;
  const items: RestorePlanItem[] = [];
  const resumes = validatedBackup.resumes.map((resume, index) => {
    const preview = inspected.items[index]!;
    const hasConflict = preview.idConflict || preview.nameConflict;
    let restoredId = resume.id;
    let restoredTitle = resume.title;
    if (hasConflict) {
      const generatedBase = nextId() || 'restored-resume';
      restoredId = generatedBase;
      let idSuffix = 1;
      while (protectedIds.has(restoredId)) restoredId = `${generatedBase}-${idSuffix++}`;
      protectedIds.add(restoredId);

      const titleBase = `${resume.title} (Restored)`;
      restoredTitle = titleBase;
      let titleSuffix = 2;
      while (usedNames.has(normalizeName(restoredTitle))) restoredTitle = `${resume.title} (Restored ${titleSuffix++})`;
    }
    usedNames.add(normalizeName(restoredTitle));
    items.push({ ...preview, restoredId, restoredTitle });
    return hasConflict ? { ...resume, id: restoredId, title: restoredTitle } : resume;
  });
  return { resumes, items, counts: inspected.counts };
}

const asTimestamp = (value: Date | number): number => value instanceof Date ? value.getTime() : value;

/** Pure 30-day policy: missing or invalid timestamps are due; future timestamps are not. */
export function isFullBackupReminderDue(
  lastSuccessfulBackupAt: string | null | undefined,
  now: Date | number = Date.now(),
): boolean {
  const nowTimestamp = asTimestamp(now);
  if (!Number.isFinite(nowTimestamp)) throw new RangeError('Current time must be a valid timestamp.');
  if (!lastSuccessfulBackupAt) return true;
  const lastTimestamp = Date.parse(lastSuccessfulBackupAt);
  return !Number.isFinite(lastTimestamp) || nowTimestamp - lastTimestamp >= FULL_BACKUP_REMINDER_INTERVAL_MS;
}

function resolveReminderStorage(storage?: BackupReminderStorage | null): BackupReminderStorage | null {
  if (storage !== undefined) return storage;
  try {
    const candidate = globalThis.localStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

/** Read reminder state only; unavailable storage never starts or triggers a backup. */
export function getFullBackupReminderStatus(
  storage?: BackupReminderStorage | null,
  now: Date | number = Date.now(),
): FullBackupReminderStatus {
  const availableStorage = resolveReminderStorage(storage);
  if (!availableStorage) return { available: false, due: false, lastSuccessfulBackupAt: null };
  try {
    const lastSuccessfulBackupAt = availableStorage.getItem(FULL_BACKUP_REMINDER_STORAGE_KEY);
    return {
      available: true,
      due: isFullBackupReminderDue(lastSuccessfulBackupAt, now),
      lastSuccessfulBackupAt,
    };
  } catch {
    return { available: false, due: false, lastSuccessfulBackupAt: null };
  }
}

/** Record the timestamp only after the caller has completed a backup successfully. */
export function recordFullBackupSuccess(
  storage?: BackupReminderStorage | null,
  now: Date | number = Date.now(),
): boolean {
  const availableStorage = resolveReminderStorage(storage);
  const timestamp = asTimestamp(now);
  if (!availableStorage || !Number.isFinite(timestamp)) return false;
  try {
    availableStorage.setItem(FULL_BACKUP_REMINDER_STORAGE_KEY, new Date(timestamp).toISOString());
    return true;
  } catch {
    return false;
  }
}
