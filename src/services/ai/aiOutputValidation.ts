export function aiRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI 返回结构无效。');
  return value as Record<string, unknown>;
}
export function aiString(value: unknown, max = 10000): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('AI 文本字段无效或过长。');
  return value.trim();
}
export function aiList(value: unknown, max = 40): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('AI 列表无效或超出数量限制。');
  return value;
}
export function aiStrings(value: unknown, max = 40, textMax = 1000): string[] { return aiList(value, max).map(item => aiString(item, textMax)); }
export function aiEnum<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error('AI 状态或类型无效。');
  return value as T;
}
export function aiReferences(value: unknown, allowed: readonly string[], max = 40): string[] {
  const refs = aiStrings(value, max, 250);
  if (refs.some(ref => !allowed.includes(ref)) || new Set(refs).size !== refs.length) throw new Error('AI 引用了不存在或重复的来源。');
  return refs;
}
