import { beforeEach, describe, expect, it } from 'vitest';
import { clearInterviewDraft, clearInterviewTurnDraft, readInterviewDraft, writeInterviewDraft } from '@/utils/interviewDraft';

beforeEach(() => { localStorage.clear(); });

describe('interview drafts', () => {
  it('round-trips a draft keyed by session and question', () => {
    writeInterviewDraft('s1', 'q1', '我的草稿', true);
    expect(readInterviewDraft('s1', 'q1')).toBe('我的草稿');
    expect(readInterviewDraft('s1', 'q2')).toBe('');
    expect(readInterviewDraft('s2', 'q1')).toBe('');
  });

  it('never stores while the interview is memory-only and clears a stored draft when opted out', () => {
    writeInterviewDraft('s1', 'q1', '不会保存', false);
    expect(readInterviewDraft('s1', 'q1')).toBe('');
    writeInterviewDraft('s1', 'q1', '先保存', true);
    writeInterviewDraft('s1', 'q1', '改为仅内存', false);
    expect(readInterviewDraft('s1', 'q1')).toBe('');
  });

  it('drops whitespace-only drafts and truncates oversized input', () => {
    writeInterviewDraft('s1', 'q1', '   \n ', true);
    expect(readInterviewDraft('s1', 'q1')).toBe('');
    writeInterviewDraft('s1', 'q1', 'x'.repeat(12000), true);
    expect(readInterviewDraft('s1', 'q1')).toHaveLength(10000);
  });

  it('clears one question or the whole session without touching other sessions', () => {
    writeInterviewDraft('s1', 'q1', '一', true);
    writeInterviewDraft('s1', 'q2', '二', true);
    writeInterviewDraft('s2', 'q1', '三', true);
    clearInterviewTurnDraft('s1', 'q1');
    expect(readInterviewDraft('s1', 'q1')).toBe('');
    expect(readInterviewDraft('s1', 'q2')).toBe('二');
    clearInterviewDraft('s1');
    expect(readInterviewDraft('s1', 'q2')).toBe('');
    expect(readInterviewDraft('s2', 'q1')).toBe('三');
  });
});
