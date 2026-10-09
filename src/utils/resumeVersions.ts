import type { ResumeData } from '@/types/resume';
import { generateId } from '@/utils/helpers';

export interface JobTarget {
  versionName: string;
  company: string;
  position: string;
  sourceResumeId: string;
}

export interface ResumeDifference {
  path: string;
  before: string;
  after: string;
}

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

function display(value: unknown): string {
  if (value === undefined || value === null || value === '') return '（空）';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(display).join('、');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function flatten(value: unknown, path: string, result: Map<string, string>): void {
  if (Array.isArray(value)) {
    if (!value.length) result.set(path, '（空）');
    value.forEach((entry, index) => flatten(entry, `${path}[${index + 1}]`, result));
    return;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !['id', 'createdAt', 'updatedAt', 'jobTarget'].includes(key));
    if (!entries.length) result.set(path, '（空）');
    entries.forEach(([key, entry]) => flatten(entry, path ? `${path}.${key}` : key, result));
    return;
  }
  result.set(path, display(value));
}

export function compareResumeVersions(before: ResumeData, after: ResumeData): ResumeDifference[] {
  const left = new Map<string, string>();
  const right = new Map<string, string>();
  flatten(before, '', left);
  flatten(after, '', right);
  const paths = new Set([...left.keys(), ...right.keys()]);
  return [...paths].sort().flatMap((path) => {
    const oldValue = left.get(path) ?? '（空）';
    const newValue = right.get(path) ?? '（空）';
    return oldValue === newValue ? [] : [{ path, before: oldValue, after: newValue }];
  });
}
