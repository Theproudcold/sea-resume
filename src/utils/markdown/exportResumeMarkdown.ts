import type { CustomBlock, ResumeData } from '@/types/resume';

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
    return block.content.map((item) => [
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
  if (resume.basic.summary) lines.push('', '## 个人简介', '', htmlToMarkdown(resume.basic.summary));

  if (resume.experiences.length) {
    lines.push('', `## ${resume.sectionTitles.experience || '工作经历'}`);
    for (const item of resume.experiences) {
      lines.push('', `### ${[item.company, item.position].filter(Boolean).join(' | ')}${item.startDate || item.endDate ? ` | ${dateRange(item.startDate, item.endDate)}` : ''}`);
      if (item.description) lines.push('', htmlToMarkdown(item.description));
      if (item.highlights?.length) lines.push('', ...item.highlights.map((highlight) => `- ${highlight}`));
    }
  }
  if (resume.projects.length) {
    lines.push('', `## ${resume.sectionTitles.projects || '项目经验'}`);
    for (const item of resume.projects) {
      lines.push('', `### ${[item.name, item.role].filter(Boolean).join(' | ')}${item.startDate || item.endDate ? ` | ${dateRange(item.startDate, item.endDate)}` : ''}`);
      if (item.link) lines.push('', `链接：[${item.link}](${item.link})`);
      if (item.techStack?.length) lines.push('', `技术栈：${item.techStack.join('、')}`);
      if (item.description) lines.push('', htmlToMarkdown(item.description));
    }
  }
  if (resume.education.length) {
    lines.push('', `## ${resume.sectionTitles.education || '教育背景'}`);
    for (const item of resume.education) {
      lines.push('', `### ${[item.school, item.degree, item.major].filter(Boolean).join(' | ')}${item.startDate || item.endDate ? ` | ${dateRange(item.startDate, item.endDate)}` : ''}`);
      if (item.gpa) lines.push('', `GPA：${item.gpa}`);
    }
  }
  if (resume.skills.length) {
    lines.push('', `## ${resume.sectionTitles.skills || '技能证书'}`);
    for (const item of resume.skills) lines.push('', `### ${item.category}`, '', ...item.items.map((skill) => `- ${skill}`));
  }
  for (const block of [...resume.customBlocks].sort((a, b) => a.order - b.order)) {
    lines.push('', `## ${block.title}`, '', renderCustomBlock(block));
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
