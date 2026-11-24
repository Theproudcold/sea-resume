import type { Content } from 'pdfmake/interfaces';
import type { CustomBlock, CustomItem, ResumeData } from '@/types/resume';
import { orderedSectionIds, PDF_SECTION_TITLE_FALLBACKS, sectionDisplayTitle } from '@/resume/sections';
import { formatResumeDateRange } from './dateFormat';
import { richTextToPdfContent } from './richText';

export interface PdfResumeSection {
  id: string;
  title: string;
  content: Content[];
}

function isVisible<T extends { visible?: boolean }>(item: T): boolean {
  return item.visible !== false;
}

function entryHeading(title: string, date: string, subtitle?: string): Content[] {
  const rows: Content[] = [{
    columns: [
      { width: '*', text: title, style: 'entryTitle' },
      ...(date ? [{ width: 'auto' as const, text: date, style: 'entryDate' }] : []),
    ],
    columnGap: 8,
    margin: [0, 0, 0, 2],
  }];
  if (subtitle) rows.push({ text: subtitle, style: 'entrySubtitle', margin: [0, 0, 0, 2] });
  return rows;
}

function entryStack(content: Content[]): Content {
  return { stack: content, unbreakable: true, margin: [0, 0, 0, 8] };
}

function buildExperience(data: ResumeData): Content[] {
  return data.experiences.filter(isVisible).map((item) => entryStack([
    ...entryHeading(item.company, formatResumeDateRange(item.startDate, item.endDate, data.theme.dateFormat), item.position),
    ...richTextToPdfContent(item.description),
    ...(item.highlights?.length ? [{ ul: item.highlights.filter(Boolean), style: 'richList', margin: [0, 1, 0, 0] } as Content] : []),
  ]));
}

function buildEducation(data: ResumeData): Content[] {
  return data.education.filter(isVisible).map((item) => entryStack([
    ...entryHeading(item.school, formatResumeDateRange(item.startDate, item.endDate, data.theme.dateFormat), [item.degree, item.major].filter(Boolean).join(' · ')),
    ...(item.gpa ? [{ text: `GPA：${item.gpa}`, style: 'bodyText' } as Content] : []),
  ]));
}

function buildProjects(data: ResumeData): Content[] {
  return data.projects.filter(isVisible).map((item) => {
    const content: Content[] = [
      ...entryHeading(item.name, formatResumeDateRange(item.startDate, item.endDate, data.theme.dateFormat), item.role),
    ];
    if (item.techStack?.length) content.push({ text: [{ text: '技术架构：', bold: true }, item.techStack.join(' + ')], style: 'bodyText', margin: [0, 0, 0, 3] });
    content.push(...richTextToPdfContent(item.description));
    if (item.link && /^https?:\/\//i.test(item.link)) content.push({ text: item.link, link: item.link, color: '#2563eb', fontSize: 8, margin: [0, 0, 0, 2] });
    return entryStack(content);
  });
}

function buildSkills(data: ResumeData): Content[] {
  return data.skills.filter(isVisible).map((item) => ({
    text: [{ text: `${item.category}：`, bold: true }, item.items.join('、')],
    style: 'bodyText',
    margin: [0, 0, 0, 4],
  }));
}

function customBlockContent(block: CustomBlock): Content[] {
  if (typeof block.content === 'string') return richTextToPdfContent(block.content);
  return block.content.filter(isVisible).map((item: CustomItem) => entryStack([
    ...entryHeading(item.title, item.date ?? '', item.subtitle),
    ...richTextToPdfContent(item.description),
  ]));
}

function sectionContent(id: string, data: ResumeData): Content[] {
  switch (id) {
    case 'experience': return buildExperience(data);
    case 'education': return buildEducation(data);
    case 'projects': return buildProjects(data);
    case 'skills': return buildSkills(data);
    default: {
      const block = data.customBlocks.find((item) => item.id === id);
      return block ? customBlockContent(block) : [];
    }
  }
}

export function buildResumeSections(data: ResumeData): PdfResumeSection[] {
  return orderedSectionIds(data)
    .filter((id) => !data.hiddenSections?.includes(id))
    .map((id) => ({
      id,
      title: sectionDisplayTitle(data, id, PDF_SECTION_TITLE_FALLBACKS),
      content: sectionContent(id, data),
    }))
    .filter((section) => section.content.length > 0);
}
