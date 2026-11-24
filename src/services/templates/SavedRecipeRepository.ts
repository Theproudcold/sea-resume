import type { SavedRecipe } from '@/types/layout-template';
import {
  LAYOUT_TEMPLATE_LIMIT,
  normalizeLayoutName,
  readLayoutRecipe,
} from '@/utils/layout-template';

const STORAGE_KEY = 'sea-resume_layout-templates';
const CORRUPT = '自定义版式数据已损坏，未继续写入。';

function isStoredTemplate(value: unknown): value is SavedRecipe {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<SavedRecipe>;
  return typeof record.id === 'string'
    && record.id.length > 0
    && record.id.length <= 120
    && typeof record.name === 'string'
    && record.name.trim().length > 0
    && readLayoutRecipe(record.recipe) !== null;
}

function normalizeStored(template: SavedRecipe): SavedRecipe {
  const recipe = readLayoutRecipe(template.recipe);
  if (!recipe) throw new Error(CORRUPT);
  return {
    id: template.id,
    name: template.name,
    description: typeof template.description === 'string' ? template.description : '',
    createdAt: Number.isFinite(template.createdAt) ? template.createdAt : 0,
    updatedAt: Number.isFinite(template.updatedAt) ? template.updatedAt : 0,
    recipe,
  };
}

function readStoredTemplates(): SavedRecipe[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(CORRUPT);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => !isStoredTemplate(item))) {
    throw new Error(CORRUPT);
  }
  return parsed.map(normalizeStored).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function listSavedRecipes(): SavedRecipe[] {
  return readStoredTemplates();
}

function persist(templates: SavedRecipe[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('浏览器存储空间不足，版式未保存。');
    }
    throw error;
  }
}

export function saveSavedRecipe(template: SavedRecipe): SavedRecipe[] {
  const stored = normalizeStored(template);
  const existing = listSavedRecipes();
  if (existing.length >= LAYOUT_TEMPLATE_LIMIT) {
    throw new Error(`最多保存 ${LAYOUT_TEMPLATE_LIMIT} 个自定义版式。请先删除不再使用的版式。`);
  }
  if (existing.some((item) => item.id === stored.id)) {
    throw new Error('版式已存在。');
  }
  const next = [stored, ...existing];
  persist(next);
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function renameSavedRecipe(id: string, name: string, now = Date.now()): SavedRecipe[] {
  const existing = listSavedRecipes();
  const index = existing.findIndex((item) => item.id === id);
  const current = existing[index];
  if (!current) throw new Error('找不到这个自定义版式。');
  const next = existing.slice();
  next[index] = { ...current, name: normalizeLayoutName(name), updatedAt: now };
  persist(next);
  return next.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteSavedRecipe(id: string): SavedRecipe[] {
  const existing = listSavedRecipes();
  if (!existing.some((item) => item.id === id)) throw new Error('找不到这个自定义版式。');
  const next = existing.filter((item) => item.id !== id);
  persist(next);
  return next;
}
