import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearResumeInterviewNotes,
  hasInterviewNoteContent,
  loadInterviewNote,
  saveInterviewNote,
} from '@/services/career/interviewNotes';

describe('interviewNotes local repository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists and isolates notes by resumeId and entryKey', () => {
    saveInterviewNote('r1', 'experience:e1', {
      contribution: '主导核心链路，占 70% 贡献',
      talkingPoints: '预留压测细节口述',
      qaPrep: '监控口径与容灾预案',
    });

    const loaded = loadInterviewNote('r1', 'experience:e1');
    expect(hasInterviewNoteContent(loaded)).toBe(true);
    expect(loaded.contribution).toContain('70%');
    expect(hasInterviewNoteContent(loadInterviewNote('r2', 'experience:e1'))).toBe(false);
  });

  it('removes storage entry when note becomes empty or cleared', () => {
    saveInterviewNote('r1', 'project:p1', { contribution: '核心开发', talkingPoints: '', qaPrep: '' });
    saveInterviewNote('r1', 'project:p1', { contribution: '   ', talkingPoints: '', qaPrep: '' });
    expect(hasInterviewNoteContent(loadInterviewNote('r1', 'project:p1'))).toBe(false);

    saveInterviewNote('r1', 'project:p1', { contribution: '核心开发', talkingPoints: '', qaPrep: '' });
    clearResumeInterviewNotes('r1');
    expect(hasInterviewNoteContent(loadInterviewNote('r1', 'project:p1'))).toBe(false);
  });
});
