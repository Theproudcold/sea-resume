import type { Column, Content, Node as PdfNode, NodeQueries, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { LayoutRecipe } from '@/types/layout-template';
import type { ResumeData } from '@/types/resume';
import { readLayoutRecipe, splitSections } from '@/utils/layout-template';
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
  const centered = layout.variant === 'classic';
  const align = centered ? { alignment: 'center' as const } : {};
  const profile: Content[] = [
    { text: data.basic.name || data.title || '简历', style: 'resumeName', color: headerText, ...align },
    ...(data.basic.title ? [{ text: data.basic.title, style: 'resumeHeadline', color: headerText, ...align } as Content] : []),
    ...(layout.variant !== 'professional' && contacts.length
      ? [{ text: contacts, style: 'contactLine', margin: [0, 5, 0, 0], ...align } as Content]
      : []),
  ];
  // 头像资源始终是 1:1：方形直接嵌入，圆形由调用方预先裁成透明角 PNG。
  const image: Column[] = avatar ? [{ image: avatar, fit: [58, 58], alignment: 'center', margin: [4, 0, 4, 0] }] : [];
  if (centered) {
    return {
      stack: [
        ...(avatar ? [{ image: avatar, fit: [54, 54], alignment: 'center' as const, margin: [0, 0, 0, 6] } as Content] : []),
        ...profile,
      ],
      margin: [0, 0, 0, 13],
    };
  }
  const avatarOnLeft = layout.variant === 'ai-agent' || layout.variant === 'campus';
  const columns: Column[] = avatarOnLeft
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
  const accentOnly = layout.variant === 'creative'
    || layout.variant === 'tech'
    || layout.variant === 'editorial'
    || layout.variant === 'engineer'
    || layout.variant === 'campus';
  return {
    text: section.title,
    style: 'sectionHeader',
    color: accentOnly ? layout.accent : layout.ink,
    margin: [0, topMargin, 0, 5],
    ...(!accentOnly ? { decoration: 'underline' as const, decorationColor: layout.accent, decorationStyle: 'solid' as const } : {}),
  };
}

function renderSections(sections: PdfResumeSection[], layout: PdfTemplateLayout, topMargin: number): Content[] {
  return sections.flatMap((section) => [
    createSectionHeading(section, layout, topMargin),
    ...section.content,
  ]);
}

function createTwoColumnBody(
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
  const includeContactsInSidebar = layout.variant === 'professional';
  const contactContent = includeContactsInSidebar ? contactRuns(data, layout.ink) : [];
  const contacts = contactContent.length
    ? [{ text: '联系方式', style: 'sidebarHeader', color: layout.accent } as Content, { text: contactContent, style: 'sidebarContact', margin: [0, 0, 0, 8] } as Content]
    : [];
  const sideStack: Content[] = [
    ...summary,
    ...contacts,
    ...renderSections(sidebar, layout, topMargin),
  ];
  const sideCol: Column = { width: 158, stack: sideStack };
  const mainCol: Column = { width: '*', stack: renderSections(main, layout, topMargin) };
  return {
    columns: layout.sidebarSide === 'right' ? [mainCol, sideCol] : [sideCol, mainCol],
    columnGap: 18,
  };
}

function recipeHeading(section: PdfResumeSection, recipe: LayoutRecipe, accent: string, ink: string, topMargin: number): Content {
  const color = recipe.heading === 'accent' ? accent : ink;
  return {
    text: section.title,
    style: 'sectionHeader',
    color,
    margin: [0, topMargin, 0, 5],
    ...(recipe.heading === 'underline' ? { decoration: 'underline' as const, decorationColor: accent, decorationStyle: 'solid' as const } : {}),
  };
}

function recipeSectionStack(sections: PdfResumeSection[], recipe: LayoutRecipe, accent: string, ink: string, topMargin: number): Content[] {
  return sections.flatMap((section) => [recipeHeading(section, recipe, accent, ink, topMargin), ...section.content]);
}

/** 自定义版式和 DOM 预览读同一份配方；没有配方的简历仍走原来的六套 PDF 版式。 */
function createRecipePdfDefinition(data: ResumeData, recipe: LayoutRecipe, avatarDataUrl?: string): TDocumentDefinitions {
  const accent = validColor(data.theme.color, recipe.tokens.accent);
  const ink = validColor(recipe.tokens.ink, '#1f2937');
  const muted = validColor(recipe.tokens.muted, '#64748b');
  const dark = recipe.paper === 'dark';
  const headerText = recipe.header.fill === 'accent' ? '#ffffff' : ink;
  const sections = buildResumeSections(data);
  const single = recipe.structure === 'single';
  const columns = splitSections(recipe, sections.map((section) => section.id));
  const byId = new Map(sections.map((section) => [section.id, section]));
  const pick = (ids: string[]) => ids.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
  const margin = pxToPt(data.theme.pageMargins, 32) || DEFAULT_MARGIN;
  const sectionGap = pxToPt(data.theme.moduleMargins.bottom, 12);
  const contacts = contactRuns(data, headerText);
  const summary = data.basic.summary && recipe.summaryPlacement !== 'hidden' ? richTextToPdfContent(data.basic.summary) : [];
  const avatar: Column[] = avatarDataUrl && recipe.header.avatar !== 'none'
    ? [{ image: avatarDataUrl, fit: [58, 58], alignment: 'center', margin: [4, 0, 4, 0] }]
    : [];
  const profile: Content[] = [
    { text: data.basic.name || data.title || '简历', style: 'resumeName', color: headerText },
    ...(data.basic.title ? [{ text: data.basic.title, style: 'resumeHeadline', color: headerText } as Content] : []),
    ...((single || recipe.contactsPlacement === 'header') && contacts.length ? [{ text: contacts, style: 'contactLine', margin: [0, 5, 0, 0] } as Content] : []),
  ];
  const profileColumn: Column = { width: '*', stack: profile };
  const headerColumns = recipe.header.avatar === 'start' ? [...avatar, profileColumn] : [profileColumn, ...avatar];
  const content: Content[] = [{
    columns: headerColumns,
    columnGap: 14,
    margin: recipe.header.fill === 'accent' ? [12, 12, 12, 14] : [0, 0, 0, 13],
    ...(recipe.header.fill === 'accent' ? { fillColor: accent, color: headerText } : {}),
  }];
  const main = recipeSectionStack(pick(single ? columns.main : columns.main), recipe, accent, ink, sectionGap);
  if (!single && recipe.structure !== 'single') {
    const sidebarSections = pick(columns.sidebar);
    const sidebar: Content[] = [
      ...(recipe.summaryPlacement === 'sidebar' ? summary : []),
      ...(recipe.contactsPlacement === 'sidebar' && contacts.length ? [{ text: contacts, style: 'sidebarContact', margin: [0, 0, 0, 8] } as Content] : []),
      ...recipeSectionStack(sidebarSections, recipe, accent, ink, sectionGap),
    ];
    const sidebarColumn: Column = { width: `${recipe.sidebarWidth}%`, stack: sidebar };
    const mainColumn: Column = { width: '*', stack: [...(recipe.summaryPlacement === 'main' ? summary : []), ...main] };
    content.push({
      columns: recipe.structure === 'sidebar-right' ? [mainColumn, sidebarColumn] : [sidebarColumn, mainColumn],
      columnGap: 18,
    });
  } else {
    if (recipe.summaryPlacement !== 'hidden') content.push(...summary);
    content.push(...main);
  }
  const fontSize = Math.max(7, Math.min(18, pxToPt(data.theme.fontSize, 10) || 10));
  const lineHeight = Math.max(1, Math.min(2, Number(data.theme.lineHeight) || 1.35));
  return {
    pageSize: 'A4',
    pageMargins: [margin, margin, margin, margin],
    ...(dark ? { background: { canvas: [{ type: 'rect', x: 0, y: 0, w: 595.28, h: 841.89, color: '#18232d' }] } } : {}),
    info: { title: `${data.basic.name || data.title || '简历'} - 简历`, author: data.basic.name || '', subject: '简历' },
    defaultStyle: { font: 'NotoSansSC', fontSize, color: ink, lineHeight },
    styles: {
      resumeName: { fontSize: 22, bold: true, margin: [0, 0, 0, 2] },
      resumeHeadline: { fontSize: 11, color: recipe.header.fill === 'accent' ? '#ffffff' : muted, margin: [0, 0, 0, 1] },
      contactLine: { fontSize: 8, lineHeight: 1.2 },
      sidebarContact: { fontSize: 7.5, lineHeight: 1.3, color: ink },
      sectionHeader: { fontSize: 11, bold: true, color: accent },
      entryTitle: { fontSize, bold: true, color: ink },
      entryDate: { fontSize: Math.max(7, fontSize - 1), color: muted, alignment: 'right' },
      entrySubtitle: { fontSize: Math.max(7, fontSize - 0.5), color: muted },
      bodyText: { fontSize, lineHeight, color: ink },
      richList: { fontSize, lineHeight, margin: [8, 0, 0, 0], color: ink },
    },
    content,
  };
}

/** Build a searchable A4 PDF definition directly from resume data, without rendering the Vue DOM. */
export function createResumePdfDefinition(data: ResumeData, avatarDataUrl?: string): TDocumentDefinitions {
  const recipe = readLayoutRecipe(data.layout);
  if (recipe) return createRecipePdfDefinition(data, recipe, avatarDataUrl);
  const baseLayout = getPdfTemplateLayout(data.templateId);
  const layout: PdfTemplateLayout = {
    ...baseLayout,
    accent: validColor(data.theme.color, baseLayout.accent),
  };
  const sections = buildResumeSections(data);
  const margin = pxToPt(data.theme.pageMargins, layout.pageMargin) || DEFAULT_MARGIN;
  const sectionGap = pxToPt(data.theme.moduleMargins.bottom, layout.compact ? 8 : 12);
  const content: Content[] = [createHeader(data, layout, avatarDataUrl)];

  if (layout.sidebarSections?.length) {
    content.push(createTwoColumnBody(data, sections, layout, sectionGap));
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
