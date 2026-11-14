import type { InterviewSession, InterviewTurn } from '@/types/interview';

/** Time between a question being shown and its answer being submitted; local only, never sent to the model. */
export function turnAnswerMs(turn: InterviewTurn): number | null {
  if (!turn.askedAt || !turn.submittedAt) return null;
  const start = Date.parse(turn.askedAt);
  const end = Date.parse(turn.submittedAt);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
}

/** Accumulated answering time across submitted questions; paused time is excluded on purpose. */
export function answeredDurationMs(session: InterviewSession): number {
  return session.turns.reduce((total, turn) => total + (turnAnswerMs(turn) ?? 0), 0);
}

/** Wall-clock time since the session started; for the live rhythm readout only. */
export function sessionElapsedMs(session: InterviewSession, now = Date.now()): number | null {
  const start = Date.parse(session.createdAt);
  if (!Number.isFinite(start)) return null;
  const end = session.status === 'completed' ? Date.parse(session.updatedAt) : now;
  return Number.isFinite(end) && end >= start ? end - start : null;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total} 秒`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}
