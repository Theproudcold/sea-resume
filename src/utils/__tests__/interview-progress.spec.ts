import { describe, expect, it } from 'vitest';
import { summarizeInterviewProgress } from '@/utils/interviewProgress';
import type { InterviewObservation, InterviewSession, InterviewTurn, InterviewWeaknessTag } from '@/types/interview';

function turn(overrides: Partial<InterviewTurn> = {}): InterviewTurn {
  return { id: `t${Math.random()}`, mainNumber: 1, followup: false, question: { text: 'q', focus: 'f', kind: 'experience', itemIds: [] }, ...overrides };
}
function observation(overrides: Partial<InterviewObservation> = {}): InterviewObservation {
  return { category: 'expression', tag: 'result', text: '补上验证', verification: 'needs-verification', evidence: [], ...overrides };
}
function session(id: string, overrides: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id, sourceResumeId: 'r1', createdAt: '2026-03-01T10:00:00.000Z', updatedAt: `2026-03-0${id.length}T10:00:00.000Z`,
    context: {} as InterviewSession['context'],
    settings: { targetRole: `岗位${id}`, jd: '', level: '', direction: '综合', mode: 'training', mainQuestionLimit: 5 },
    provider: { baseUrl: 'https://test.invalid/v1', model: 'm' }, status: 'answering', pendingStage: null, coveragePlan: [], turns: [],
    usage: { calls: 0, promptTokens: 0, completionTokens: 0 }, persistence: true, jsonMode: true, ending: false,
    ...overrides,
  };
}
function report(observations: InterviewObservation[], extra: Partial<NonNullable<InterviewSession['report']>> = {}): NonNullable<InterviewSession['report']> {
  return { incomplete: false, observations, followupReview: [], priorities: [], facts: [], referencePhrasing: '', knowledgeExplanation: '', ...extra };
}

describe('interview progress summary', () => {
  it('returns empty, honest zeros for no records', () => {
    expect(summarizeInterviewProgress([])).toEqual({ sessions: 0, completed: 0, focusSessions: 0, answeredQuestions: 0, skippedQuestions: 0, answeredRatio: 0, recurring: [], recent: [] });
  });

  it('counts only submitted turns and separates answered from skipped', () => {
    const record = session('one', { turns: [
      turn({ submittedAt: 'now' }),
      turn({ submittedAt: 'now', skipped: true }),
      turn({}),
    ] });
    const progress = summarizeInterviewProgress([record]);
    expect(progress.answeredQuestions).toBe(1);
    expect(progress.skippedQuestions).toBe(1);
    expect(progress.answeredRatio).toBe(0.5);
  });

  it('counts completed and targeted-practice sessions', () => {
    const progress = summarizeInterviewProgress([
      session('one', { report: report([]) }),
      session('two', { settings: { ...session('two').settings, focus: { sourceSessionId: 'one', points: ['练习'], tags: ['result' as InterviewWeaknessTag] } } }),
    ]);
    expect(progress.sessions).toBe(2);
    expect(progress.completed).toBe(1);
    expect(progress.focusSessions).toBe(1);
  });

  it('reports only weaknesses seen across two or more sessions and ignores legacy or strength tags', () => {
    const progress = summarizeInterviewProgress([
      session('one', { report: report([observation({ tag: 'result' }), observation({ category: 'knowledge', tag: 'knowledge' }), observation({ tag: undefined }), observation({ category: 'strength', tag: 'none' })]) }),
      session('two', { report: report([observation({ tag: 'result' }), observation({ category: 'knowledge', tag: 'knowledge' })], { followupReview: [observation({ tag: 'result' })] }) }),
      session('three', { report: report([observation({ tag: 'structure' })]) }),
    ]);
    expect(progress.recurring).toEqual([
      { tag: 'result', label: '结果与验证', sessions: 2, observations: 3 },
      { tag: 'knowledge', label: '知识缺口', sessions: 2, observations: 2 },
    ]);
  });

  it('lists recent sessions newest first with per-session answer and category counts', () => {
    const progress = summarizeInterviewProgress([
      session('one', { updatedAt: '2026-03-01T10:00:00.000Z', report: report([observation()]), turns: [turn({ submittedAt: 'now' })] }),
      session('two', { updatedAt: '2026-03-05T10:00:00.000Z', report: report([observation({ category: 'knowledge', tag: 'knowledge' })]), turns: [turn({ submittedAt: 'now', skipped: true })] }),
    ], 1);
    expect(progress.recent).toHaveLength(1);
    expect(progress.recent[0]).toMatchObject({ id: 'two', label: '岗位two', answered: 0, skipped: 1, expression: 0, knowledge: 1 });
    const both = summarizeInterviewProgress([
      session('one', { updatedAt: '2026-03-01T10:00:00.000Z' }),
      session('two', { updatedAt: '2026-03-05T10:00:00.000Z' }),
    ]);
    expect(both.recent.map(item => item.id)).toEqual(['two', 'one']);
  });
});
