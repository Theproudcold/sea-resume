import { describe, expect, it } from 'vitest';
import { createDefaultResumeData } from '@/utils/resumeData';
import {
  orderedSectionIds,
  sectionDisplayTitle,
  withAlignedCustomBlockOrder,
  PDF_SECTION_TITLE_FALLBACKS,
} from '@/resume/sections';
import { parseResume } from '@/resume/parseResume';

describe('orderedSectionIds', () => {
  it('follows sectionOrder and appends custom blocks that were left out', () => {
    const resume = createDefaultResumeData();
    resume.sectionOrder = ['skills', 'experience'];
    resume.customBlocks = [
      { id: 'awards', title: '奖项', type: 'text', content: '一等奖', order: 9 },
      { id: 'languages', title: '语言', type: 'text', content: '英语', order: 3 },
    ];
    resume.sectionOrder.push('awards');

    expect(orderedSectionIds(resume)).toEqual([
      'skills', 'experience', 'awards', 'projects', 'education', 'languages',
    ]);
  });
});

describe('sectionDisplayTitle', () => {
  it('uses the custom block title even when an old sectionTitles copy differs', () => {
    const resume = createDefaultResumeData();
    resume.customBlocks = [{ id: 'awards', title: '奖项', type: 'text', content: '', order: 0 }];
    resume.sectionTitles.awards = '旧标题';

    expect(sectionDisplayTitle(resume, 'awards')).toBe('奖项');
    expect(sectionDisplayTitle(resume, 'experience')).toBe('工作经历');
    expect(sectionDisplayTitle(resume, 'experience', PDF_SECTION_TITLE_FALLBACKS)).toBe('工作经历');
    resume.sectionTitles.experience = '';
    expect(sectionDisplayTitle(resume, 'experience', PDF_SECTION_TITLE_FALLBACKS)).toBe('工作经验');
  });
});

describe('withAlignedCustomBlockOrder', () => {
  it('rewrites order to the sectionOrder index without mutating the input', () => {
    const resume = createDefaultResumeData();
    const block = { id: 'awards', title: '奖项', type: 'text' as const, content: '', order: 4 };
    resume.customBlocks = [block];
    resume.sectionOrder = ['experience', 'awards', 'skills'];

    const aligned = withAlignedCustomBlockOrder(resume);
    expect(aligned.customBlocks[0]?.order).toBe(1);
    expect(block.order).toBe(4);
    expect(withAlignedCustomBlockOrder(aligned)).toBe(aligned);
  });
});

describe('parseResume', () => {
  it('fills missing fields when reading and rejects a broken import', () => {
    expect(parseResume({ id: 'legacy', basic: { name: '张三' } }, 'read').theme.fontSize).toBe(14);
    expect(() => parseResume({ basic: {}, experiences: [null] }, 'import')).toThrow();
  });
});
