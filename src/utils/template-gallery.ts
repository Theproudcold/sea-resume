import type { TemplateMetadata } from '@/types/resume';

export type TemplateSortKey = 'recommended' | 'name' | 'recent';
export type TemplateUsageMap = Record<string, number>;

interface TemplateFilterOptions {
  category: TemplateMetadata['category'] | 'all';
  search: string;
}

const byRecommended = (a: TemplateMetadata, b: TemplateMetadata): number => {
  if (a.recommendedOrder !== b.recommendedOrder) {
    return a.recommendedOrder - b.recommendedOrder;
  }
  return a.name.localeCompare(b.name, 'zh-Hans-CN');
};

export function filterTemplates(
  templates: TemplateMetadata[],
  { category, search }: TemplateFilterOptions,
): TemplateMetadata[] {
  const query = search.trim().toLowerCase();

  return templates.filter((template) => {
    if (category !== 'all' && template.category !== category) {
      return false;
    }

    if (!query) {
      return true;
    }

    const searchable = [
      template.name,
      template.description,
      template.categoryLabel,
      ...template.keywords,
    ]
      .join(' ')
      .toLowerCase();

    return searchable.includes(query);
  });
}

export function sortTemplates(
  templates: TemplateMetadata[],
  sortKey: TemplateSortKey,
  usage: TemplateUsageMap = {},
): TemplateMetadata[] {
  const list = [...templates];

  if (sortKey === 'name') {
    return list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  if (sortKey === 'recent') {
    return list.sort((a, b) => {
      const bUsage = usage[b.id] ?? 0;
      const aUsage = usage[a.id] ?? 0;
      if (bUsage !== aUsage) {
        return bUsage - aUsage;
      }
      return byRecommended(a, b);
    });
  }

  return list.sort(byRecommended);
}

export function buildTemplateResumeTitle(templateName: string, date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${templateName}简历 - ${year}-${month}-${day}`;
}
