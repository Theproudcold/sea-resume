import type { AiProviderConfig, ResumePatchOperation } from '@/types/ai';
import type { ResumeData } from '@/types/resume';
import { requestAiJson, type AiRequestOptions } from './transport';
import { aiPlainText, buildResumeContext } from './resumeContext';
import { aiList, aiRecord, aiString, aiStrings } from './aiOutputValidation';
import { validateRewrittenLine, validateRewrittenList, type FactGuardIssue } from '@/utils/aiFactGuard';

export type StarPolishKind = 'summary' | 'experience' | 'project' | 'highlights';

export interface StarPolishTarget {
  key: string;
  kind: StarPolishKind;
  /** Local label. May contain organization names and is never sent. */
  label: string;
  text: string;
  items?: string[];
  /** Position, role and existing tech only. Organizations stay out. */
  hint: string;
}

export interface StarPolishSuggestion {
  key: string;
  label: string;
  before: string;
  rawBefore: string | string[];
  after: string;
  note: string;
  novelNumbers: string[];
  /** 确定性事实校验命中的问题；非空时禁止勾选应用。 */
  guard?: FactGuardIssue[];
  operation: ResumePatchOperation;
}

export interface StarPolishDraft {
  explanation: string;
  suggestions: StarPolishSuggestion[];
}

const PROMPT = [
  '角色：简历文字编辑，只按 STAR 重组已有事实。使用中文。只返回 JSON，不要 Markdown 代码块。',
  'STAR 指情境 Situation、任务 Task、行动 Action、结果 Result。不写 S/T/A/R 标签。',
  'kind 为 experience 或 project：value 是字符串，Markdown 无序列表，每条以 "- " 开头，一句只保留原文已有的动作和结果，不凑成「通过…从而…」。',
  'kind 为 highlights：value 是字符串数组，每条一句，不要 Markdown 前缀。默认保持原文条数；合并必须在 note 写明，条数不得超过原文。',
  'kind 为 summary：value 是一段短文，不硬套四段式，也不要列表。',
  '只根据 targets 的原文重组。不编造数字、比例、金额、人数、周期、技术、职级、职责或结果；原文没有结果就停在行动，并在 note 写明未补写。已有技术名词可以保留，不能新增。',
  '只换同义词不算改进，不要返回该 key。把「我们」改成「我」或扩大个人贡献也不算改进。',
  '不要写：赋能、闭环、抓手、深度参与、负责相关工作、显著提升、丰富经验，以及首先、其次、最后。',
  '组织名已替换为占位。输出禁止出现「公司 1」「学校 1」，也不要猜测真实组织名。目标岗位只调整动词和已有技能词的先后，不能当成候选人经历，也不能新增技术名词。',
  '没有实质改进就不要返回该 key。items 可以为空。不修改姓名、联系方式、日期、组织、技能清单或条目结构。',
  '返回 {"explanation":"一句话说明","items":[{"key":"必须来自 targets","value":"字符串或字符串数组","note":"保留了哪些 STAR 要素；原文缺失的写明未补写"}]}。',
].join('\n');

const PLACEHOLDER = /公司\s*\d+|学校\s*\d+/;
const MAX_TARGETS = 12;

function sameText(before: string, after: string): boolean {
  return before.replace(/\s+/g, ' ').trim() === after.replace(/\s+/g, ' ').trim();
}

export function novelNumbers(before: string, after: string): string[] {
  const source = new Set(before.match(/\d+(?:\.\d+)?%?/g) ?? []);
  return [...new Set(after.match(/\d+(?:\.\d+)?%?/g) ?? [])].filter((value) => !source.has(value));
}

function splitMarkdownBullets(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*+•·]\s+/u, '').trim())
    .filter(Boolean);
}

/** 复用确定性事实校验，避免 STAR 润色绕过同值数字、主语偷换、联系方式与语言护栏。 */
function guardStarSuggestion(target: StarPolishTarget, after: string | string[], targetRole = ''): FactGuardIssue[] {
  const options = { userText: targetRole };
  if (target.kind === 'highlights') {
    const afterList = Array.isArray(after) ? after : [after];
    return validateRewrittenList(target.items ?? [], afterList, options).issues;
  }
  if (target.kind === 'summary') {
    return validateRewrittenLine(target.text, String(after), options).issues;
  }
  const beforeLines = splitMarkdownBullets(target.text);
  const afterLines = splitMarkdownBullets(String(after));
  return validateRewrittenList(beforeLines.length ? beforeLines : [target.text], afterLines, options).issues;
}

function verifiedNovelNumbers(before: string, after: string, guard: FactGuardIssue[]): string[] {
  const metricIssue = guard.find((issue) => issue.code === 'metric');
  if (!metricIssue) return [];
  const rawMatches = novelNumbers(before, after);
  return rawMatches.length ? rawMatches : metricIssue.details;
}

/** Visible narrative fields only. Structured contacts and organization names are not included. */
export function collectStarPolishTargets(resume: ResumeData): StarPolishTarget[] {
  const context = buildResumeContext(resume, { generalizeOrganizations: true });
  const targets: StarPolishTarget[] = [];
  if (context.basic.summary) targets.push({ key: 'basic.summary', kind: 'summary', label: '个人简介', text: context.basic.summary, hint: '' });
  context.experiences.forEach((item, index) => {
    const experience = resume.experiences.find((entry) => entry.id === item.id);
    const label = [experience?.company, item.position].map((value) => aiPlainText(value)).filter(Boolean).join(' · ') || `工作经历 ${index + 1}`;
    const hint = item.position ? `职位：${item.position}` : '';
    if (item.description) targets.push({ key: `experiences.${item.id}.description`, kind: 'experience', label, text: item.description, hint });
    const highlights = item.highlights.map((value) => value.trim()).filter(Boolean);
    if (highlights.length) targets.push({ key: `experiences.${item.id}.highlights`, kind: 'highlights', label: `${label} · 亮点`, text: highlights.join('\n'), items: highlights, hint });
  });
  context.projects.forEach((item, index) => {
    if (!item.description) return;
    const project = resume.projects.find((entry) => entry.id === item.id);
    const label = [project?.name, item.role].map((value) => aiPlainText(value)).filter(Boolean).join(' · ') || `项目经验 ${index + 1}`;
    const hint = [item.role && `角色：${item.role}`, item.techStack.filter(Boolean).length && `已有技术：${item.techStack.filter(Boolean).join('、')}`].filter(Boolean).join('；');
    targets.push({ key: `projects.${item.id}.description`, kind: 'project', label, text: item.description, hint });
  });
  return targets;
}

export function resolveStarPolishTargets(resume: ResumeData, keys: readonly string[]): StarPolishTarget[] {
  if (!keys.length || keys.length > MAX_TARGETS || new Set(keys).size !== keys.length) throw new Error(`请选择 1 到 ${MAX_TARGETS} 条可润色内容。`);
  const available = new Map(collectStarPolishTargets(resume).map((target) => [target.key, target]));
  return keys.map((key) => {
    const target = available.get(key);
    if (!target) throw new Error('选择了不可润色、已隐藏或没有正文的内容。');
    return target;
  });
}

export function normalizePolishRole(role: string): string {
  const text = role.trim();
  if (text.length > 200) throw new Error('目标岗位不能超过 200 字。');
  return text;
}

function readRaw(resume: ResumeData, key: string): string | string[] | undefined {
  if (key === 'basic.summary') return resume.basic.summary ?? '';
  const field = key.endsWith('.highlights') ? 'highlights' : key.endsWith('.description') ? 'description' : '';
  const collection = key.startsWith('experiences.') ? 'experiences' : key.startsWith('projects.') ? 'projects' : '';
  if (!field || !collection || (collection === 'projects' && field === 'highlights')) return undefined;
  const id = key.slice(collection.length + 1, -(field.length + 1));
  if (!id) return undefined;
  const item = resume[collection].find((entry) => entry.id === id);
  if (!item) return undefined;
  if (field === 'highlights') return 'highlights' in item ? [...(item.highlights ?? [])] : undefined;
  return item.description;
}

function toOperation(target: StarPolishTarget, value: string | string[]): ResumePatchOperation {
  if (target.kind === 'summary') return { type: 'set_basic', field: 'summary', value: value as string };
  const id = target.key.split('.').slice(1, -1).join('.');
  if (target.kind === 'highlights') return { type: 'update_experience', id, field: 'highlights', value: value as string[] };
  if (target.kind === 'project') return { type: 'update_project', id, field: 'description', value: value as string };
  return { type: 'update_experience', id, field: 'description', value: value as string };
}

export function parseStarPolishDraft(input: unknown, resume: ResumeData, keys: readonly string[], targetRole = ''): StarPolishDraft {
  const targets = resolveStarPolishTargets(resume, keys);
  const byKey = new Map(targets.map((target) => [target.key, target]));
  const value = aiRecord(input);
  const explanation = value.explanation === undefined ? '' : aiString(value.explanation, 1000);
  const seen = new Set<string>();
  const suggestions: StarPolishSuggestion[] = [];
  for (const entry of aiList(value.items, MAX_TARGETS)) {
    const item = aiRecord(entry);
    const key = aiString(item.key, 250);
    const target = byKey.get(key);
    if (!target || seen.has(key)) throw new Error('润色结果包含未知、未选择或重复的内容。');
    seen.add(key);
    const note = item.note === undefined ? '' : aiString(item.note, 500);
    if (target.kind === 'highlights') {
      const highlights = aiStrings(item.value, target.items!.length, 500).map((text) => text.trim()).filter(Boolean);
      if (!highlights.length || highlights.length > target.items!.length) throw new Error('亮点润色不能为空，也不能超过原文条数。');
      if (highlights.length === target.items!.length && highlights.every((text, index) => sameText(text, target.items![index]!))) continue;
      const after = highlights.join('\n');
      if (PLACEHOLDER.test(after) && !PLACEHOLDER.test(target.text)) throw new Error('润色结果包含被替换的组织占位，已拒绝。');
      const guard = guardStarSuggestion(target, highlights, targetRole);
      suggestions.push({
        key,
        label: target.label,
        before: target.text,
        rawBefore: readRaw(resume, key) ?? [],
        after,
        note,
        novelNumbers: verifiedNovelNumbers(target.text, after, guard),
        ...(guard.length ? { guard } : {}),
        operation: toOperation(target, highlights),
      });
      continue;
    }
    const rewritten = aiString(item.value, 8000);
    if (!rewritten) throw new Error('润色结果不能为空。');
    if (sameText(target.text, rewritten)) continue;
    if (PLACEHOLDER.test(rewritten) && !PLACEHOLDER.test(target.text)) throw new Error('润色结果包含被替换的组织占位，已拒绝。');
    const guard = guardStarSuggestion(target, rewritten, targetRole);
    suggestions.push({
      key,
      label: target.label,
      before: target.text,
      rawBefore: readRaw(resume, key) ?? '',
      after: rewritten,
      note,
      novelNumbers: verifiedNovelNumbers(target.text, rewritten, guard),
      ...(guard.length ? { guard } : {}),
      operation: toOperation(target, rewritten),
    });
  }
  return { explanation, suggestions };
}

export function assertStarPolishCurrent(resume: ResumeData, suggestions: readonly StarPolishSuggestion[]): void {
  if (!suggestions.length) throw new Error('没有可应用的润色建议。');
  if (suggestions.some((suggestion) => suggestion.guard?.length)) {
    throw new Error('包含未通过确定性事实校验的润色建议，不能应用。');
  }
  const visible = new Set(collectStarPolishTargets(resume).map((target) => target.key));
  for (const suggestion of suggestions) {
    const current = readRaw(resume, suggestion.key);
    if (!visible.has(suggestion.key) || current === undefined || JSON.stringify(current) !== JSON.stringify(suggestion.rawBefore)) {
      throw new Error(`「${suggestion.label}」已变化、隐藏或删除，请重新生成，不会覆盖当前编辑。`);
    }
  }
}

export async function requestStarPolish(config: AiProviderConfig, resume: ResumeData, keys: readonly string[], targetRole: string, options: AiRequestOptions = {}): Promise<StarPolishDraft> {
  const targets = resolveStarPolishTargets(resume, keys);
  const role = normalizePolishRole(targetRole);
  const data = {
    targetRole: role,
    targets: targets.map(({ key, kind, text, items, hint }) => ({ key, kind, text, ...(items ? { items } : {}), hint })),
  };
  return parseStarPolishDraft(await requestAiJson(config, PROMPT, data, { ...options, temperature: 0.3 }), resume, keys, role);
}
