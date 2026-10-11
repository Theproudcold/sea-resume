import type { Column, Content, Node as PdfNode, NodeQueries, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { ResumeData } from '@/types/resume';
import { buildResumeSections, type PdfResumeSection } from './sections';
import { getPdfTemplateLayout, type PdfTemplateLayout } from './template-layouts';
import { richTextToPdfContent } from './richText';

const DEFAULT_MARGIN = 38;

function validColor(value: string | undefined, fallback: string): string {
  return value && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) ? value : fallback;
}

function pxToPt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(72, value * 0.75));
}

function safeLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, 'https://resume.invalid');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

function contactRuns(data: ResumeData, color: string): Content[] {
  const values: Array<{ label: string; value?: string; href?: string }> = [
    { label: '电话', value: data.basic.phone, href: data.basic.phone ? `tel:${data.basic.phone.replace(/[^\d+]/g, '')}` : undefined },
    { label: '邮箱', value: data.basic.email, href: data.basic.email ? `mailto:${data.basic.email}` : undefined },
    { label: '所在地', value: data.basic.location },
    { label: '主页', value: data.basic.website, href: safeLink(data.basic.website) },
    ...(data.basic.customContacts ?? []).map((contact) => ({ label: contact.label, value: contact.value })),
  ].filter((item) => item.value?.trim());

  const runs: Content[] = [];
  values.forEach((item, index) => {
    if (index) runs.push({ text: '  ·  ', color });
    const link = item.href ? safeLink(item.href) : undefined;
    runs.push({
      text: `${item.label}：${item.value}`,
      color,
      ...(link ? { link, decoration: 'underline' } : {}),
    });
  });
  return runs;
}

function createHeader(data: ResumeData, layout: PdfTemplateLayout, avatar?: string): Content {
  const headerText = layout.headerText ?? layout.ink;
  const contacts = contactRuns(data, headerText);
  const profile: Content[] = [
    { text: data.basic.name || data.title || '简历', style: 'resumeName', color: headerText },
    ...(data.basic.title ? [{ text: data.basic.title, style: 'resumeHeadline', color: headerText } as Content] : []),
    ...(layout.variant !== 'professional' && contacts.length
      ? [{ text: contacts, style: 'contactLine', margin: [0, 5, 0, 0] } as Content]
      : []),
  ];
  const image: Column[] = avatar ? [{ image: avatar, fit: [58, 76], alignment: 'center', margin: [4, 0, 4, 0] }] : [];
  const columns: Column[] = layout.variant === 'ai-agent'
    ? [...image, { width: '*', stack: profile }]
    : [{ width: '*', stack: profile }, ...image];
  return {
    columns,
    columnGap: 14,
    margin: [0, 0, 0, 13],
    ...(layout.headerFill ? {
      fillColor: layout.headerFill,
      color: headerText,
      margin: [12, 12, 12, 14],
    } : {}),
  };
}

function createSectionHeading(section: PdfResumeSection, layout: PdfTemplateLayout, topMargin: number): Content {
  return {
    text: section.title,
    style: 'sectionHeader',
    color: layout.accent,
    margin: [0, topMargin, 0, 5],
  };
}

function renderSections(sections: PdfResumeSection[], layout: PdfTemplateLayout, topMargin: number): Content[] {
  return sections.flatMap((section) => [
    createSectionHeading(section, layout, topMargin),
    ...section.content,
  ]);
}

function createProfessionalColumns(
  data: ResumeData,
  sections: PdfResumeSection[],
  layout: PdfTemplateLayout,
  topMargin: number,
): Content {
  const sidebarSections = new Set(layout.sidebarSections ?? []);
  const sidebar = sections.filter((section) => sidebarSections.has(section.id));
  const main = sections.filter((section) => !sidebarSections.has(section.id));
  const summary = data.basic.summary
    ? [{ text: '个人简介', style: 'sidebarHeader', color: layout.accent } as Content, ...richTextToPdfContent(data.basic.summary)]
    : [];
  const contactContent = contactRuns(data, layout.ink);
  const contacts = contactContent.length
    ? [{ text: '联系方式', style: 'sidebarHeader', color: layout.accent } as Content, { text: contactContent, style: 'sidebarContact', margin: [0, 0, 0, 8] } as Content]
    : [];
  const left: Content[] = [
    ...summary,
    ...contacts,
    ...renderSections(sidebar, layout, topMargin),
  ];
  return {
    columns: [
      { width: 154, stack: left },
      { width: '*', stack: renderSections(main, layout, topMargin) },
    ],
    columnGap: 18,
  };
}

/** Build a searchable A4 PDF definition directly from resume data, without rendering the Vue DOM. */
export function createResumePdfDefinition(data: ResumeData, avatarDataUrl?: string): TDocumentDefinitions {
  const baseLayout = getPdfTemplateLayout(data.templateId);
  const layout: PdfTemplateLayout = {
    ...baseLayout,
    accent: validColor(data.theme.color, baseLayout.accent),
  };
  const sections = buildResumeSections(data);
  const margin = pxToPt(data.theme.pageMargins, layout.pageMargin) || DEFAULT_MARGIN;
  const sectionGap = pxToPt(data.theme.moduleMargins.bottom, layout.compact ? 8 : 12);
  const content: Content[] = [createHeader(data, layout, avatarDataUrl)];

  if (layout.variant === 'professional') {
    content.push(createProfessionalColumns(data, sections, layout, sectionGap));
  } else {
    if (data.basic.summary) content.push(...richTextToPdfContent(data.basic.summary));
    content.push(...renderSections(sections, layout, sectionGap));
  }

  const fontSize = Math.max(7, Math.min(18, pxToPt(data.theme.fontSize, 10) || 10));
  const lineHeight = Math.max(1, Math.min(2, Number(data.theme.lineHeight) || 1.35));
  const definitions: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [margin, margin, margin, margin],
    info: {
      title: `${data.basic.name || data.title || '简历'} - 简历`,
      author: data.basic.name || '',
      subject: '简历',
    },
    defaultStyle: { font: 'NotoSansSC', fontSize, color: layout.ink, lineHeight },
    styles: {
      resumeName: { fontSize: layout.compact ? 20 : 23, bold: true, margin: [0, 0, 0, 2] },
      resumeHeadline: { fontSize: layout.compact ? 10 : 11, color: layout.muted, margin: [0, 0, 0, 1] },
      contactLine: { fontSize: layout.compact ? 7 : 8, lineHeight: 1.2 },
      sidebarContact: { fontSize: 7.5, lineHeight: 1.3 },
      sectionHeader: { fontSize: layout.compact ? 10 : 11, bold: true, color: layout.accent },
      sidebarHeader: { fontSize: 9, bold: true, margin: [0, 7, 0, 4] },
      entryTitle: { fontSize, bold: true, color: layout.ink },
      entryDate: { fontSize: Math.max(7, fontSize - 1), color: layout.muted, alignment: 'right' },
      entrySubtitle: { fontSize: Math.max(7, fontSize - 0.5), color: layout.muted },
      bodyText: { fontSize, lineHeight },
      richList: { fontSize, lineHeight, margin: [8, 0, 0, 0] },
    },
    content,
    pageBreakBefore(currentNode: PdfNode, nodeQueries: NodeQueries) {
      const styles = Array.isArray(currentNode.style) ? currentNode.style : [currentNode.style];
      return styles.includes('sectionHeader') && nodeQueries.getFollowingNodesOnPage().length === 0;
    },
  };
  return definitions;
}
