import type { InterviewSession, InterviewWeaknessTag } from '@/types/interview';
import { observationTagLabel, weaknessTagLabel } from './interviewWeakness';

export interface InterviewWeaknessRecurrence {
  tag: InterviewWeaknessTag;
  label: string;
  sessions: number;
  observations: number;
}
export interface InterviewRecentSession {
  id: string;
  label: string;
  updatedAt: string;
  answered: number;
  skipped: number;
  expression: number;
  knowledge: number;
}
export interface InterviewProgress {
  sessions: number;
  completed: number;
  focusSessions: number;
  answeredQuestions: number;
  skippedQuestions: number;
  /** Answered over answered + skipped; 0 when nothing was answered or skipped. */
  answeredRatio: number;
  /** Weakness tags seen in two or more separate sessions, newest data first. */
  recurring: InterviewWeaknessRecurrence[];
  recent: InterviewRecentSession[];
}

function observationsOf(session: InterviewSession) {
  return [...(session.report?.observations ?? []), ...(session.report?.followupReview ?? [])];
}
function labelOf(session: InterviewSession): string {
  return session.settings.targetRole || '通用面试';
}

/**
 * Aggregates what the saved interviews already contain: no model call, no score,
 * only counts the user can trace back to their own sessions.
 */
export function summarizeInterviewProgress(records: InterviewSession[], recentLimit = 5): InterviewProgress {
  let answeredQuestions = 0;
  let skippedQuestions = 0;
  let completed = 0;
  let focusSessions = 0;
  const tagSessions = new Map<InterviewWeaknessTag, Set<string>>();
  const tagObservations = new Map<InterviewWeaknessTag, number>();

  for (const record of records) {
    if (record.report) completed++;
    if (record.settings.focus) focusSessions++;
    for (const turn of record.turns) {
      if (!turn.submittedAt) continue;
      if (turn.skipped) skippedQuestions++;
      else answeredQuestions++;
    }
    for (const observation of observationsOf(record)) {
      const tag = observation.tag;
      if (!tag || tag === 'none' || !observationTagLabel(observation)) continue;
      if (!tagSessions.has(tag)) tagSessions.set(tag, new Set());
      tagSessions.get(tag)!.add(record.id);
      tagObservations.set(tag, (tagObservations.get(tag) ?? 0) + 1);
    }
  }

  const recurring = [...tagSessions.entries()]
    .filter(([, sessions]) => sessions.size >= 2)
    .map(([tag, sessions]) => ({ tag, label: weaknessTagLabel(tag), sessions: sessions.size, observations: tagObservations.get(tag) ?? 0 }))
    .sort((a, b) => b.sessions - a.sessions || b.observations - a.observations);

  const recent = [...records]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, recentLimit)
    .map(record => ({
      id: record.id,
      label: labelOf(record),
      updatedAt: record.updatedAt,
      answered: record.turns.filter(turn => turn.submittedAt && !turn.skipped).length,
      skipped: record.turns.filter(turn => turn.skipped).length,
      expression: observationsOf(record).filter(item => item.category === 'expression').length,
      knowledge: observationsOf(record).filter(item => item.category === 'knowledge').length,
    }));

  const attempts = answeredQuestions + skippedQuestions;
  return { sessions: records.length, completed, focusSessions, answeredQuestions, skippedQuestions, answeredRatio: attempts ? answeredQuestions / attempts : 0, recurring, recent };
}
