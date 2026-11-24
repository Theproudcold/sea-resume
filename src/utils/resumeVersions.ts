import type { ResumeData } from '@/types/resume';
import { generateId } from '@/utils/helpers';

export interface JobTarget {
  versionName: string;
  company: string;
  position: string;
  sourceResumeId: string;
  /** 派生时所用主干版本的简历 ID。 */
  baseId?: string;
  /** 派生时所用主干版本的版本号。 */
  baseVersion?: number;
}

/** 主干轨道 ID：没有轨道字段的简历自己就是一条主干。 */
export function trackIdOf(row: { id: string; trackId?: string }): string {
  const explicit = typeof row.trackId === 'string' ? row.trackId.trim() : '';
  return explicit || row.id;
}

/** 版本号：缺省视为 1。 */
export function versionNumberOf(row: { versionNumber?: number }): number {
  const value = row.versionNumber;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 1;
}

export interface MasterBehindStatus {
  /** 主干存在比分支基线更新的版本。 */
  behind: boolean;
  /** 分支派生时所用的主干版本号；旧数据或非分支为 null。 */
  baseVersion: number | null;
  /** 该轨道上最新的主干版本号；找不到主干为 null。 */
  latestVersion: number | null;
}

/**
 * 判断一个岗位版本是否落后于它的主干。
 *
 * 只看同一 `trackId` 上、没有 `jobTarget` 的简历（即主干本身）：分支自己的版本号
 * 再大也不能算作「更新的主干」。主干被删除、分支缺少 `baseVersion`（旧数据）
 * 或轨道上只有一版时都返回不落后，避免对旧数据打扰。
 */
export function masterBehindStatus(
  branch: { id: string; trackId?: string; versionNumber?: number; jobTarget?: JobTarget },
  list: ReadonlyArray<{ id: string; trackId?: string; versionNumber?: number; jobTarget?: JobTarget }>,
): MasterBehindStatus {
  if (!branch?.jobTarget?.baseVersion) return { behind: false, baseVersion: null, latestVersion: null };
  const trackId = trackIdOf(branch);
  const applied = list.filter((row) => !row.jobTarget && trackIdOf(row) === trackId);
  if (!applied.length) return { behind: false, baseVersion: branch.jobTarget.baseVersion, latestVersion: null };
  const latestVersion = applied.reduce((max, row) => Math.max(max, versionNumberOf(row)), 0);
  const baseVersion = branch.jobTarget.baseVersion;
  return { behind: latestVersion > baseVersion, baseVersion, latestVersion };
}

export type ResumeDifferenceType = 'added' | 'removed' | 'modified' | 'formatted';
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
  /** 技能清单、技术栈等无序字段里的单个成员；按增删采纳而不是整段覆盖。 */
  member?: string;
}

interface DifferenceLocation {
  scope?: 'field' | 'item';
  beforePath?: ResumePathSegment[];
  afterPath?: ResumePathSegment[];
  member?: string;
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
  const versionName = target.versionName.trim() || `${source.title} - ${target.position.trim() || '岗位版本'}`;
  return {
    ...copy,
    id,
    title: versionName,
    // 分支沿用来源主干的轨道，但版本号在自己的分支里从 1 开始计数。
    trackId: trackIdOf(source),
    versionNumber: 1,
    jobTarget: {
      versionName,
      company: target.company.trim(),
      position: target.position.trim(),
      sourceResumeId: source.id,
      baseId: source.id,
      baseVersion: versionNumberOf(source),
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

/**
 * 只比较 HTML 结构（加粗、链接、列表标记等），不比较可读文本。
 * 非字符串字段没有格式概念，统一返回空串，避免 undefined 与 false 这类等价取值产生噪音。
 */
function normalizedMarkup(value: unknown): string {
  if (Array.isArray(value)) return value.map((entry) => normalizedMarkup(entry)).filter(Boolean).join('\n');
  if (typeof value !== 'string') return '';
  return decodeHtmlEntities(value).replace(/>\s+</g, '><').trim();
}

function comparableLines(value: string, unordered: boolean): string {
  if (!unordered) return value;
  return value.split('\n').map((line) => line.trim()).filter(Boolean).sort().join('\n');
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

/** 开关类字段：未设置与显式关闭视为同一状态。 */
function formatFlag(value: unknown): string {
  return value ? '开启' : '关闭';
}

function normalizedIdentity(value: unknown): string {
  return formatValue(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function asRecords(value: unknown): ResumeRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ResumeRecord => !!entry && typeof entry === 'object' && !Array.isArray(entry));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
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
      // 身份组合按强到弱排列。只有更强的组合在 A 侧填不全时才退到更弱的组合，
      // 并且要求该组合在两边都唯一；否则「同公司不同职位」会被误判成修改，
      // 而不是一条删除加一条新增。
      for (const identity of identityCounts) {
        const key = identityKey(before, identity.fields);
        if (!key) continue;
        if (identity.before.get(key) !== 1 || identity.after.get(key) !== 1) break;
        matchedIndex = [...remainingAfter].find((index) => identityKey(afterRecords[index] ?? {}, identity.fields) === key);
        break;
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
  const comparableBefore = comparableLines(before, unordered);
  const comparableAfter = comparableLines(after, unordered);
  const textEqual = comparableBefore === comparableAfter;

  if (textEqual) {
    // 读起来一样时，结构仍有差别（加粗、链接、列表标记）就记为一条格式差异；
    // 两边格式也一致则确实没有变化。
    const markupBefore = comparableLines(normalizedMarkup(beforeValue), unordered);
    const markupAfter = comparableLines(normalizedMarkup(afterValue), unordered);
    if (markupBefore === markupAfter) return;
  }

  const type = textEqual ? 'formatted' : (forcedType ?? (!before ? 'added' : !after ? 'removed' : 'modified'));
  const beforePath = location.beforePath ? [...location.beforePath] : undefined;
  const afterPath = location.afterPath ? [...location.afterPath] : undefined;
  const id = [
    section,
    field,
    JSON.stringify(beforePath ?? null),
    JSON.stringify(afterPath ?? null),
    JSON.stringify(location.member ?? null),
  ].join(':');
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
    ...(location.member === undefined ? {} : { member: location.member }),
  });
}

/**
 * 无序字段（技能清单、技术栈）按成员增删比较：纯排序变化不产生差异，
 * 真正新增或删除的成员各记一条，采纳时按集合合并而不是整段覆盖。
 */
function compareUnorderedMembers(
  differences: ResumeDifference[],
  section: string,
  item: string,
  field: string,
  beforeMembers: string[],
  afterMembers: string[],
  beforePath: ResumePathSegment[],
  afterPath: ResumePathSegment[],
): void {
  // 按可读文本认成员：纯排序、纯格式（加粗、包一层标签）都不算变化，
  // 只有真正新增或删除的成员各记一条。
  const remaining = afterMembers.map((member) => ({ member, used: false }));
  beforeMembers.forEach((member) => {
    const key = normalizedIdentity(member);
    const matched = remaining.find((entry) => !entry.used && normalizedIdentity(entry.member) === key);
    if (matched) {
      matched.used = true;
      return;
    }
    pushDifference(differences, section, item, field, member, '', 'removed', formatValue, false, {
      beforePath,
      afterPath,
      member,
    });
  });
  remaining.filter((entry) => !entry.used).forEach((entry) => {
    pushDifference(differences, section, item, field, '', entry.member, 'added', formatValue, false, {
      beforePath,
      afterPath,
      member: entry.member,
    });
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
        const beforeField = before[field.key];
        const afterField = after[field.key];
        const beforeFieldPath = [...beforeListPath, beforeIndex, field.key];
        const afterFieldPath = [...afterListPath, afterIndex, field.key];
        if (field.unordered && isStringArray(beforeField) && isStringArray(afterField)) {
          compareUnorderedMembers(differences, section, item, field.label, beforeField, afterField, beforeFieldPath, afterFieldPath);
          return;
        }
        pushDifference(
          differences,
          section,
          item,
          field.label,
          beforeField,
          afterField,
          undefined,
          format,
          field.unordered,
          {
            beforePath: beforeFieldPath,
            afterPath: afterFieldPath,
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

  accepted.filter((difference) => difference.scope === 'field' && difference.member === undefined)
    .forEach((difference) => {
      if (!difference.beforePath || !difference.afterPath) return;
      writePath(merged, difference.beforePath, readPath(after, difference.afterPath));
    });

  // 无序字段（技能清单、技术栈）逐个成员增删，勾选一部分也能得到合理的集合。
  accepted.filter((difference) => difference.member !== undefined).forEach((difference) => {
    const path = difference.beforePath ?? difference.afterPath;
    if (!path) return;
    const list = readPath(merged, path);
    if (!Array.isArray(list)) return;
    const member = difference.member as string;
    const key = normalizedIdentity(member);
    const index = list.findIndex((entry) => typeof entry === 'string' && normalizedIdentity(entry) === key);
    if (difference.type === 'added') {
      if (index < 0) list.push(cloneValue(member));
      return;
    }
    if (index >= 0) list.splice(index, 1);
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

  // 整项采纳自定义模块时同步模块顺序：编辑器侧栏读的是 sectionOrder，
  // 只改 customBlocks 会出现“导航里没有、预览里却有”的不一致。
  // 排序本身仍然不计入差异，这里只增删被采纳模块对应的 id，其他模块相对顺序不动。
  const sectionOrder = Array.isArray(merged.sectionOrder) ? [...merged.sectionOrder] : [];
  let sectionOrderTouched = false;
  accepted.filter((difference) => difference.scope === 'item').forEach((difference) => {
    const path = difference.type === 'added' ? difference.afterPath : difference.beforePath;
    if (!path || path.length !== 2 || path[0] !== 'customBlocks') return;
    const block = readPath(difference.type === 'added' ? after : before, path) as { id?: unknown } | undefined;
    const blockId = block && typeof block.id === 'string' ? block.id : undefined;
    if (!blockId) return;

    if (difference.type === 'removed') {
      const remaining = sectionOrder.filter((id) => id !== blockId);
      if (remaining.length !== sectionOrder.length) {
        sectionOrder.length = 0;
        sectionOrder.push(...remaining);
        sectionOrderTouched = true;
      }
      merged.hiddenSections = (merged.hiddenSections ?? []).filter((id) => id !== blockId);
      return;
    }

    if (sectionOrder.includes(blockId)) return;
    // 尽量跟在版本 B 里它前一个模块之后；对不上就放到末尾。
    const afterBlocks = asRecords(after.customBlocks);
    const index = typeof path[1] === 'number' ? path[1] : -1;
    let insertAt = sectionOrder.length;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const previousId = afterBlocks[cursor]?.id;
      const position = typeof previousId === 'string' ? sectionOrder.indexOf(previousId) : -1;
      if (position >= 0) {
        insertAt = position + 1;
        break;
      }
    }
    sectionOrder.splice(insertAt, 0, blockId);
    sectionOrderTouched = true;
    const addedBlock = merged.customBlocks.find((candidate) => candidate.id === blockId);
    if (addedBlock) addedBlock.order = insertAt;
  });
  if (sectionOrderTouched) merged.sectionOrder = sectionOrder;

  return merged;
}

/** 标准模块标题所在分组，与模块内容差异保持同一个章节名。 */
const STANDARD_SECTION_TITLES: Array<[string, string]> = [
  ['experience', '工作经历'],
  ['projects', '项目经验'],
  ['education', '教育背景'],
  ['skills', '技能'],
];

export function compareResumeVersions(before: ResumeData, after: ResumeData): ResumeDifference[] {
  const differences: ResumeDifference[] = [];
  const oldBasic = before.basic as unknown as ResumeRecord;
  const newBasic = after.basic as unknown as ResumeRecord;

  const basicFields: Array<[string, string, (value: unknown) => string]> = [
    ['name', '姓名', formatValue],
    ['title', '求职意向', formatValue],
    ['email', '邮箱', formatValue],
    ['phone', '手机', formatValue],
    ['location', '所在地', formatValue],
    ['website', '个人网站', formatValue],
    ['summary', '个人简介', formatValue],
    ['birthDate', '生日', formatValue],
    ['showAge', '显示年龄', formatFlag],
    ['showExperienceYears', '显示工作年限', formatFlag],
  ];
  basicFields.forEach(([key, label, format]) => pushDifference(
    differences,
    '个人信息',
    '基本信息',
    label,
    oldBasic?.[key],
    newBasic?.[key],
    undefined,
    format,
    false,
    { beforePath: ['basic', key], afterPath: ['basic', key] },
  ));

  compareRecordList(differences, before.basic?.customContacts, after.basic?.customContacts, '个人信息', {
    identityFields: [['label']],
    itemLabel: (record) => formatValue(record.label) || '自定义联系方式',
    fields: [
      { key: 'label', label: '联系方式名称' },
      { key: 'value', label: '联系方式内容' },
    ],
  }, ['basic', 'customContacts']);

  // 标准模块标题存在 sectionTitles 里；自定义模块标题由 compareCustomBlocks 比较，这里不重复。
  const oldTitles = (before.sectionTitles ?? {}) as Record<string, string>;
  const newTitles = (after.sectionTitles ?? {}) as Record<string, string>;
  STANDARD_SECTION_TITLES.forEach(([id, label]) => pushDifference(
    differences,
    label,
    '模块标题',
    '标题',
    oldTitles[id],
    newTitles[id],
    undefined,
    formatValue,
    false,
    { beforePath: ['sectionTitles', id], afterPath: ['sectionTitles', id] },
  ));

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
