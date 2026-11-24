import type { ResumeSnapshot } from '@/types/custom-template';
import type { ResumeData, TemplateMetadata } from '@/types/resume';
import { generateId } from '@/utils/helpers';
import { readLayoutRecipe } from '@/utils/layout-template';
import { normalizeResumeData } from '@/utils/resumeData';

export const BUILTIN_LAYOUT_IDS = ['modern', 'professional', 'creative', 'minimal', 'tech', 'ai-agent'] as const;
export type BuiltinLayoutId = (typeof BUILTIN_LAYOUT_IDS)[number];

export const CUSTOM_TEMPLATE_NAME_MAX = 40;
export const CUSTOM_TEMPLATE_DESCRIPTION_MAX = 120;
export const CUSTOM_TEMPLATE_LIMIT = 20;
export const CUSTOM_TEMPLATE_MAX_CHARS = 800_000;
const DEFAULT_DESCRIPTION = '由当前简历保存，包含内容和样式';

export function isBuiltinLayoutId(value: string): value is BuiltinLayoutId {
  return (BUILTIN_LAYOUT_IDS as readonly string[]).includes(value);
}

/** 自定义模板沿用内置版式组件；无法识别时回退到现代简约。 */
export function builtinTemplateId(template: { id: string; baseTemplateId?: string }): BuiltinLayoutId {
  const candidate = template.baseTemplateId || template.id;
  return isBuiltinLayoutId(candidate) ? candidate : 'modern';
}

export function normalizeTemplateName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    throw new Error('请填写模板名称。');
  }
  if (trimmed.length > CUSTOM_TEMPLATE_NAME_MAX) {
    throw new Error(`模板名称不能超过 ${CUSTOM_TEMPLATE_NAME_MAX} 个字。`);
  }
  return trimmed;
}

export function normalizeTemplateDescription(description?: string): string {
  const trimmed = (description ?? '').trim().replace(/\s+/g, ' ');
  if (trimmed.length > CUSTOM_TEMPLATE_DESCRIPTION_MAX) {
    throw new Error(`模板说明不能超过 ${CUSTOM_TEMPLATE_DESCRIPTION_MAX} 个字。`);
  }
  return trimmed || DEFAULT_DESCRIPTION;
}

export function buildResumeSnapshot(
  resume: ResumeData,
  input: { name: string; description?: string },
  options: { id?: string; now?: number } = {},
): ResumeSnapshot {
  const name = normalizeTemplateName(input.name);
  const description = normalizeTemplateDescription(input.description);
  const snapshot = JSON.parse(JSON.stringify(resume)) as ResumeData;
  delete snapshot.jobTarget;
  const layout = readLayoutRecipe(snapshot.layout);
  const baseTemplateId = layout?.seedId ?? builtinTemplateId({ id: snapshot.templateId });
  if (layout) snapshot.layout = layout;
  else delete snapshot.layout;
  if (!layout) snapshot.templateId = baseTemplateId;

  const now = options.now ?? Date.now();
  const template: ResumeSnapshot = {
    id: options.id ?? generateId(),
    name,
    description,
    baseTemplateId,
    createdAt: now,
    updatedAt: now,
    snapshot,
  };

  if (JSON.stringify(template).length > CUSTOM_TEMPLATE_MAX_CHARS) {
    throw new Error('这份简历太大，无法存为模板。可以先去掉头像或精简内容后再试。');
  }

  return template;
}

export function resumeSnapshotToMetadata(template: ResumeSnapshot): TemplateMetadata {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: 'custom',
    categoryLabel: '我的',
    keywords: ['自定义', template.baseTemplateId],
    recommendedOrder: -template.updatedAt,
    source: 'custom',
    baseTemplateId: template.baseTemplateId,
  };
}

/** 用于预览或新建简历的独立副本，不与已保存的模板共享引用。 */
export function resumeFromSnapshot(template: ResumeSnapshot): ResumeData {
  const normalized = normalizeResumeData(JSON.parse(JSON.stringify(template.snapshot)) as ResumeData);
  delete normalized.jobTarget;
  if (!normalized.layout) {
    normalized.templateId = builtinTemplateId({
      id: normalized.templateId,
      baseTemplateId: template.baseTemplateId,
    });
  }
  return normalized;
}
