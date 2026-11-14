import type { CustomResumeTemplate } from '@/types/custom-template';
import type { ResumeData } from '@/types/resume';
import {
  CUSTOM_TEMPLATE_LIMIT,
  isBuiltinLayoutId,
  normalizeTemplateName,
} from '@/utils/custom-template';

const STORAGE_KEY = 'sea-resume_custom-templates';

function isStoredTemplate(value: unknown): value is CustomResumeTemplate {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<CustomResumeTemplate>;
  const snapshot = record.snapshot as Partial<ResumeData> | undefined;
  return typeof record.id === 'string'
    && record.id.length > 0
    && record.id.length <= 120
    && typeof record.name === 'string'
    && record.name.trim().length > 0
    && typeof record.baseTemplateId === 'string'
    && isBuiltinLayoutId(record.baseTemplateId)
    && !!snapshot
    && typeof snapshot === 'object'
    && typeof snapshot.templateId === 'string';
}

function normalizeStored(template: CustomResumeTemplate): CustomResumeTemplate {
  return {
    ...template,
    description: typeof template.description === 'string' ? template.description : '',
    createdAt: Number.isFinite(template.createdAt) ? template.createdAt : 0,
    updatedAt: Number.isFinite(template.updatedAt) ? template.updatedAt : 0,
  };
}

function readRaw(): unknown {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error('自定义模板数据已损坏，未继续写入。');
  }
}

export function listCustomTemplates(): CustomResumeTemplate[] {
  const parsed = readRaw();
  if (!Array.isArray(parsed)) {
    throw new Error('自定义模板数据已损坏，未继续写入。');
  }

  return parsed
    .filter(isStoredTemplate)
    .map(normalizeStored)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function persist(templates: CustomResumeTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('浏览器存储空间不足，模板未保存。');
    }
    throw error;
  }
}

export function saveCustomTemplate(template: CustomResumeTemplate): CustomResumeTemplate[] {
  const existing = listCustomTemplates();
  if (existing.length >= CUSTOM_TEMPLATE_LIMIT) {
    throw new Error(`最多保存 ${CUSTOM_TEMPLATE_LIMIT} 个自定义模板。请先删除不再使用的模板。`);
  }
  if (existing.some((item) => item.id === template.id)) {
    throw new Error('模板已存在。');
  }

  const next = [template, ...existing];
  persist(next);
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function renameCustomTemplate(id: string, name: string, now = Date.now()): CustomResumeTemplate[] {
  const existing = listCustomTemplates();
  const index = existing.findIndex((item) => item.id === id);
  if (index < 0) {
    throw new Error('找不到这个自定义模板。');
  }

  const next = existing.slice();
  const current = existing[index];
  if (!current) {
    throw new Error('找不到这个自定义模板。');
  }
  next[index] = {
    ...current,
    name: normalizeTemplateName(name),
    updatedAt: now,
  };
  persist(next);
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteCustomTemplate(id: string): CustomResumeTemplate[] {
  const existing = listCustomTemplates();
  if (!existing.some((item) => item.id === id)) {
    throw new Error('找不到这个自定义模板。');
  }

  const next = existing.filter((item) => item.id !== id);
  persist(next);
  return next;
}
