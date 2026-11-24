import type { ResumeData } from '@/types/resume';
import { generateId } from '@/utils/helpers';
import { parseAvatarShape } from '@/utils/avatarShape';
import { validateJsonImportFileSize } from '@/utils/importLimits';
import { isLayoutTemplateId, readLayoutRecipe } from '@/utils/layout-template';
import { sanitizeRichTextHtml, sanitizeMarkdownUrl } from '@/utils/markdown/markdownSafety';

export { MAX_JSON_IMPORT_FILE_SIZE, validateJsonImportFileSize } from '@/utils/importLimits';


const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, field: string, fallback = ''): string => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') throw new Error(`JSON 简历字段「${field}」格式无效。`);
  return value;
};

/** Section titles are display-only labels, so an invalid value falls back instead of failing the whole import. */
function sectionTitle(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

const STANDARD_SECTION_TITLE_KEYS = new Set(['experience', 'education', 'projects', 'skills']);

/** Custom section ids are spread before the typed titles, so they must be strings only. */
function customSectionTitles(titles: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(titles)) {
    if (STANDARD_SECTION_TITLE_KEYS.has(key)) continue;
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

function normalizeRecords(value: unknown, field: string, required: string[]): Array<Record<string, unknown>> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 500) throw new Error(`JSON 简历字段「${field}」格式无效。`);
  return value.map((item) => {
    if (!isRecord(item)) throw new Error(`JSON 简历字段「${field}」中有无效条目。`);
    for (const key of required) text(item[key], `${field}.${key}`);
    return item;
  });
}

/** Validate and fill compatible defaults before restoring untrusted JSON data. */
export function validateResumeData(input: unknown): ResumeData {
  if (!isRecord(input)) throw new Error('JSON 文件不是有效的简历对象。');
  if (!isRecord(input.basic)) throw new Error('JSON 简历缺少个人信息。');
  const basic = input.basic;
  const experiences = normalizeRecords(input.experiences, 'experiences', ['company', 'position', 'description']);
  const customContacts = normalizeRecords(basic.customContacts, 'basic.customContacts', ['label', 'value', 'icon']);
  const education = normalizeRecords(input.education, 'education', ['school', 'degree', 'major']);
  const projects = normalizeRecords(input.projects, 'projects', ['name', 'role', 'description']);
  const skills = normalizeRecords(input.skills, 'skills', ['category']);
  const customBlocks = normalizeRecords(input.customBlocks, 'customBlocks', ['title']);
  const theme = isRecord(input.theme) ? input.theme : {};
  const margins = isRecord(theme.moduleMargins) ? theme.moduleMargins : {};
  const titles = isRecord(input.sectionTitles) ? input.sectionTitles : {};
  const now = new Date().toISOString();
  const requestedTemplateId = text(input.templateId, 'templateId', 'modern');
  const layout = readLayoutRecipe(input.layout);
  const builtinTemplateIds = ['modern', 'professional', 'creative', 'minimal', 'tech', 'ai-agent'];
  const templateId = layout && isLayoutTemplateId(requestedTemplateId)
    ? requestedTemplateId
    : builtinTemplateIds.includes(requestedTemplateId) ? requestedTemplateId : 'modern';

  const resume = {
    ...input,
    id: text(input.id, 'id', generateId()),
    title: text(input.title, 'title', '导入的简历'),
    basic: {
      ...basic,
      name: text(basic.name, 'basic.name'),
      title: text(basic.title, 'basic.title'),
      email: text(basic.email, 'basic.email'),
      phone: text(basic.phone, 'basic.phone'),
      location: text(basic.location, 'basic.location', undefined),
      website: sanitizeMarkdownUrl(text(basic.website, 'basic.website', '')) ?? undefined,
      avatar: /^data:image\/(png|jpeg|webp|gif);base64,/i.test(text(basic.avatar, 'basic.avatar', '')) ? basic.avatar as string : undefined,
      avatarShape: parseAvatarShape(basic.avatarShape),
      birthDate: text(basic.birthDate, 'basic.birthDate', undefined),
      showAge: basic.showAge === true,
      showExperienceYears: basic.showExperienceYears === true,
      summary: basic.summary === undefined ? undefined : sanitizeRichTextHtml(text(basic.summary, 'basic.summary')),
      customContacts: customContacts.map((item) => ({
        id: text(item.id, 'basic.customContacts.id', generateId()),
        label: text(item.label, 'basic.customContacts.label'),
        value: text(item.value, 'basic.customContacts.value'),
        icon: text(item.icon, 'basic.customContacts.icon'),
      })),
    },
    experiences: experiences.map((item) => ({
      id: text(item.id, 'experiences.id', generateId()), company: text(item.company, 'experiences.company'),
      position: text(item.position, 'experiences.position'), startDate: text(item.startDate, 'experiences.startDate'),
      endDate: text(item.endDate, 'experiences.endDate'), description: sanitizeRichTextHtml(text(item.description, 'experiences.description')),
      highlights: Array.isArray(item.highlights) ? item.highlights.map((value) => text(value, 'experiences.highlights')) : [],
    })),
    education: education.map((item) => ({
      id: text(item.id, 'education.id', generateId()), school: text(item.school, 'education.school'),
      degree: text(item.degree, 'education.degree'), major: text(item.major, 'education.major'),
      startDate: text(item.startDate, 'education.startDate'), endDate: text(item.endDate, 'education.endDate'),
      gpa: text(item.gpa, 'education.gpa', undefined),
    })),
    projects: projects.map((item) => ({
      id: text(item.id, 'projects.id', generateId()), name: text(item.name, 'projects.name'),
      role: text(item.role, 'projects.role'), startDate: text(item.startDate, 'projects.startDate'),
      endDate: text(item.endDate, 'projects.endDate'), description: sanitizeRichTextHtml(text(item.description, 'projects.description')),
      link: sanitizeMarkdownUrl(text(item.link, 'projects.link', '')) ?? undefined,
      techStack: Array.isArray(item.techStack) ? item.techStack.map((value) => text(value, 'projects.techStack')) : [],
    })),
    skills: skills.map((item) => ({
      id: text(item.id, 'skills.id', generateId()), category: text(item.category, 'skills.category'),
      items: Array.isArray(item.items) ? item.items.map((value) => text(value, 'skills.items')) : [],
      level: item.level as 'beginner' | 'intermediate' | 'advanced' | 'expert' | undefined,
    })),
    customBlocks: customBlocks.map((item) => {
      const content: ResumeData['customBlocks'][number]['content'] = typeof item.content === 'string'
        ? sanitizeRichTextHtml(item.content)
        : Array.isArray(item.content)
          ? normalizeRecords(item.content, 'customBlocks.content', ['title', 'description']).map((entry) => ({
            id: text(entry.id, 'customBlocks.content.id', generateId()),
            title: text(entry.title, 'customBlocks.content.title'),
            subtitle: text(entry.subtitle, 'customBlocks.content.subtitle', undefined),
            date: text(entry.date, 'customBlocks.content.date', undefined),
            description: sanitizeRichTextHtml(text(entry.description, 'customBlocks.content.description')),
          }))
          : '';
      return {
        id: text(item.id, 'customBlocks.id', generateId()),
        title: text(item.title, 'customBlocks.title'),
        type: Array.isArray(content) ? 'list' : 'text',
        content,
        order: typeof item.order === 'number' ? item.order : 0,
      };
    }),
    templateId,
    theme: {
      color: text(theme.color, 'theme.color', '#2563eb'), fontFamily: text(theme.fontFamily, 'theme.fontFamily', 'sans-serif'),
      fontSize: typeof theme.fontSize === 'number' ? theme.fontSize : 14,
      lineHeight: typeof theme.lineHeight === 'number' ? theme.lineHeight : 1.5,
      moduleMargins: {
        top: typeof margins.top === 'number' ? margins.top : 0, bottom: typeof margins.bottom === 'number' ? margins.bottom : 24,
        left: typeof margins.left === 'number' ? margins.left : 0, right: typeof margins.right === 'number' ? margins.right : 0,
      },
      pageMargins: typeof theme.pageMargins === 'number' ? theme.pageMargins : 24,
      dateFormat: text(theme.dateFormat, 'theme.dateFormat', 'YYYY.MM'), displayIcons: theme.displayIcons !== false,
    },
    sectionOrder: Array.isArray(input.sectionOrder) ? input.sectionOrder.map((value) => text(value, 'sectionOrder')) : ['experience', 'projects', 'education', 'skills'],
    hiddenSections: Array.isArray(input.hiddenSections) ? input.hiddenSections.map((value) => text(value, 'hiddenSections')) : [],
    sectionTitles: {
      // Custom ids first: an unvalidated key must never overwrite the four typed
      // titles below, otherwise {"experience": 123} would slip past validation.
      ...customSectionTitles(titles),
      experience: sectionTitle(titles.experience, '工作经历'),
      education: sectionTitle(titles.education, '教育背景'),
      projects: sectionTitle(titles.projects, '项目经验'),
      skills: sectionTitle(titles.skills, '技能证书'),
    },
    createdAt: text(input.createdAt, 'createdAt', now),
    updatedAt: text(input.updatedAt, 'updatedAt', now),
  } as ResumeData;
  if (layout) resume.layout = layout;
  else delete resume.layout;
  return resume;
}

/**
 * 导出简历数据为 JSON 文件
 * @param data 简历数据
 * @param filename 文件名（不含扩展名）
 */
export function exportToJSON(data: ResumeData, filename: string = 'resume-data'): void {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('JSON 导出失败:', error);
    throw error;
  }
}

/**
 * 从 JSON 文件导入简历数据
 * @returns Promise<ResumeData>
 */
export function importFromJSON(): Promise<ResumeData> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }
      try {
        validateJsonImportFileSize(file.size);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('JSON 文件大小无效。'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const jsonStr = event.target?.result as string;
          const data = validateResumeData(JSON.parse(jsonStr));
          resolve(data);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('JSON 解析失败'));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    };

    input.click();
  });
}
