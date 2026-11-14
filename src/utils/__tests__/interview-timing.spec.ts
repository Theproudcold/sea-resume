import { describe, expect, it } from 'vitest';
import { answeredDurationMs, formatClock, formatDuration, sessionElapsedMs, turnAnswerMs } from '@/utils/interviewTiming';
import type { InterviewSession, InterviewTurn } from '@/types/interview';

function turn(overrides: Partial<InterviewTurn> = {}): InterviewTurn {
  return { id: 'q1', mainNumber: 1, followup: false, question: { text: 'q', focus: 'f', kind: 'experience', itemIds: [] }, ...overrides };
}
function session(overrides: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id: 's1', sourceResumeId: 'r1', createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-01T10:10:00.000Z',
    context: {} as InterviewSession['context'],
    settings: { targetRole: '', jd: '', level: '', direction: '综合', mode: 'real', mainQuestionLimit: 5 },
    provider: { baseUrl: 'https://test.invalid/v1', model: 'm' },
    status: 'answering', pendingStage: null, coveragePlan: [], turns: [],
    usage: { calls: 0, promptTokens: 0, completionTokens: 0 }, persistence: false, jsonMode: true, ending: false,
    ...overrides,
  };
}

describe('interview timing', () => {
  it('measures only completed bounds and rejects reversed or missing timestamps', () => {
    expect(turnAnswerMs(turn())).toBeNull();
    expect(turnAnswerMs(turn({ askedAt: '2026-03-01T10:00:00.000Z' }))).toBeNull();
    expect(turnAnswerMs(turn({ askedAt: '2026-03-01T10:00:00.000Z', submittedAt: '2026-03-01T10:02:30.000Z' }))).toBe(150000);
    expect(turnAnswerMs(turn({ askedAt: '2026-03-01T10:05:00.000Z', submittedAt: '2026-03-01T10:00:00.000Z' }))).toBeNull();
    expect(turnAnswerMs(turn({ askedAt: 'not-a-date', submittedAt: '2026-03-01T10:00:00.000Z' }))).toBeNull();
  });

  it('sums submitted answering time and ignores unsubmitted turns', () => {
    const value = session({ turns: [
      turn({ id: 'a', askedAt: '2026-03-01T10:00:00.000Z', submittedAt: '2026-03-01T10:01:00.000Z' }),
      turn({ id: 'b', askedAt: '2026-03-01T10:01:00.000Z', submittedAt: '2026-03-01T10:02:30.000Z' }),
      turn({ id: 'c', askedAt: '2026-03-01T10:02:30.000Z' }),
    ] });
    expect(answeredDurationMs(value)).toBe(150000);
    expect(answeredDurationMs(session())).toBe(0);
  });

  it('reads elapsed wall clock from the session start and freezes it on completion', () => {
    const now = Date.parse('2026-03-01T11:00:00.000Z');
    expect(sessionElapsedMs(session(), now)).toBe(3600000);
    expect(sessionElapsedMs(session({ status: 'completed' }), now)).toBe(600000);
    expect(sessionElapsedMs(session({ createdAt: 'bad' }), now)).toBeNull();
  });

  it('formats clocks and human durations without inventing precision', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65000)).toBe('01:05');
    expect(formatClock(3725000)).toBe('1:02:05');
    expect(formatClock(-5)).toBe('00:00');
    expect(formatDuration(45000)).toBe('45 秒');
    expect(formatDuration(60000)).toBe('1 分');
    expect(formatDuration(130000)).toBe('2 分 10 秒');
    expect(formatDuration(3900000)).toBe('1 小时 5 分');
    expect(formatDuration(7200000)).toBe('2 小时');
  });
});
