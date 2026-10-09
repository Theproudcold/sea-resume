import type { CustomBlock, CustomItem, ResumeData } from '@/types/resume';
import type { MarkdownImportResult, MarkdownImportWarning } from '@/types/markdown-import';
import { generateId } from '@/utils/helpers';
import { markdownToSafeHtml, sanitizeMarkdownUrl } from './markdownSafety';

const DATE_TOKEN = '(?:\\d{4}(?:[./-]\\d{1,2})?|至今|现在|目前|present|current)';
const DATE_RANGE = new RegExp(`(${DATE_TOKEN})\\s*(?:-|–|—|~|至|到|to)\\s*(${DATE_TOKEN})`, 'i');
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

interface MarkdownBlock { title: string; level: number; lines: string[] }
interface ResumeSection { title: string; kind: string | null; lines: string[] }

function cleanInline(value: string): string {
  return value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1').replace(/[*_`~]/g, '').trim();
}

function unquote(value: string): string {
  const text = value.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).replace(/\\n/g, '\n');
  }
  return text;
}

function parseFrontmatter(source: string, warnings: MarkdownImportWarning[]) {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') return { values: {} as Record<string, string>, body: lines };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end < 0) {
    warnings.push({ code: 'parse', message: 'YAML frontmatter 缺少结束标记，已按普通文本解析。' });
    return { values: {} as Record<string, string>, body: lines };
  }
  const values: Record<string, string> = {};
  let activeKey = '';
  for (const line of lines.slice(1, end)) {
    const pair = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (pair) {
      activeKey = (pair[1] ?? '').toLowerCase();
      const value = (pair[2] ?? '').trim();
      values[activeKey] = value && value !== '|' && value !== '>' ? unquote(value.replace(/^\[(.*)\]$/, '$1')) : '';
      continue;
    }
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && activeKey) values[activeKey] = [values[activeKey], unquote(listItem[1] ?? '')].filter(Boolean).join(', ');
    else if (/^\s+/.test(line) && activeKey && line.trim()) values[activeKey] += `${values[activeKey] ? '\n' : ''}${unquote(line.trim())}`;
  }
  return { values, body: lines.slice(end + 1) };
}

function sectionKind(title: string): string | null {
  const key = title.toLowerCase().replace(/[\s_—–-]/g, '');
  if (/^(个人简介|个人概况|自我介绍|简介|summary|profile|aboutme)$/.test(key)) return 'summary';
  if (/^(工作经历|工作经验|职业经历|任职经历|experience|experiences|workexperience|employment)$/.test(key)) return 'experience';
  if (/^(教育经历|教育背景|学历|education|academic)$/.test(key)) return 'education';
  if (/^(项目经历|项目经验|项目|projects|projectexperience)$/.test(key)) return 'projects';
  if (/^(技能|技能证书|专业技能|技术栈|技能清单|skills|techstack|technologies)$/.test(key)) return 'skills';
  return null;
}

function sectionBlocks(lines: string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let current: MarkdownBlock | null = null;
  for (const line of lines) {
    const match = line.match(HEADING);
    if (match) {
      if (current) blocks.push(current);
      current = { title: cleanInline(match[2] ?? ''), level: (match[1] ?? '').length, lines: [] };
    } else if (current) current.lines.push(line);
    else if (line.trim()) {
      if (!blocks.length) blocks.push({ title: '', level: 0, lines: [line] });
      else blocks[blocks.length - 1]?.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function parseDateRange(source: string, warnings: MarkdownImportWarning[]): [string, string] {
  const match = source.match(DATE_RANGE);
  if (!match) return ['', ''];
  const normalize = (value: string): string => {
    const date = value.trim().replace(/[./]/g, '-');
    if (/^(至今|现在|目前|present|current)$/i.test(date)) return 'present';
    if (/^\d{4}-\d{1,2}$/.test(date)) return date.replace(/-(\d)$/, '-0$1');
    if (/^\d{4}$/.test(date)) return date;
    return '';
  };
  const start = normalize(match[1] ?? '');
  const end = normalize(match[2] ?? '');
  if (!start || !end) warnings.push({ code: 'uncertain-date', message: `日期范围“${match[0]}”未能可靠转换，已保留在条目文本中。` });
  return [start, end];
}

function emptyResume(title: string): ResumeData {
  const now = new Date().toISOString();
  return {
    id: generateId(), title, basic: { name: '', title: '', email: '', phone: '' },
    experiences: [], education: [], skills: [], projects: [], customBlocks: [], templateId: 'modern',
    theme: { color: '#2563eb', fontFamily: 'sans-serif', fontSize: 14, lineHeight: 1.5, moduleMargins: { top: 0, bottom: 24, left: 0, right: 0 }, pageMargins: 24, dateFormat: 'YYYY.MM', displayIcons: true },
    sectionOrder: ['experience', 'projects', 'education', 'skills'], hiddenSections: [],
    sectionTitles: { experience: '工作经历', projects: '项目经验', education: '教育背景', skills: '技能证书' },
    createdAt: now, updatedAt: now,
  };
}

function field(record: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const key = name.toLowerCase().replace(/[\s_-]/g, '');
    const found = Object.entries(record).find(([candidate]) => candidate === key)?.[1];
    if (found) return found;
  }
  return '';
}

function parseContact(lines: string[], resume: ResumeData, warnings: MarkdownImportWarning[]) {
  const source = lines.join('\n');
  const email = source.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
  const phone = source.match(/(?:\+?\d[\d\s().-]{6,}\d)/)?.[0]?.trim();
  if (email) resume.basic.email = email;
  if (phone) resume.basic.phone = phone;
  const markdownLinks: Array<[string, string]> = [...source.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((m) => [m[1] ?? '', m[2] ?? '']);
  const rawLinks: Array<[string, string]> = [...source.matchAll(/https?:\/\/[^\s)<>]+/g)].map((m) => [m[0] ?? '', m[0] ?? '']);
  const links = [...markdownLinks, ...rawLinks].filter(([, url]) => !!sanitizeMarkdownUrl(url));
  const safeLinks = [...new Map<string, [string, string]>(links.map(([label, url]) => [url, [label, url]])).values()];
  if (safeLinks.length) {
    resume.basic.website = safeLinks[0]?.[1];
    if (safeLinks.length > 1) {
      const content = safeLinks.slice(1).map(([label, url]) => `[${label}](${url})`).join('\n');
      resume.customBlocks.push({ id: generateId(), title: '其他链接', type: 'text', content: markdownToSafeHtml(content), order: resume.customBlocks.length });
      warnings.push({ code: 'unmapped-link', message: '检测到多个个人链接，主链接已放入个人信息，其余链接保存在“其他链接”模块。' });
    }
  }
  if (/\b(?:javascript|data):|<\/?[a-z][^>]*>/i.test(source)) {
    warnings.push({ code: 'unsafe-html', message: '检测到 HTML 或不安全链接；原始 HTML 不会执行，危险链接不会创建。' });
  }
}

function entryParts(block: MarkdownBlock, warnings: MarkdownImportWarning[]) {
  const allText = `${block.title}\n${block.lines.join('\n')}`;
  const [startDate, endDate] = parseDateRange(allText, warnings);
  const labeled: Record<string, string> = {};
  const descriptionLines: string[] = [];
  for (const line of block.lines.map((value) => value.trim()).filter(Boolean)) {
    const match = line.match(/^\s*(?:[-*+]\s*)?(?:\*\*)?([^:*：|]+?)(?:\*\*)?\s*[:：]\s*(.+)$/);
    if (match) {
      const key = (match[1] ?? '').toLowerCase().replace(/[\s_-]/g, '');
      const rawValue = match[2] ?? '';
      const link = rawValue.match(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/i)?.[1];
      labeled[key] = (key === 'link' || key === 'url' || key === '链接') && link ? link : cleanInline(rawValue);
    }
    else descriptionLines.push(line);
  }
  const title = cleanInline(block.title.replace(DATE_RANGE, '').replace(/[|｜—–]+$/, ''));
  const parts = title.split(/\s*[|｜]\s*|\s+[—–]\s+/).map(cleanInline).filter(Boolean);
  const bullets = descriptionLines.filter((line) => /^[-*+]\s+/.test(line)).map((line) => line.replace(/^[-*+]\s+/, ''));
  return { title, parts, labeled, descriptionLines, bullets, startDate, endDate };
}

function mapEntry(kind: string, block: MarkdownBlock, resume: ResumeData, warnings: MarkdownImportWarning[]) {
  const parsed = entryParts(block, warnings);
  const description = markdownToSafeHtml(parsed.descriptionLines.join('\n'));
  if (kind === 'experience') {
    resume.experiences.push({
      id: generateId(), company: field(parsed.labeled, '公司', 'company', '组织') || parsed.parts[0] || parsed.title,
      position: field(parsed.labeled, '职位', '岗位', 'position', 'role') || parsed.parts[1] || '',
      startDate: parsed.startDate, endDate: parsed.endDate, description, highlights: parsed.bullets,
    });
  } else if (kind === 'education') {
    resume.education.push({
      id: generateId(), school: field(parsed.labeled, '学校', '院校', 'school', 'university') || parsed.parts[0] || parsed.title,
      degree: field(parsed.labeled, '学历', '学位', 'degree') || parsed.parts[1] || '',
      major: field(parsed.labeled, '专业', 'major', 'field') || parsed.parts[2] || '',
      startDate: parsed.startDate, endDate: parsed.endDate,
      gpa: field(parsed.labeled, 'gpa', '绩点') || undefined,
    });
  } else if (kind === 'projects') {
    const link = field(parsed.labeled, '链接', 'link', 'url');
    resume.projects.push({
      id: generateId(), name: field(parsed.labeled, '项目', '项目名称', 'name') || parsed.parts[0] || parsed.title,
      role: field(parsed.labeled, '角色', 'role', '职责') || parsed.parts[1] || '',
      startDate: parsed.startDate, endDate: parsed.endDate, description,
      link: sanitizeMarkdownUrl(link) ?? undefined,
      techStack: (field(parsed.labeled, '技术栈', '技术', 'techstack', 'technologies') || '').split(/[,，、]/).map((item) => item.trim()).filter(Boolean),
    });
  }
}

function toCustomBlock(title: string, lines: string[], order: number): CustomBlock {
  const chunks = sectionBlocks(lines);
  const items: CustomItem[] = chunks.filter((chunk) => chunk.title).map((chunk) => ({
    id: generateId(), title: chunk.title, description: markdownToSafeHtml(chunk.lines.join('\n')),
  }));
  return {
    id: generateId(), title, type: items.length ? 'list' : 'text',
    content: items.length ? items : markdownToSafeHtml(lines.join('\n')), order,
  };
}

export function parseResumeMarkdown(source: string, filename = 'resume.md'): MarkdownImportResult {
  const warnings: MarkdownImportWarning[] = [];
  if (!source.trim()) throw new Error('Markdown 文件为空。');
  if (source.length > 1024 * 1024) throw new Error('Markdown 文件不能超过 1 MB。');
  const { values, body } = parseFrontmatter(source, warnings);
  const knownFrontmatter = new Set(['title', 'name', 'position', 'jobtitle', 'email', 'phone', 'location', 'website', 'url', 'summary', 'template', 'birthdate', 'birthday', 'dateofbirth']);
  const firstH1 = body.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, '').trim() ?? '';
  const identity = firstH1.split(/\s*[|｜]\s*|\s*[—–]\s*/).filter(Boolean);
  const fileTitle = filename.replace(/\.(md|markdown)$/i, '').trim() || '导入的简历';
  const sourceTitle = values.title || identity[0] || fileTitle;
  const resume = emptyResume(sourceTitle);
  resume.basic.name = values.name || identity[0] || '';
  resume.basic.title = values.position || values.jobtitle || identity.slice(1).join(' | ') || '';
  resume.basic.email = values.email || '';
  resume.basic.phone = values.phone || '';
  resume.basic.location = values.location || undefined;
  resume.basic.birthDate = values.birthdate || values.birthday || values.dateofbirth || undefined;
  const website = values.website || values.url;
  if (website && sanitizeMarkdownUrl(website)) resume.basic.website = website;
  if (values.summary) resume.basic.summary = markdownToSafeHtml(values.summary);
  if (values.template && ['modern', 'professional', 'creative', 'minimal', 'tech'].includes(values.template)) resume.templateId = values.template;

  const unknownMetadata = Object.entries(values).filter(([key]) => !knownFrontmatter.has(key));
  for (const [key, value] of unknownMetadata) warnings.push({ code: 'unknown-frontmatter', message: `未识别的 frontmatter 字段“${key}”，已保留在自定义模块。`, detail: value });
  if (unknownMetadata.length) {
    resume.customBlocks.push({ id: generateId(), title: '未映射的 Frontmatter', type: 'text', content: markdownToSafeHtml(unknownMetadata.map(([key, value]) => `**${key}**: ${value}`).join('\n')), order: resume.customBlocks.length });
  }

  const headerLines: string[] = [];
  const sections: ResumeSection[] = [];
  let currentSection: ResumeSection | null = null;
  for (const block of sectionBlocks(body)) {
    const kind = sectionKind(block.title);
    if (block.level === 0 || (block.level === 1 && sections.length === 0 && !kind)) {
      headerLines.push(...block.lines);
      continue;
    }
    if (block.level <= 2) {
      currentSection = { title: block.title, kind, lines: [...block.lines] };
      sections.push(currentSection);
    } else if (currentSection) {
      currentSection.lines.push(`### ${block.title}`, ...block.lines);
    } else {
      headerLines.push(...block.lines);
    }
  }
  parseContact(headerLines, resume, warnings);

  const recognizedSections: string[] = [];
  const unknownSections: string[] = [];
  for (const section of sections) {
    if (!section.kind) {
      unknownSections.push(section.title);
      warnings.push({ code: 'unknown-section', message: `章节“${section.title}”未自动映射，已保留为自定义模块。` });
      resume.customBlocks.push(toCustomBlock(section.title, section.lines, resume.customBlocks.length));
      continue;
    }
    recognizedSections.push(section.title);
    if (section.kind === 'summary') {
      resume.basic.summary = markdownToSafeHtml(section.lines.join('\n'));
      continue;
    }
    if (section.kind === 'skills') {
      const categories = sectionBlocks(section.lines).filter((block) => block.title);
      if (categories.length) {
        for (const category of categories) {
          const items = category.lines.join('\n').split(/[,，、\n]/).map((item) => cleanInline(item.replace(/^\s*[-*+]\s+/, ''))).filter(Boolean);
          if (items.length) resume.skills.push({ id: generateId(), category: category.title, items });
        }
      } else {
        const items = section.lines.join('\n').split(/[,，、\n]/).map((item) => cleanInline(item.replace(/^\s*[-*+]\s+/, ''))).filter(Boolean);
        if (items.length) resume.skills.push({ id: generateId(), category: '技能', items });
      }
      continue;
    }
    const entries = sectionBlocks(section.lines).filter((block) => block.title || block.lines.some((line) => line.trim()));
    const normalizedEntries = entries.length ? entries : [{ title: '', level: 0, lines: section.lines }];
    for (const entry of normalizedEntries) mapEntry(section.kind, entry, resume, warnings);
  }
  if (!recognizedSections.length) warnings.push({ code: 'parse', message: '未识别到标准简历章节；原文中可识别的章节已保留为自定义模块。' });
  return {
    resume, warnings, recognizedSections: [...new Set(recognizedSections)], unknownSections, sourceTitle,
  };
}
