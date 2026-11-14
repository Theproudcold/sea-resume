import { describe, expect, it } from 'vitest';
import { isValidInterviewFocus, MAX_FOCUS_POINTS, observationTagLabel, weaknessFocusFromReport, weaknessTagLabel } from '@/utils/interviewWeakness';
import type { InterviewObservation, InterviewSession } from '@/types/interview';

function observation(overrides: Partial<InterviewObservation> = {}): InterviewObservation {
  return { category: 'expression', tag: 'result', text: '把结果和验证方式说清楚', verification: 'needs-verification', evidence: [{ sourceId: 'q1', snippet: 's' }], ...overrides };
}
function session(overrides: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id: 's1', sourceResumeId: 'r1', createdAt: 'now', updatedAt: 'now', context: {} as InterviewSession['context'],
    settings: { targetRole: '', jd: '', level: '', direction: '综合', mode: 'training', mainQuestionLimit: 5 },
    provider: { baseUrl: 'https://test.invalid/v1', model: 'm' }, status: 'completed', pendingStage: null, coveragePlan: [], turns: [],
    usage: { calls: 0, promptTokens: 0, completionTokens: 0 }, persistence: true, jsonMode: true, ending: true,
    ...overrides,
  };
}
function withReport(overrides: Partial<InterviewSession['report']> = {}): InterviewSession {
  return session({ report: { incomplete: false, observations: [], followupReview: [], priorities: ['先说职责', '补上验证'], facts: [], referencePhrasing: '', knowledgeExplanation: '', ...overrides } });
}

describe('interview weakness taxonomy', () => {
  it('labels tags and hides the strength / legacy placeholder', () => {
    expect(weaknessTagLabel('contribution')).toBe('个人贡献');
    expect(weaknessTagLabel('knowledge')).toBe('知识缺口');
    expect(observationTagLabel(observation({ tag: 'structure' }))).toBe('结构清晰度');
    expect(observationTagLabel(observation({ tag: 'none' }))).toBe('');
    expect(observationTagLabel(observation({ tag: undefined }))).toBe('');
  });

  it('returns no focus without a report or without any practice point', () => {
    expect(weaknessFocusFromReport(session())).toBeNull();
    expect(weaknessFocusFromReport(withReport({ priorities: [] }))).toBeNull();
  });

  it('takes priorities first, then cited weaknesses, de-duplicated and capped', () => {
    const focus = weaknessFocusFromReport(withReport({
      priorities: ['先说职责', '补上验证', '控制时长'],
      observations: [observation({ text: '先说职责' }), observation({ category: 'knowledge', tag: 'knowledge', text: '缓存一致性' }), observation({ category: 'strength', tag: 'none', text: '例子具体' })],
      followupReview: [observation({ text: '补上验证' }), observation({ text: '边界条件' })],
    }))!;
    expect(focus.sourceSessionId).toBe('s1');
    expect(focus.points).toEqual(['先说职责', '补上验证', '控制时长', '缓存一致性', '边界条件']);
    expect(focus.points).toHaveLength(MAX_FOCUS_POINTS);
    expect(focus.tags).toEqual(['result', 'knowledge']);
  });

  it('omits legacy observations without a tag from the tag list', () => {
    const focus = weaknessFocusFromReport(withReport({ priorities: ['练习'], observations: [observation({ tag: undefined }), observation({ tag: 'none', category: 'strength' })] }))!;
    expect(focus.tags).toEqual([]);
  });

  it('accepts only a bounded, well-formed focus', () => {
    expect(isValidInterviewFocus({ sourceSessionId: 's1', points: ['a'], tags: ['result'] })).toBe(true);
    expect(isValidInterviewFocus({ sourceSessionId: 's1', points: ['a'], tags: [] })).toBe(true);
    expect(isValidInterviewFocus(null)).toBe(false);
    expect(isValidInterviewFocus({ sourceSessionId: '', points: ['a'], tags: [] })).toBe(false);
    expect(isValidInterviewFocus({ sourceSessionId: 's1', points: [], tags: [] })).toBe(false);
    expect(isValidInterviewFocus({ sourceSessionId: 's1', points: ['  '], tags: [] })).toBe(false);
    expect(isValidInterviewFocus({ sourceSessionId: 's1', points: ['a', 'b', 'c', 'd', 'e', 'f'], tags: [] })).toBe(false);
    expect(isValidInterviewFocus({ sourceSessionId: 's1', points: ['a'], tags: ['invented'] })).toBe(false);
    expect(isValidInterviewFocus({ sourceSessionId: 'x'.repeat(251), points: ['a'], tags: [] })).toBe(false);
  });
});
