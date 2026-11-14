import type { ResumeData } from '@/types/resume';

const HISTORY_LIMIT = 30;

/** Detach a resume while keeping one shared copy of an unchanged avatar string. */
export function cloneResume(source: ResumeData): ResumeData {
  const avatar = source.basic.avatar;
  const clone = JSON.parse(JSON.stringify(source, (key, value) => (key === 'avatar' ? undefined : value))) as ResumeData;
  if (avatar) clone.basic.avatar = avatar;
  return clone;
}

export function rememberResumeSnapshot(past: ResumeData[], current: ResumeData): ResumeData[] {
  const next = [...past, cloneResume(current)];
  if (next.length > HISTORY_LIMIT) next.shift();
  return next;
}
