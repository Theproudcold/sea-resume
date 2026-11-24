import type { ResumeData } from '@/types/resume';
import type { ResumePatch, ResumePatchOperation } from '@/types/ai';
import { readLayoutRecipe, themeFromRecipe } from '@/utils/layout-template';
import { markdownToSafeHtml, sanitizeMarkdownUrl } from '@/utils/markdown/markdownSafety';

const templates = new Set(['modern', 'professional', 'creative', 'minimal', 'tech', 'ai-agent']);
const entryCollections = new Set(['experiences', 'projects', 'education', 'skills', 'customBlocks']);
const textFields: Record<string, string[]> = {
  set_basic: ['name', 'title', 'email', 'phone', 'location', 'website', 'summary'],
  update_experience: ['company', 'position', 'startDate', 'endDate', 'description', 'highlights'],
  update_project: ['name', 'role', 'startDate', 'endDate', 'description', 'link', 'techStack'],
  update_education: ['school', 'degree', 'major', 'startDate', 'endDate', 'gpa'],
  update_skill: ['category', 'items'],
  update_custom_block: ['title', 'content'],
};

function safeString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 10000) throw new Error(`AI 操作字段 ${field} 格式无效。`);
  return value;
}
function safeStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== 'string' || item.length > 500)) {
    throw new Error(`AI 操作字段 ${field} 格式无效。`);
  }
  return value as string[];
}

/** Parse and enforce the fixed operation allowlist; never evaluates model output. */
export function parseResumePatch(input: unknown, options?: { allowEmpty?: boolean }): ResumePatch {
  let parsed = input;
  if (typeof parsed === 'string') {
    const stripped = parsed.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { parsed = JSON.parse(stripped); } catch { throw new Error('AI 返回内容不是有效 JSON。'); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AI 返回结构无效。');
  const object = parsed as Record<string, unknown>;
  const explanation = typeof object.explanation === 'string' ? object.explanation.slice(0, 1000) : '';
  if (!Array.isArray(object.operations) || object.operations.length > 40) {
    throw new Error('AI 没有返回可执行的简历修改，或操作数量超出限制。');
  }
  if (object.operations.length === 0) {
    if (!options?.allowEmpty || !explanation.trim()) throw new Error('AI 没有返回可执行的简历修改，或操作数量超出限制。');
    return { explanation, operations: [] };
  }
  const operations = object.operations.map((entry): ResumePatchOperation => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('AI 操作格式无效。');
    const operation = entry as Record<string, unknown>;
    const type = operation.type;
    if (type === 'set_template') {
      if (typeof operation.templateId !== 'string' || !templates.has(operation.templateId)) throw new Error('AI 请求了不支持的模板。');
      return { type: 'set_template', templateId: operation.templateId as 'modern' | 'professional' | 'creative' | 'minimal' | 'tech' | 'ai-agent' };
    }
    if (type === 'set_layout') {
      if (operation.layout === null) return { type: 'set_layout', layout: null };
      const layout = readLayoutRecipe(operation.layout);
      if (!layout) throw new Error('AI 提供的版式无效。');
      return { type: 'set_layout', layout };
    }
    if (type === 'reorder_sections') {
      if (!Array.isArray(operation.sectionOrder) || operation.sectionOrder.length > 30 || operation.sectionOrder.some((id) => typeof id !== 'string')) throw new Error('AI 请求的章节顺序无效。');
      return { type, sectionOrder: operation.sectionOrder as string[] };
    }
    if (type === 'remove_entry') {
      const collection = operation.collection;
      const id = operation.id;
      if (typeof collection !== 'string' || !entryCollections.has(collection)) throw new Error('AI 请求了不允许删除的内容。');
      if (typeof id !== 'string' || !id || id.length > 120) throw new Error('AI 操作缺少有效条目 ID。');
      return { type, collection: collection as 'experiences' | 'projects' | 'education' | 'skills' | 'customBlocks', id };
    }
    if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(textFields, type)) throw new Error('AI 请求了不允许的操作。');
    const field = operation.field;
    if (typeof field !== 'string' || !textFields[type]?.includes(field)) throw new Error('AI 请求了不允许修改的字段。');
    const id = operation.id;
    if (type !== 'set_basic' && (typeof id !== 'string' || !id || id.length > 120)) throw new Error('AI 操作缺少有效条目 ID。');
    const listField = (type === 'update_experience' && field === 'highlights') || (type === 'update_project' && field === 'techStack') || (type === 'update_skill' && field === 'items');
    const normalizedValue = listField ? safeStringList(operation.value, field) : safeString(operation.value, field);
    return { type, field, ...(type === 'set_basic' ? {} : { id }), value: normalizedValue } as ResumePatchOperation;
  });
  return { explanation: explanation || '请审阅以下修改建议。', operations };
}

/** Apply validated operations to a copy; failures never partially mutate the live Pinia store. */
export function applyResumePatch(source: ResumeData, operations: ResumePatchOperation[]): ResumeData {
  const resume = JSON.parse(JSON.stringify(source)) as ResumeData;
  for (const operation of parseResumePatch({ operations }).operations) {
    switch (operation.type) {
      case 'set_basic': {
        const value = safeString(operation.value, operation.field);
        const safeValue = operation.field === 'summary' ? markdownToSafeHtml(value) : value;
        if (operation.field === 'website' && value && !sanitizeMarkdownUrl(value)) throw new Error('AI 提供的个人链接协议不安全。');
        resume.basic[operation.field] = safeValue;
        break;
      }
      case 'update_experience': {
        const item = resume.experiences.find((entry) => entry.id === operation.id);
        if (!item) throw new Error('AI 修改目标工作经历不存在。');
        if (operation.field === 'highlights') item.highlights = safeStringList(operation.value, operation.field);
        else {
          const value = safeString(operation.value, operation.field);
          item[operation.field] = operation.field === 'description' ? markdownToSafeHtml(value) : value;
        }
        break;
      }
      case 'update_project': {
        const item = resume.projects.find((entry) => entry.id === operation.id);
        if (!item) throw new Error('AI 修改目标项目不存在。');
        if (operation.field === 'techStack') item.techStack = safeStringList(operation.value, operation.field);
        else {
          const value = safeString(operation.value, operation.field);
          if (operation.field === 'link' && value && !sanitizeMarkdownUrl(value)) throw new Error('AI 提供的项目链接协议不安全。');
          item[operation.field] = operation.field === 'description' ? markdownToSafeHtml(value) : value;
        }
        break;
      }
      case 'update_education': {
        const item = resume.education.find((entry) => entry.id === operation.id);
        if (!item) throw new Error('AI 修改目标教育经历不存在。');
        item[operation.field] = safeString(operation.value, operation.field);
        break;
      }
      case 'update_skill': {
        const item = resume.skills.find((entry) => entry.id === operation.id);
        if (!item) throw new Error('AI 修改目标技能不存在。');
        if (operation.field === 'items') item.items = safeStringList(operation.value, operation.field);
        else item.category = safeString(operation.value, operation.field);
        break;
      }
      case 'update_custom_block': {
        const item = resume.customBlocks.find((entry) => entry.id === operation.id);
        if (!item) throw new Error('AI 修改目标自定义模块不存在。');
        if (operation.field === 'title') item.title = safeString(operation.value, operation.field);
        else {
          if (Array.isArray(item.content)) throw new Error('AI 暂不直接改写结构化自定义条目。');
          item.content = markdownToSafeHtml(safeString(operation.value, operation.field));
        }
        break;
      }
      case 'set_template':
        resume.templateId = operation.templateId;
        delete resume.layout;
        break;
      case 'set_layout': {
        if (operation.layout === null) delete resume.layout;
        else {
          const layout = readLayoutRecipe(operation.layout);
          if (!layout) throw new Error('AI 提供的版式无效。');
          resume.layout = layout;
          resume.theme = themeFromRecipe(layout);
        }
        break;
      }
      case 'reorder_sections': {
        const expected = resume.sectionOrder;
        if (operation.sectionOrder.length !== expected.length || new Set(operation.sectionOrder).size !== expected.length || expected.some((id) => !operation.sectionOrder.includes(id))) {
          throw new Error('AI 只能调整当前已有章节的顺序，不能添加或隐藏章节。');
        }
        resume.sectionOrder = [...operation.sectionOrder];
        break;
      }
      case 'remove_entry': {
        const list = resume[operation.collection];
        const index = list.findIndex((entry) => entry.id === operation.id);
        if (index < 0) throw new Error('AI 要删除的条目不存在。');
        list.splice(index, 1);
        break;
      }
    }
  }
  return resume;
}
