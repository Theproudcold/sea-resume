import type { ResumeData } from '@/types/resume';
import type { AiProviderConfig, OptimizationAnalysis, OptimizationFact, OptimizationOperation, OptimizationOptions, ResumeOptimizationRun, ResumeSuggestion } from '@/types/ai';
import { requestAiJson, emptyAiUsage, type AiRequestOptions } from './transport';
import { buildResumeContext, contextSources, contextItemIds, type AiResumeContext } from './resumeContext';
import { aiRecord, aiString, aiList, aiStrings, aiEnum, aiReferences } from './aiOutputValidation';
import { validateRewrittenLine, validateRewrittenList, type FactGuardIssue } from '@/utils/aiFactGuard';
import { applyResumeAiOperations } from './resumeTools';
import { generateId } from '@/utils/helpers';

const collections = { update_experience: 'experiences', update_project: 'projects', update_education: 'education', update_skill: 'skills', update_custom_block: 'customBlocks' } as const;
const fields = { set_basic: ['title', 'summary'], update_experience: ['position', 'description', 'highlights'], update_project: ['role', 'description', 'techStack'], update_education: ['degree', 'major'], update_skill: ['category', 'items'], update_custom_block: ['title', 'content'] } as const;
const listFields = new Set(['highlights', 'techStack', 'items']);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const identifier = (value: unknown): string => { const id = aiString(value, 120); if (!id || ['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('缺少有效 ID。'); return id; };
export function operationKey(operation: OptimizationOperation): string {
  return operation.type === 'set_basic' ? `basic.${operation.field}` : `${collections[operation.type]}.${operation.id}.${operation.field}`;
}
export function validateOptimizationOptions(value: OptimizationOptions): OptimizationOptions {
  return { target: aiString(value.target, 200), company: aiString(value.company, 200), jd: aiString(value.jd, 20000), style: aiEnum(value.style, ['concise', 'professional']), personalSample: aiString(value.personalSample, 3000), generalizeOrganizations: value.generalizeOrganizations === true };
}
export function validateOptimizationFacts(input: unknown, context: AiResumeContext): OptimizationFact[] {
  const targets = ['basic', ...contextItemIds(context)];
  const facts = aiList(input, 40).map(value => {
    const fact = aiRecord(value);
    const result = { id: identifier(fact.id), text: aiString(fact.text, 3000), targetId: aiEnum(fact.targetId, targets) };
    if (!result.text) throw new Error('补充事实不能为空。');
    return result;
  });
  if (new Set(facts.map(f => f.id)).size !== facts.length) throw new Error('补充事实 ID 重复。');
  return facts;
}
// Raw local baselines are not model output. Keep whitespace/HTML intact for
// conflict detection; use the repository's record-size ceiling, not output caps.
const RAW_BASELINE_TEXT_MAX = 3000000;
function baselineValue(value: unknown, field: string): string | string[] {
  if (listFields.has(field)) aiStrings(value, 100, RAW_BASELINE_TEXT_MAX);
  else aiString(value, RAW_BASELINE_TEXT_MAX);
  return clone(value) as string | string[];
}
/** Capture only writable visible fields, keeping exact raw baselines for conflict detection. */
export function optimizationBaseline(source: ResumeData, context: AiResumeContext): Record<string, string | string[]> {
  const baseline: Record<string, string | string[]> = {};
  for (const [type, allowed] of Object.entries(fields)) {
    if (type === 'set_basic') {
      for (const field of allowed) baseline[`basic.${field}`] = baselineValue((source.basic as unknown as Record<string, string>)[field] ?? '', field);
      continue;
    }
    const collection = collections[type as keyof typeof collections];
    for (const item of context[collection]) {
      const original = source[collection].find(entry => entry.id === item.id) as unknown as Record<string, unknown>;
      for (const field of allowed) {
        if (field === 'content' && Array.isArray(original[field])) continue;
        baseline[`${collection}.${item.id}.${field}`] = baselineValue(original[field] ?? (listFields.has(field) ? [] : ''), field);
      }
    }
  }
  return baseline;
}
export function createOptimizationRun(source: ResumeData, options: OptimizationOptions, provider: AiProviderConfig, facts: OptimizationFact[] = []): ResumeOptimizationRun {
  const context = buildResumeContext(source, options);
  const now = new Date().toISOString();
  return { id: generateId(), sourceResumeId: source.id, createdAt: now, updatedAt: now, options: validateOptimizationOptions(options), provider: { baseUrl: provider.baseUrl, model: provider.model }, context, baseline: optimizationBaseline(source, context), stage: 'configuration', facts: validateOptimizationFacts(facts, context), suggestions: [], usage: emptyAiUsage() };
}
export function optimizationSources(run: ResumeOptimizationRun): Record<string, string> {
  return { ...contextSources(run.context), ...Object.fromEntries(run.facts.map(fact => [`fact.${fact.id}`, fact.text])) };
}
export function parseOptimizationAnalysis(input: unknown, run: ResumeOptimizationRun): OptimizationAnalysis {
  const value = aiRecord(input);
  const questions = aiList(value.questions, 3).map(entry => {
    const question = aiRecord(entry);
    return { id: identifier(question.id), text: aiString(question.text, 1000), targetId: aiEnum(question.targetId, ['basic', ...contextItemIds(run.context)]) };
  });
  if (questions.some(q => !q.text) || new Set(questions.map(q => q.id)).size !== questions.length) throw new Error('补充问题为空或 ID 重复。');
  return { summary: aiString(value.summary, 2000), issues: aiStrings(value.issues, 20, 1000), questions,
    matches: aiList(value.matches, 30).map(entry => { const match = aiRecord(entry); return { requirement: aiString(match.requirement, 1000), assessment: aiString(match.assessment, 1000), sourceRefs: aiReferences(match.sourceRefs, Object.keys(optimizationSources(run))) }; }) };
}
export function parseOptimizationOperation(input: unknown, run: ResumeOptimizationRun): OptimizationOperation {
  const value = aiRecord(input);
  const type = aiEnum(value.type, Object.keys(fields) as Array<keyof typeof fields>);
  const field = aiEnum(value.field, fields[type] as readonly string[]);
  const operation = { type, field, ...(type === 'set_basic' ? {} : { id: identifier(value.id) }), value: listFields.has(field) ? aiStrings(value.value, 100, 500) : aiString(value.value) } as OptimizationOperation;
  const key = operationKey(operation);
  if (!Object.prototype.hasOwnProperty.call(run.baseline, key) || !Object.prototype.hasOwnProperty.call(contextSources(run.context), key)) throw new Error('只能改写已有可见的白名单字段，不能新增条目或修改组织、日期、联系方式。');
  return operation;
}
/**
 * 对一条建议执行确定性事实校验。
 *
 * 判定口径：
 * - 用模型给出的基线原文（before）与改写值比较。
 * - 用户在本次运行里确认过的补充事实视为合法来源，其中的数字不算编造。
 * - run.options 里用户自己填的岗位要求与表达样例也是用户提供的文本，并入合法来源。
 *
 * 不抛错：校验失败只把建议标成 reject，让用户看到具体原因，
 * 同时不影响同批次其它建议。
 */
function guardSuggestion(operation: OptimizationOperation, before: string | string[], run: ResumeOptimizationRun): FactGuardIssue[] {
  const allowedTexts = [
    ...(run.facts ?? []).map((fact) => fact.text),
    run.options?.jd ?? '',
    run.options?.personalSample ?? '',
  ];
  // 用户在本次运行里写下的岗位要求与表达样例，就是「本人明确表达意图」的文本来源。
  const options = { confirmedFacts: allowedTexts, userText: `${run.options?.jd ?? ''}\n${run.options?.personalSample ?? ''}` };
  const result = Array.isArray(before) || Array.isArray(operation.value)
    ? validateRewrittenList(
      Array.isArray(before) ? before : [String(before)],
      Array.isArray(operation.value) ? operation.value.map(String) : [String(operation.value)],
      options,
    )
    : validateRewrittenLine(String(before), String(operation.value), options);
  return result.issues;
}

export function parseOptimizationSuggestions(input: unknown, run: ResumeOptimizationRun): ResumeSuggestion[] {
  const value = aiRecord(input);
  const suggestions = aiList(value.suggestions, 40).map(entry => {
    const suggestion = aiRecord(entry);
    const operation = parseOptimizationOperation(suggestion.operation, run);
    const sourceRefs = aiReferences(suggestion.sourceRefs, Object.keys(optimizationSources(run)));
    if (!sourceRefs.length) throw new Error('每条建议必须引用已有原文或已确认事实。');
    const target = operation.type === 'set_basic' ? 'basic' : operation.id;
    if (sourceRefs.some(ref => ref.startsWith('fact.') && run.facts.find(fact => `fact.${fact.id}` === ref)?.targetId !== target)) throw new Error('补充事实不能写入其他条目。');
    const before = clone(run.baseline[operationKey(operation)]!);
    const guard = guardSuggestion(operation, before, run);
    const blocked = guard.length > 0;
    return {
      id: identifier(suggestion.id),
      operation,
      before,
      reason: aiString(suggestion.reason, 2000),
      requirement: aiString(suggestion.requirement, 1000),
      sourceRefs,
      // 未通过确定性校验的建议直接判 reject：它本来就不能应用，同时把原因留给用户核对。
      review: blocked ? 'reject' as const : 'unreviewed' as const,
      reviewReason: blocked ? guard.map((issue) => issue.message).join(' ') : '',
      selected: false,
      confirmed: false,
      rejected: false,
      ...(blocked ? { guard } : {}),
    };
  });
  if (new Set(suggestions.map(s => s.id)).size !== suggestions.length || new Set(suggestions.map(s => operationKey(s.operation))).size !== suggestions.length) throw new Error('建议 ID 或目标字段重复。');
  return suggestions;
}
export function parseOptimizationReview(input: unknown, run: ResumeOptimizationRun): ResumeSuggestion[] {
  const value = aiRecord(input);
  const entries = aiList(value.reviews, 40).map(entry => {
    const review = aiRecord(entry);
    return { id: identifier(review.id), status: aiEnum(review.status, ['pass', 'confirm', 'reject'] as const), reason: aiString(review.reason, 2000) };
  });
  if (entries.length !== run.suggestions.length || new Set(entries.map(e => e.id)).size !== entries.length || entries.some(e => !run.suggestions.some(s => s.id === e.id))) throw new Error('审查必须逐条覆盖所有建议，不得新增或遗漏。');
  return run.suggestions.map(suggestion => { const review = entries.find(e => e.id === suggestion.id)!; return { ...suggestion, review: review.status, reviewReason: review.reason, selected: false, confirmed: false }; });
}
const guard = [
  '使用中文。只返回 JSON，不要 Markdown 代码块，不输出思维过程。',
  '只根据原文与用户确认事实写作。不编造数字、技术、职责、能力或结果。options.jd 为空时，不假装知道公司标准，也不要把目标公司写成已有经历。',
].join('\n');
const operationSchema = 'operation={type,field,id(仅非 basic),value}。可用类型字段：' + JSON.stringify(fields) + '。只能使用 editableFields 中的目标，不得新增条目、改 ID、组织、日期、联系方式、模板或排序。highlights、techStack、items 的 value 必须是字符串数组。';
const styleGuide = 'options.style 为 concise 时句子短、一条一件事；为 professional 时保留职责范围但不要套话。options.personalSample 只学习句长、人称和标点，其中的事实一律不算数。';
const bannedPhrases = '不要写：赋能、闭环、抓手、深度参与、负责相关工作、显著提升、丰富经验，以及首先、其次、最后。把「我们」改成「我」视为夸大，不要这样改。';
function payload(run: ResumeOptimizationRun) { return { resume: run.context, options: run.options, confirmedFacts: run.facts, sources: optimizationSources(run), editableFields: Object.keys(run.baseline) }; }
export async function analyzeResume(config: AiProviderConfig, run: ResumeOptimizationRun, options: AiRequestOptions): Promise<OptimizationAnalysis> {
  const prompt = [
    guard,
    '角色：岗位与简历分析，不改写正文。',
    'questions 最多 3 个，只问原文缺失、且能写进简历的事实：规模、个人动作、结果。可为空。不要问「请介绍一下这段经历」。targetId 只能是已有条目 ID 或 basic。',
    'matches 只写原文有没有对应证据，不写「高度匹配」「非常适合」这类判断。sourceRefs 必须是 sources 的键。',
    '返回 {"summary":"","issues":[],"questions":[{"id":"q1","text":"","targetId":"basic"}],"matches":[{"requirement":"","assessment":"原文有或没有对应证据","sourceRefs":[]}]}。',
  ].join('\n');
  return parseOptimizationAnalysis(await requestAiJson(config, prompt, payload(run), { ...options, temperature: 0.2 }), run);
}
export async function rewriteResume(config: AiProviderConfig, run: ResumeOptimizationRun, options: AiRequestOptions): Promise<ResumeSuggestion[]> {
  const prompt = [
    guard,
    '角色：内容编辑。suggestions 可为空。',
    operationSchema,
    styleGuide,
    bannedPhrases,
    '跳过的补充不得猜测。每条建议的 sourceRefs 至少引用 sources 中的一条已有证据；以 fact. 开头的引用只能写入该事实自己的 targetId。',
    '返回 {"suggestions":[{"id":"s1","operation":{"type":"set_basic","field":"summary","value":""},"reason":"","requirement":"","sourceRefs":[]}]}。',
  ].join('\n');
  return parseOptimizationSuggestions(await requestAiJson(config, prompt, { ...payload(run), analysis: run.analysis }, { ...options, temperature: 0.3 }), run);
}
export async function reviewResume(config: AiProviderConfig, run: ResumeOptimizationRun, options: AiRequestOptions): Promise<ResumeSuggestion[]> {
  const prompt = [
    guard,
    '角色：内容审查，只做一轮，不改写。无建议时 reviews 为空数组，否则必须逐条覆盖，不得新增或遗漏。',
    'status 只有三档：出现新数字、新技术、新职责，或把招聘要求写成候选人已有经历，写 reject；措辞变强但证据弱，写 confirm；其余写 pass。',
    '返回 {"reviews":[{"id":"必须来自建议","status":"pass","reason":""}]}。',
  ].join('\n');
  return parseOptimizationReview(await requestAiJson(config, prompt, { ...payload(run), suggestions: run.suggestions.map(({ id, operation, reason, requirement, sourceRefs }) => ({ id, operation, reason, requirement, sourceRefs })) }, { ...options, temperature: 0.1 }), run);
}
export function suggestionApplicable(suggestion: ResumeSuggestion): boolean {
  return suggestion.selected && !suggestion.rejected && (suggestion.review === 'pass' || (suggestion.review === 'confirm' && suggestion.confirmed));
}
/** Validate again at the application boundary; never overwrite concurrent edits. */
export function applyOptimizationSuggestions(source: ResumeData, run: ResumeOptimizationRun): ResumeData {
  if (run.stage !== 'ready' || source.id !== run.sourceResumeId) throw new Error('简历或优化阶段不匹配。');
  const visible = optimizationBaseline(source, buildResumeContext(source, run.options));
  const selected = run.suggestions.filter(suggestionApplicable);
  if (!selected.length) throw new Error('请先选择已审查的建议，并明确确认待确认项。');
  const operations = selected.map(suggestion => {
    const operation = parseOptimizationOperation(suggestion.operation, run);
    const key = operationKey(operation);
    if (!Object.prototype.hasOwnProperty.call(visible, key) || JSON.stringify(visible[key]) !== JSON.stringify(run.baseline[key]) || JSON.stringify(suggestion.before) !== JSON.stringify(run.baseline[key])) throw new Error(`字段 ${key} 已变化、隐藏或删除，请重新生成；不会覆盖手动编辑。`);
    parseOptimizationSuggestions({ suggestions: [suggestion] }, run);
    return operation;
  });
  return applyResumeAiOperations(source, operations);
}
function restoredContext(input: unknown, resumeId: string): AiResumeContext {
  const value = aiRecord(input);
  if (value.resumeId !== resumeId) throw new Error('恢复记录的来源简历不一致。');
  const basic = aiRecord(value.basic);
  const context: Record<string, unknown> = { resumeId, basic: { title: aiString(basic.title), summary: aiString(basic.summary) } };
  const contextFields = { experiences: ['company', 'position', 'startDate', 'endDate', 'description', 'highlights'], projects: ['name', 'role', 'startDate', 'endDate', 'description', 'techStack'], education: ['school', 'degree', 'major', 'startDate', 'endDate', 'gpa'], skills: ['category', 'items'], customBlocks: ['title', 'content'] };
  for (const [collection, allowed] of Object.entries(contextFields)) {
    context[collection] = aiList(value[collection], 100).map(entry => {
      const item = aiRecord(entry);
      return { id: identifier(item.id), ...Object.fromEntries(allowed.map(field => [field, listFields.has(field) ? aiStrings(item[field], 100, 10000) : aiString(item[field])])) };
    });
  }
  const result = context as unknown as AiResumeContext;
  const ids = contextItemIds(result);
  if (new Set(ids).size !== ids.length) throw new Error('恢复记录的条目 ID 重复。');
  return result;
}
/** Stored requests are interrupted, never silently restarted; restored choices need fresh review. */
export function restoreOptimizationRun(input: ResumeOptimizationRun): ResumeOptimizationRun {
  const run = clone(input);
  run.id = identifier(run.id); run.sourceResumeId = identifier(run.sourceResumeId);
  run.stage = aiEnum(run.stage, ['configuration', 'analysis', 'supplement', 'rewrite', 'review', 'ready', 'completed', 'failed', 'cancelled']);
  if (run.failedStep !== undefined) run.failedStep = aiEnum(run.failedStep, ['analysis', 'rewrite', 'review'] as const);
  run.context = restoredContext(run.context, run.sourceResumeId);
  // Validate stored baselines without normalizing their exact raw values.
  run.baseline = Object.fromEntries(Object.entries(aiRecord(run.baseline)).map(([key, value]) => {
    const field = key.split('.').pop()!;
    if (!Object.prototype.hasOwnProperty.call(contextSources(run.context), key)) throw new Error('恢复记录引用了未知字段。');
    return [key, baselineValue(value, field)];
  }));
  const usage = aiRecord(run.usage);
  run.usage = Object.fromEntries(['calls', 'promptTokens', 'completionTokens'].map(key => {
    const amount = usage[key];
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw new Error('恢复记录的用量无效。');
    return [key, amount];
  })) as unknown as ResumeOptimizationRun['usage'];
  run.options = validateOptimizationOptions(run.options);
  run.facts = validateOptimizationFacts(run.facts, run.context);
  if (run.analysis) run.analysis = parseOptimizationAnalysis(run.analysis, run);
  run.supplementAnswers = Object.fromEntries(Object.entries(run.supplementAnswers || {}).map(([id, answer]) => {
    if (!run.analysis?.questions.some(q => q.id === id)) throw new Error('补充输入引用了未知问题。');
    return [id, { text: aiString(answer.text, 3000), confirmed: answer.confirmed === true }];
  }));
  const originals = run.suggestions;
  run.suggestions = parseOptimizationSuggestions({ suggestions: originals }, run).map((suggestion, index) => {
    const stored = originals[index]!;
    // 存档里的 review 是当时模型自审的结论。确定性校验拦下的建议不能因为存档写着 pass 就恢复成可应用。
    if (suggestion.guard?.length) return { ...suggestion, reviewReason: suggestion.reviewReason || aiString(stored.reviewReason, 2000), rejected: stored.rejected === true };
    return { ...suggestion, review: aiEnum(stored.review, ['unreviewed', 'pass', 'confirm', 'reject']), reviewReason: aiString(stored.reviewReason, 2000), rejected: stored.rejected === true };
  });
  if (['analysis', 'rewrite', 'review'].includes(run.stage)) { run.failedStep = run.stage as 'analysis' | 'rewrite' | 'review'; run.stage = 'cancelled'; }
  run.provider = { baseUrl: aiString(run.provider.baseUrl, 2048), model: aiString(run.provider.model, 200) };
  return run;
}
