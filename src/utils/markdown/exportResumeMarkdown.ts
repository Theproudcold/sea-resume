import type { CustomBlock, ResumeData } from '@/types/resume';
import { orderedSectionIds, sectionDisplayTitle } from '@/resume/sections';

function isVisible<T extends { visible?: boolean }>(item: T): boolean {
  return item.visible !== false;
}

function isSectionHidden(resume: ResumeData, id: string): boolean {
  return (resume.hiddenSections ?? []).includes(id);
}

function htmlToMarkdown(value: string): string {
  if (!value) return '';
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(value, 'text/html');
    const render = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const element = node as HTMLElement;
      const inner = [...element.childNodes].map(render).join('');
      switch (element.tagName.toLowerCase()) {
        case 'br': return '\n';
        case 'strong': case 'b': return `**${inner}**`;
        case 'em': case 'i': return `*${inner}*`;
        case 'a': return `[${inner}](${element.getAttribute('href') ?? ''})`;
        case 'li': return `- ${inner}\n`;
        case 'ul': case 'ol': return `${inner}\n`;
        case 'p': case 'div': case 'blockquote': return `${inner}\n\n`;
        default: return inner;
      }
    };
    return [...doc.body.childNodes].map(render).join('').replace(/\n{3,}/g, '\n\n').trim();
  }
  return value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]*>/g, '').trim();
}

function dateRange(start: string, end: string): string {
  if (!start && !end) return '';
  const format = (value: string) => value === 'present' ? '至今' : value;
  return `${format(start || '')}${start && end ? ' — ' : ''}${format(end || '')}`;
}

function renderCustomBlock(block: CustomBlock): string {
  if (Array.isArray(block.content)) {
    return block.content.filter(isVisible).map((item) => [
      `### ${item.title}`,
      item.subtitle ? `**${item.subtitle}**` : '',
      item.date ? `_${item.date}_` : '',
      htmlToMarkdown(item.description),
    ].filter(Boolean).join('\n\n')).join('\n\n');
  }
  return htmlToMarkdown(block.content);
}

export function resumeToMarkdown(resume: ResumeData): string {
  const lines: string[] = [];
  lines.push(`# ${resume.basic.name || resume.title || '简历'}${resume.basic.title ? ` | ${resume.basic.title}` : ''}`);
  const contacts = [resume.basic.email, resume.basic.phone, resume.basic.location, resume.basic.website]
    .filter(Boolean)
    .map((value) => value === resume.basic.website ? `[${value}](${value})` : value);
  if (contacts.length) lines.push('', contacts.join(' · '));
  const customContacts = (resume.basic.customContacts ?? []).filter((contact) => contact.label && contact.value);
  if (customContacts.length) {
    lines.push('', ...customContacts.map((contact) => `- **${contact.label}**：${contact.value}`));
  }
  if (resume.basic.summary) lines.push('', '## 个人简介', '', htmlToMarkdown(resume.basic.summary));

  const experiences = resume.experiences.filter(isVisible);
  const projects = resume.projects.filter(isVisible);
  const education = resume.education.filter(isVisible);
  const skills = resume.skills.filter(isVisible);
  for (const id of orderedSectionIds(resume)) {
    if (isSectionHidden(resume, id)) continue;
    const title = sectionDisplayTitle(resume, id);
    if (id === 'experience' && experiences.length) {
      lines.push('', `## ${title}`);
      for (const item of experiences) {
        lines.push('', `### ${[item.company, item.position].filter(Boolean).join(' | ')}${item.startDate || item.endDate ? ` | ${dateRange(item.startDate, item.endDate)}` : ''}`);
        if (item.description) lines.push('', htmlToMarkdown(item.description));
        if (item.highlights?.length) lines.push('', ...item.highlights.map((highlight) => `- ${highlight}`));
      }
    } else if (id === 'projects' && projects.length) {
      lines.push('', `## ${title}`);
      for (const item of projects) {
        lines.push('', `### ${[item.name, item.role].filter(Boolean).join(' | ')}${item.startDate || item.endDate ? ` | ${dateRange(item.startDate, item.endDate)}` : ''}`);
        if (item.link) lines.push('', `链接：[${item.link}](${item.link})`);
        if (item.techStack?.length) lines.push('', `技术栈：${item.techStack.join('、')}`);
        if (item.description) lines.push('', htmlToMarkdown(item.description));
      }
    } else if (id === 'education' && education.length) {
      lines.push('', `## ${title}`);
      for (const item of education) {
        lines.push('', `### ${[item.school, item.degree, item.major].filter(Boolean).join(' | ')}${item.startDate || item.endDate ? ` | ${dateRange(item.startDate, item.endDate)}` : ''}`);
        if (item.gpa) lines.push('', `GPA：${item.gpa}`);
      }
    } else if (id === 'skills' && skills.length) {
      lines.push('', `## ${title}`);
      for (const item of skills) lines.push('', `### ${item.category}`, '', ...item.items.map((skill) => `- ${skill}`));
    } else if (!['experience', 'projects', 'education', 'skills'].includes(id)) {
      const block = resume.customBlocks.find((item) => item.id === id);
      if (!block) continue;
      const content = renderCustomBlock(block);
      if (!content) continue;
      lines.push('', `## ${title}`, '', content);
    }
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export function downloadMarkdown(markdown: string, filename: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename.replace(/[\\/:*?"<>|]/g, '_') || 'resume'}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
