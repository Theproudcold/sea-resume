import { describe, expect, it } from 'vitest';
import { templateDemoData } from '@/data/template-demo';
import { cloneResume, rememberResumeSnapshot } from '@/utils/resumeSnapshot';

describe('resume snapshots', () => {
  it('detaches content but keeps one shared avatar string', () => {
    const source = structuredClone(templateDemoData);
    source.basic.avatar = 'data:image/jpeg;base64,portrait';
    const copy = cloneResume(source);
    copy.basic.name = 'Changed';
    copy.basic.avatar = 'data:image/jpeg;base64,other';

    expect(source.basic.name).not.toBe('Changed');
    expect(source.basic.avatar).toBe('data:image/jpeg;base64,portrait');
    expect(cloneResume(source).basic.avatar).toBe(source.basic.avatar);
  });

  it('keeps at most thirty undo snapshots', () => {
    let past = rememberResumeSnapshot([], templateDemoData);
    for (let index = 0; index < 40; index += 1) {
      const current = structuredClone(templateDemoData);
      current.basic.name = `Name ${index}`;
      past = rememberResumeSnapshot(past, current);
    }
    expect(past).toHaveLength(30);
    expect(past[0]?.basic.name).toBe('Name 10');
    expect(past[past.length - 1]?.basic.name).toBe('Name 39');
  });
});
