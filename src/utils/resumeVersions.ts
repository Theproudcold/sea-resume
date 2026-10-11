import type { ResumeData } from '@/types/resume';
import { generateId } from '@/utils/helpers';

export interface JobTarget {
  versionName: string;
  company: string;
  position: string;
  sourceResumeId: string;
}

export type ResumeDifferenceType = 'added' | 'removed' | 'modified';
export type ResumePathSegment = string | number;

export interface ResumeDifference {
  id: string;
  section: string;
  item: string;
  field: string;
  before: string;
  after: string;
  type: ResumeDifferenceType;
  scope: 'field' | 'item';
  beforePath?: ResumePathSegment[];
  afterPath?: ResumePathSegment[];
}

interface DifferenceLocation {
  scope?: 'field' | 'item';
  beforePath?: ResumePathSegment[];
  afterPath?: ResumePathSegment[];
}

interface FieldDefinition {
  key: string;
  label: string;
  unordered?: boolean;
  format?: (value: unknown) => string;
}

interface RecordDefinition {
  identityFields: string[][];
  fields: FieldDefinition[];
  itemLabel: (record: Record<string, unknown>) => string;
}

interface RecordPair {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  beforeIndex?: number;
  afterIndex?: number;
}

type ResumeRecord = Record<string, unknown>;

export function createJobResumeVersion(
  source: ResumeData,
  target: Omit<JobTarget, 'sourceResumeId'>,
  id = generateId(),
): ResumeData {
  const copy = JSON.parse(JSON.stringify(source)) as ResumeData;
  const now = new Date().toISOString();
  return {
    ...copy,
    id,
    title: target.versionName.trim() || `${source.title} - ${target.position.trim() || '岗位版本'}`,
    jobTarget: {
      versionName: target.versionName.trim() || `${source.title} - ${target.position.trim() || '岗位版本'}`,
      company: target.company.trim(),
      position: target.position.trim(),
      sourceResumeId: source.id,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    }
    if (entity.startsWith('#')) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function readableText(value: string): string {
  return decodeHtmlEntities(value
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li(?:\s[^>]*)?>/gi, '• ')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<\/\s*(?:p|div|blockquote|h[1-6]|ul|ol|pre)\s*>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, ''))
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return readableText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (entry && typeof entry === 'object') {
        const record = entry as ResumeRecord;
        return ['title', 'subtitle', 'date', 'description', 'label', 'value']
          .map((key) => formatValue(record[key]))
          .filter(Boolean)
          .join(' · ');
      }
      return formatValue(entry);
    }).filter(Boolean).join('\n');
  }
  return '';
}

function formatDate(value: unknown): string {
  const text = formatValue(value);
  return text === 'present' ? '至今' : text;
}

function normalizedIdentity(value: unknown): string {
  return formatValue(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function asRecords(value: unknown): ResumeRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ResumeRecord => !!entry && typeof entry === 'object' && !Array.isArray(entry));
}

function identityKey(record: ResumeRecord, fields: string[]): string | null {
  const values = fields.map((field) => normalizedIdentity(record[field]));
  if (values.some((value) => !value)) return null;
  return values.join('\u001f');
}

function countIdentities(records: ResumeRecord[], fields: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  records.forEach((record) => {
    const key = identityKey(record, fields);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

function pairRecords(
  beforeRecords: ResumeRecord[],
  afterRecords: ResumeRecord[],
  identityFields: string[][],
): RecordPair[] {
  const remainingAfter = new Set(afterRecords.map((_record, index) => index));
  const identityCounts = identityFields.map((fields) => ({
    before: countIdentities(beforeRecords, fields),
    after: countIdentities(afterRecords, fields),
    fields,
  }));
  const pairs: RecordPair[] = [];

  beforeRecords.forEach((before, beforeIndex) => {
    const beforeId = normalizedIdentity(before.id);
    let matchedIndex = beforeId
      ? [...remainingAfter].find((index) => normalizedIdentity(afterRecords[index]?.id) === beforeId)
      : undefined;

    if (matchedIndex === undefined) {
      for (const identity of identityCounts) {
        const key = identityKey(before, identity.fields);
        if (!key || identity.before.get(key) !== 1 || identity.after.get(key) !== 1) continue;
        matchedIndex = [...remainingAfter].find((index) => identityKey(afterRecords[index] ?? {}, identity.fields) === key);
        if (matchedIndex !== undefined) break;
      }
    }

    if (matchedIndex === undefined) {
      pairs.push({ before, beforeIndex });
    } else {
      remainingAfter.delete(matchedIndex);
      pairs.push({ before, after: afterRecords[matchedIndex], beforeIndex, afterIndex: matchedIndex });
    }
  });

  remainingAfter.forEach((afterIndex) => pairs.push({ after: afterRecords[afterIndex], afterIndex }));
  return pairs;
}

function makeItemLabel(record: ResumeRecord, fields: string[]): string {
  const label = fields.map((field) => formatValue(record[field])).filter(Boolean).join(' · ');
  return label || '未命名条目';
}

function formatRecord(record: ResumeRecord, fields: FieldDefinition[]): string {
  const lines = fields.map((field) => {
    const value = (field.format ?? formatValue)(record[field.key]);
    return value ? `${field.label}：${value}` : '';
  }).filter(Boolean);
  return lines.join('\n') || '（空条目）';
}

function pushDifference(
  differences: ResumeDifference[],
  section: string,
  item: string,
  field: string,
  beforeValue: unknown,
  afterValue: unknown,
  forcedType?: ResumeDifferenceType,
  format: (value: unknown) => string = formatValue,
  unordered = false,
  location: DifferenceLocation = {},
): void {
  const before = format(beforeValue);
  const after = format(afterValue);
  if (before === after) return;
  const comparableBefore = unordered ? before.split('\n').map((line) => line.trim()).sort().join('\n') : before;
  const comparableAfter = unordered ? after.split('\n').map((line) => line.trim()).sort().join('\n') : after;
  if (comparableBefore === comparableAfter) return;
  const type = forcedType ?? (!before ? 'added' : !after ? 'removed' : 'modified');
  const beforePath = location.beforePath ? [...location.beforePath] : undefined;
  const afterPath = location.afterPath ? [...location.afterPath] : undefined;
  const id = [section, field, JSON.stringify(beforePath ?? null), JSON.stringify(afterPath ?? null)].join(':');
  differences.push({
    id,
    section,
    item,
    field,
    before,
    after,
    type,
    scope: location.scope ?? 'field',
    ...(beforePath ? { beforePath } : {}),
    ...(afterPath ? { afterPath } : {}),
  });
}

function compareRecordList(
  differences: ResumeDifference[],
  beforeValue: unknown,
  afterValue: unknown,
  section: string,
  definition: RecordDefinition,
  beforeListPath: ResumePathSegment[],
  afterListPath: ResumePathSegment[] = beforeListPath,
): void {
  const beforeRecords = asRecords(beforeValue);
  const afterRecords = asRecords(afterValue);
  const pairs = pairRecords(beforeRecords, afterRecords, definition.identityFields);

  pairs.forEach(({ before, after, beforeIndex, afterIndex }) => {
    const record = after ?? before ?? {};
    const item = definition.itemLabel(record);
    if (before && after && beforeIndex !== undefined && afterIndex !== undefined) {
      definition.fields.forEach((field) => {
        const format = field.format ?? formatValue;
        pushDifference(
          differences,
          section,
          item,
          field.label,
          before[field.key],
          after[field.key],
          undefined,
          format,
          field.unordered,
          {
            beforePath: [...beforeListPath, beforeIndex, field.key],
            afterPath: [...afterListPath, afterIndex, field.key],
          },
        );
      });
      return;
    }

    const beforeRecordPath = beforeIndex !== undefined ? [...beforeListPath, beforeIndex] : undefined;
    const afterRecordPath = afterIndex !== undefined ? [...afterListPath, afterIndex] : undefined;
    const added = !before && !!after;
    const values = record ? formatRecord(record, definition.fields) : '';
    pushDifference(
      differences,
      section,
      item,
      '整项',
      before ? values : '',
      after ? values : '',
      added ? 'added' : 'removed',
      (value) => typeof value === 'string' ? value : formatValue(value),
      false,
      {
        scope: 'item',
        ...(beforeRecordPath ? { beforePath: beforeRecordPath } : { beforePath: [...beforeListPath] }),
        ...(afterRecordPath ? { afterPath: afterRecordPath } : {}),
      },
    );
  });
}

function formatCustomContent(value: unknown): string {
  if (!Array.isArray(value)) return formatValue(value);
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') return formatValue(entry);
    const record = entry as ResumeRecord;
    const heading = [formatValue(record.title), formatValue(record.subtitle), formatDate(record.date)].filter(Boolean).join(' · ');
    const description = formatValue(record.description);
    return [heading, description].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n\n');
}

function formatCustomBlock(record: ResumeRecord): string {
  return [
    formatValue(record.title) ? `模块标题：${formatValue(record.title)}` : '',
    formatCustomContent(record.content) ? `模块内容：\n${formatCustomContent(record.content)}` : '',
  ].filter(Boolean).join('\n') || '（空模块）';
}

function compareCustomBlocks(before: ResumeData, after: ResumeData, differences: ResumeDifference[]): void {
  const beforeBlocks = asRecords(before.customBlocks);
  const afterBlocks = asRecords(after.customBlocks);
  const pairs = pairRecords(beforeBlocks, afterBlocks, [['title']]);

  pairs.forEach(({ before: oldBlock, after: newBlock, beforeIndex, afterIndex }) => {
    const block = newBlock ?? oldBlock ?? {};
    const section = formatValue(after.sectionTitles?.[String(block.id ?? '')])
      || formatValue(before.sectionTitles?.[String(block.id ?? '')])
      || formatValue(block.title)
      || '自定义模块';
    const item = formatValue(block.title) || '自定义模块';
    if (oldBlock && newBlock && beforeIndex !== undefined && afterIndex !== undefined) {
      pushDifference(differences, section, item, '模块标题', oldBlock.title, newBlock.title, undefined, formatValue, false, {
        beforePath: ['customBlocks', beforeIndex, 'title'],
        afterPath: ['customBlocks', afterIndex, 'title'],
      });
      if (Array.isArray(oldBlock.content) && Array.isArray(newBlock.content)) {
        compareRecordList(differences, oldBlock.content, newBlock.content, section, {
          identityFields: [['title', 'date'], ['title']],
          itemLabel: (record) => formatValue(record.title) || '自定义条目',
          fields: [
            { key: 'title', label: '条目名称' },
            { key: 'subtitle', label: '副标题' },
            { key: 'date', label: '时间', format: formatDate },
            { key: 'description', label: '内容' },
            { key: 'visible', label: '显示状态', format: (value) => value === false ? '隐藏' : '显示' },
          ],
        }, ['customBlocks', beforeIndex, 'content'], ['customBlocks', afterIndex, 'content']);
      } else {
        pushDifference(differences, section, item, '模块内容', oldBlock.content, newBlock.content, undefined, formatCustomContent, false, {
          beforePath: ['customBlocks', beforeIndex, 'content'],
          afterPath: ['customBlocks', afterIndex, 'content'],
        });
      }
      return;
    }

    const added = !oldBlock && !!newBlock;
    const beforeRecordPath = beforeIndex !== undefined ? ['customBlocks', beforeIndex] : undefined;
    const afterRecordPath = afterIndex !== undefined ? ['customBlocks', afterIndex] : undefined;
    pushDifference(
      differences,
      section,
      item,
      '整项',
      oldBlock ? formatCustomBlock(oldBlock) : '',
      newBlock ? formatCustomBlock(newBlock) : '',
      added ? 'added' : 'removed',
      (value) => typeof value === 'string' ? value : formatValue(value),
      false,
      {
        scope: 'item',
        ...(beforeRecordPath ? { beforePath: beforeRecordPath } : !oldBlock ? { beforePath: ['customBlocks'] } : {}),
        ...(afterRecordPath ? { afterPath: afterRecordPath } : {}),
      },
    );
  });
}

function readPath(root: unknown, path: ResumePathSegment[]): unknown {
  return path.reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string | number, unknown>)[segment];
  }, root);
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function writePath(root: unknown, path: ResumePathSegment[], value: unknown): void {
  if (!path.length) return;
  const parent = readPath(root, path.slice(0, -1));
  if (!parent || typeof parent !== 'object') return;
  const key = path[path.length - 1];
  if (key === undefined) return;
  if (value === undefined) {
    if (Array.isArray(parent) && typeof key === 'number') parent.splice(key, 1);
    else delete (parent as Record<string | number, unknown>)[key];
  } else {
    (parent as Record<string | number, unknown>)[key] = cloneValue(value);
  }
}

/** Create a merged copy of A with only the selected changes from B; neither input is mutated. */
export function applyResumeDifferences(
  before: ResumeData,
  after: ResumeData,
  differences: ResumeDifference[],
  selectedIds: string[],
): ResumeData {
  const selected = new Set(selectedIds);
  const accepted = differences.filter((difference) => selected.has(difference.id));
  const merged = cloneValue(before);

  accepted.filter((difference) => difference.scope === 'field').forEach((difference) => {
    if (!difference.beforePath || !difference.afterPath) return;
    writePath(merged, difference.beforePath, readPath(after, difference.afterPath));
  });

  accepted.filter((difference) => difference.scope === 'item' && difference.type === 'added')
    .forEach((difference) => {
      if (!difference.afterPath) return;
      const value = readPath(after, difference.afterPath);
      const targetPath = difference.beforePath ?? difference.afterPath.slice(0, -1);
      let targetList = readPath(merged, targetPath);
      if (!Array.isArray(targetList)) {
        writePath(merged, targetPath, []);
        targetList = readPath(merged, targetPath);
      }
      if (Array.isArray(targetList) && value && typeof value === 'object') targetList.push(cloneValue(value));
    });

  accepted.filter((difference) => difference.scope === 'item' && difference.type === 'removed')
    .sort((left, right) => {
      const leftPath = left.beforePath ?? [];
      const rightPath = right.beforePath ?? [];
      const leftParent = JSON.stringify(leftPath.slice(0, -1));
      const rightParent = JSON.stringify(rightPath.slice(0, -1));
      return leftParent.localeCompare(rightParent) || Number(rightPath[rightPath.length - 1]) - Number(leftPath[leftPath.length - 1]);
    })
    .forEach((difference) => {
      const path = difference.beforePath;
      if (!path?.length) return;
      const list = readPath(merged, path.slice(0, -1));
      const index = path[path.length - 1];
      if (Array.isArray(list) && typeof index === 'number' && index >= 0 && index < list.length) list.splice(index, 1);
    });

  return merged;
}

export function compareResumeVersions(before: ResumeData, after: ResumeData): ResumeDifference[] {
  const differences: ResumeDifference[] = [];
  const oldBasic = before.basic as unknown as ResumeRecord;
  const newBasic = after.basic as unknown as ResumeRecord;

  [
    ['name', '姓名'],
    ['title', '求职意向'],
    ['email', '邮箱'],
    ['phone', '手机'],
    ['location', '所在地'],
    ['website', '个人网站'],
    ['summary', '个人简介'],
  ].forEach(([key, label]) => pushDifference(
    differences,
    '个人信息',
    '基本信息',
    label ?? key ?? '',
    oldBasic?.[key ?? ''],
    newBasic?.[key ?? ''],
    undefined,
    formatValue,
    false,
    { beforePath: ['basic', key ?? ''], afterPath: ['basic', key ?? ''] },
  ));

  compareRecordList(differences, before.basic?.customContacts, after.basic?.customContacts, '个人信息', {
    identityFields: [['label']],
    itemLabel: (record) => formatValue(record.label) || '自定义联系方式',
    fields: [
      { key: 'label', label: '联系方式名称' },
      { key: 'value', label: '联系方式内容' },
    ],
  }, ['basic', 'customContacts']);

  compareRecordList(differences, before.experiences, after.experiences, '工作经历', {
    identityFields: [['company', 'position'], ['company']],
    itemLabel: (record) => makeItemLabel(record, ['company', 'position']),
    fields: [
      { key: 'company', label: '公司' },
      { key: 'position', label: '职位' },
      { key: 'startDate', label: '开始时间', format: formatDate },
      { key: 'endDate', label: '结束时间', format: formatDate },
      { key: 'description', label: '工作内容' },
      { key: 'highlights', label: '关键成果' },
      { key: 'visible', label: '显示状态', format: (value) => value === false ? '隐藏' : '显示' },
    ],
  }, ['experiences']);

  compareRecordList(differences, before.education, after.education, '教育背景', {
    identityFields: [['school', 'degree', 'major'], ['school', 'major'], ['school']],
    itemLabel: (record) => makeItemLabel(record, ['school', 'major']),
    fields: [
      { key: 'school', label: '学校' },
      { key: 'degree', label: '学历' },
      { key: 'major', label: '专业' },
      { key: 'startDate', label: '入学时间', format: formatDate },
      { key: 'endDate', label: '毕业时间', format: formatDate },
      { key: 'gpa', label: 'GPA' },
      { key: 'visible', label: '显示状态', format: (value) => value === false ? '隐藏' : '显示' },
    ],
  }, ['education']);

  compareRecordList(differences, before.skills, after.skills, '技能', {
    identityFields: [['category']],
    itemLabel: (record) => formatValue(record.category) || '技能',
    fields: [
      { key: 'category', label: '技能分类' },
      { key: 'items', label: '技能清单', unordered: true },
      {
        key: 'level',
        label: '熟练程度',
        format: (value) => ({ beginner: '入门', intermediate: '中级', advanced: '高级', expert: '专家' }[String(value)] ?? formatValue(value)),
      },
      { key: 'visible', label: '显示状态', format: (value) => value === false ? '隐藏' : '显示' },
    ],
  }, ['skills']);

  compareRecordList(differences, before.projects, after.projects, '项目经验', {
    identityFields: [['name', 'role'], ['name']],
    itemLabel: (record) => makeItemLabel(record, ['name', 'role']),
    fields: [
      { key: 'name', label: '项目名称' },
      { key: 'role', label: '担任角色' },
      { key: 'startDate', label: '开始时间', format: formatDate },
      { key: 'endDate', label: '结束时间', format: formatDate },
      { key: 'description', label: '项目内容' },
      { key: 'techStack', label: '技术栈', unordered: true },
      { key: 'link', label: '项目链接' },
      { key: 'visible', label: '显示状态', format: (value) => value === false ? '隐藏' : '显示' },
    ],
  }, ['projects']);

  compareCustomBlocks(before, after, differences);
  return differences;
}
