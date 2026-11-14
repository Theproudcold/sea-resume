import { INTERVIEW_WEAKNESS_TAGS, type InterviewFocus, type InterviewObservation, type InterviewSession, type InterviewWeaknessTag } from '@/types/interview';

export const MAX_FOCUS_POINTS = 5;

export const WEAKNESS_TAG_LABELS: Record<InterviewWeaknessTag, string> = {
  structure: '结构清晰度',
  contribution: '个人贡献',
  specificity: '具体行动',
  result: '结果与验证',
  relevance: '岗位相关性',
  knowledge: '知识缺口',
  none: '优点',
};

export function weaknessTagLabel(tag: InterviewWeaknessTag): string {
  return WEAKNESS_TAG_LABELS[tag];
}

/** Strengths carry no weakness label; legacy records may carry none at all. */
export function observationTagLabel(observation: InterviewObservation): string {
  return observation.tag && observation.tag !== 'none' ? WEAKNESS_TAG_LABELS[observation.tag] : '';
}

/**
 * Builds an opt-in practice focus from a finished report: the three priorities first,
 * then the cited expression / knowledge observations, capped and de-duplicated.
 */
export function weaknessFocusFromReport(session: InterviewSession): InterviewFocus | null {
  const report = session.report;
  if (!report) return null;
  const points: string[] = [];
  const add = (value: string) => {
    const text = value.trim();
    if (text && !points.includes(text) && points.length < MAX_FOCUS_POINTS) points.push(text);
  };
  report.priorities.forEach(add);
  [...report.observations, ...report.followupReview].filter(item => item.category !== 'strength').forEach(item => add(item.text));
  const weakened = [...report.observations, ...report.followupReview].filter(item => item.category !== 'strength');
  const tags = [...new Set(weakened.map(item => item.tag).filter((tag): tag is InterviewWeaknessTag => !!tag && tag !== 'none'))];
  return points.length ? { sourceSessionId: session.id, points, tags } : null;
}

export function isValidInterviewFocus(value: unknown): value is InterviewFocus {
  if (!value || typeof value !== 'object') return false;
  const focus = value as Partial<InterviewFocus>;
  return typeof focus.sourceSessionId === 'string' && !!focus.sourceSessionId && focus.sourceSessionId.length <= 250
    && Array.isArray(focus.points) && focus.points.length > 0 && focus.points.length <= MAX_FOCUS_POINTS
    && focus.points.every(point => typeof point === 'string' && !!point.trim() && point.length <= 1000)
    && Array.isArray(focus.tags) && focus.tags.length <= INTERVIEW_WEAKNESS_TAGS.length
    && focus.tags.every(tag => INTERVIEW_WEAKNESS_TAGS.includes(tag as InterviewWeaknessTag));
}
