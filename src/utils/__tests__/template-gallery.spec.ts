import { describe, expect, it } from 'vitest';
import { buildTemplateResumeTitle, filterTemplates, sortTemplates } from '@/utils/template-gallery';
import type { TemplateMetadata } from '@/types/resume';

const templates: TemplateMetadata[] = [
  {
    id: 'modern',
    name: '现代简约',
    description: '单栏布局',
    category: 'modern',
    categoryLabel: '现代',
    keywords: ['前端', '互联网'],
    recommendedOrder: 2,
  },
  {
    id: 'professional',
    name: '商务专业',
    description: '双栏布局',
    category: 'professional',
    categoryLabel: '商务',
    keywords: ['金融', '咨询'],
    recommendedOrder: 1,
  },
  {
    id: 'creative',
    name: '创意设计',
    description: '卡片式布局',
    category: 'creative',
    categoryLabel: '创意',
    keywords: ['设计', '品牌'],
    recommendedOrder: 3,
  },
];

describe('template-gallery helpers', () => {
  it('按分类和关键词过滤模板', () => {
    const byCategory = filterTemplates(templates, { category: 'professional', search: '' });
    expect(byCategory.map((item) => item.id)).toEqual(['professional']);

    const byKeyword = filterTemplates(templates, { category: 'all', search: '设计' });
    expect(byKeyword.map((item) => item.id)).toEqual(['creative']);
  });

  it('按最近使用排序，未使用时回退推荐顺序', () => {
    const usage = {
      modern: 10,
      professional: 5,
    };

    const sorted = sortTemplates(templates, 'recent', usage);
    expect(sorted.map((item) => item.id)).toEqual(['modern', 'professional', 'creative']);
  });

  it('根据模板名和日期生成稳定默认标题', () => {
    const date = new Date(2026, 0, 5, 9, 30, 0);
    expect(buildTemplateResumeTitle('现代简约', date)).toBe('现代简约简历 - 2026-01-05');
  });
});
