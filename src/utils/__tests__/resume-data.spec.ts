import { describe, expect, it } from 'vitest';
import { createDefaultResumeData, normalizeResumeData } from '@/utils/resumeData';

describe('normalizeResumeData', () => {
  it('fills theme and section defaults for legacy resumes that have no theme', () => {
    const legacy = {
      id: 'legacy-resume',
      title: '旧简历',
      basic: { name: '张三', title: '', email: '', phone: '' },
      experiences: [],
      education: [],
      skills: [],
      projects: [],
      customBlocks: [],
    };

    const normalized = normalizeResumeData(legacy);

    expect(normalized.theme.displayIcons).toBe(true);
    expect(normalized.theme.moduleMargins).toEqual({ top: 0, bottom: 24, left: 0, right: 0 });
    expect(normalized.theme.dateFormat).toBe('YYYY.MM');
    expect(normalized.sectionTitles.experience).toBe('工作经历');
    expect(normalized.sectionOrder).toEqual(['experience', 'projects', 'education', 'skills']);
    expect(normalized.basic.name).toBe('张三');
    expect(normalized.id).toBe('legacy-resume');
  });

  it('keeps stored values and migrates the deprecated sans-serif font', () => {
    const stored = createDefaultResumeData();
    stored.theme = { ...stored.theme, color: '#ff0000', fontFamily: 'sans-serif', displayIcons: false };

    const normalized = normalizeResumeData(stored);

    expect(normalized.theme.color).toBe('#ff0000');
    expect(normalized.theme.displayIcons).toBe(false);
    expect(normalized.theme.fontFamily).not.toBe('sans-serif');
  });

  it('returns defaults for null or malformed input instead of throwing', () => {
    expect(normalizeResumeData(null).theme.displayIcons).toBe(true);
    expect(normalizeResumeData('broken').basic.name).toBe('');
    expect(normalizeResumeData({ theme: 'nope', basic: 42 }).theme.moduleMargins.bottom).toBe(24);
  });

  it('keeps a whitelisted avatar shape and leaves unknown or missing ones unset', () => {
    const stored = createDefaultResumeData();
    stored.basic.avatarShape = 'square';
    expect(normalizeResumeData(stored).basic.avatarShape).toBe('square');

    expect(normalizeResumeData({ ...stored, basic: { ...stored.basic, avatarShape: 'triangle' } }).basic.avatarShape).toBeUndefined();
    expect(normalizeResumeData({ id: 'legacy', basic: { name: '张三' } }).basic.avatarShape).toBeUndefined();
  });
});
