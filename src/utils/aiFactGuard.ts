/**
 * AI 改写的确定性事实校验。
 *
 * 模型之后、采纳之前的一道硬关卡：只做可复现的文本比对，不调模型、不读存储。
 * 拦下四类问题——凭空出现的指标、指标被挪到别的对象、原文没有的联系方式、
 * 未经要求的翻译与结构破坏。
 *
 * 边界：这里只判断「改写有没有引入原文没有的事实」，不判断事实本身是否成立；
 * 措辞是否夸大仍交给审查角色与用户确认。
 */

export type FactGuardCode = 'metric' | 'metric_semantic' | 'protected' | 'language' | 'structure';

export interface FactGuardIssue {
  code: FactGuardCode;
  /** 命中的原文片段（最多 5 条），用于让用户核对而不是只看一句话结论。 */
  details: string[];
  /** 面向用户的整句说明。 */
  message: string;
}

export interface FactGuardResult {
  ok: boolean;
  issues: FactGuardIssue[];
}

export interface FactGuardOptions {
  /** 用户本轮原话。用于判断翻译是否被明确要求，以及补充事实的豁免。 */
  userText?: string;
  /** 原文整体语言；缺省按原文推断。 */
  resumeLanguage?: 'zh' | 'en';
  /** 改写结果长度上限，缺省 6000。 */
  maxLength?: number;
  /**
   * 用户已确认补充的事实（或已确认的补充回答）。
   * 这些文本里的数字视为合法来源，不会被当成凭空编造。
   */
  confirmedFacts?: string[];
}

const MAX_LENGTH = 6000;

/* ------------------------------------------------------------------ *
 * 数字归一化
 * ------------------------------------------------------------------ */

/**
 * 一个数字声明归一化后的量纲。
 * - plain：裸数字或计数
 * - pct：百分比
 * - money：金额
 * - time：时长
 * - count：带单位的量（人、次、卡、台……）
 */
type ClaimKind = 'plain' | 'pct' | 'money' | 'time' | 'count';

interface NumericClaim {
  /** 原文片段，用于提示。 */
  raw: string;
  value: number;
  kind: ClaimKind;
  /** 片段在文本中的区间，用于取上下文窗口。 */
  start: number;
  end: number;
}

const ZH_DIGITS: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const ZH_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const ZH_SCALES: Record<string, number> = { 万: 1e4, 亿: 1e8 };

const EN_ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const EN_TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const EN_SCALES: Record<string, number> = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9 };

/** 数字后紧跟这些单位时，量纲不是裸数。按「长词优先」排列，避免 % 与 个百分点 冲突。 */
const UNIT_KINDS: Array<[RegExp, ClaimKind, number]> = [
  [/^(?:%|％|个百分点|percent|pct)/iu, 'pct', 1],
  [/^(?:倍|times|x\b|fold)/iu, 'count', 1],
  // 万 / 亿 是数词末位，属于数量级而不是量纲，统一归到 plain，与 10000 同类。
  [/^(?:万|亿)/u, 'plain', 1],
  [/^(?:ms|毫秒|秒|秒内|sec(?:onds?)?|mins?(?:utes?)?|小时|hours?|天|days?|周|weeks?|月|months?|年|years?)/iu, 'time', 1],
  [/^(?:元|块|美元|usd|rmb|cny|\$)/iu, 'money', 1],
  [/^(?:人|名|个|次|台|卡|件|条|家|款|张|页|项|单|笔|篇|行|token|tokens|gpu|gpus|核|节点)/iu, 'count', 1],
];

const MULTIPLIERS: Record<string, number> = { k: 1e3, K: 1e3, w: 1e4, W: 1e4 };

/** 技术编号：P99、H800、A100、K8s、GPT4、S3 这类不应参与指标比较的 token。 */
const TECH_ID_RE = /\b[A-Za-z]{1,8}\d+(?:\.\d+)?\b/g;

function parseZhNumber(raw: string): number | null {
  let total = 0;
  let section = 0;
  let digit: number | null = null;
  for (const ch of raw) {
    if (ch in ZH_DIGITS) {
      digit = ZH_DIGITS[ch]!;
    } else if (ch in ZH_UNITS) {
      section += (digit ?? 1) * ZH_UNITS[ch]!;
      digit = null;
    } else if (ch in ZH_SCALES) {
      total += (section + (digit ?? 0)) * ZH_SCALES[ch]!;
      section = 0;
      digit = null;
    } else {
      return null;
    }
  }
  return total + section + (digit ?? 0);
}

function parseEnNumber(raw: string): number | null {
  const tokens = raw.toLowerCase().replace(/-/gu, ' ').split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  let total = 0;
  let current = 0;
  for (const token of tokens) {
    if (token in EN_ONES) current += EN_ONES[token]!;
    else if (token in EN_TENS) current += EN_TENS[token]!;
    else if (token in EN_SCALES) {
      const scale = EN_SCALES[token]!;
      current = scale >= 1000 ? (current || 1) * scale : (current || 1) * scale;
      if (scale >= 1000) {
        total += current;
        current = 0;
      }
    } else return null;
  }
  return total + current;
}

function kindAfter(text: string, index: number): { kind: ClaimKind; scale: number } {
  const tail = text.slice(index, index + 12);
  for (const [pattern, kind, scale] of UNIT_KINDS) {
    if (pattern.test(tail)) return { kind, scale };
  }
  return { kind: 'plain', scale: 1 };
}

/**
 * 抽取全部数字声明。阿拉伯数字、小数、千分位、k/w 后缀、中文数词与英文数词
 * 都归一成同一个数值后比较，避免「10k vs 10000」被误判为两个数字。
 */
export function extractNumericClaims(text: string): NumericClaim[] {
  const source = String(text ?? '');
  // 技术编号先从比较口径里摘掉，否则 P99 的 99、H800 的 800 会被当指标。
  const masked = source.replace(TECH_ID_RE, (match) => ' '.repeat(match.length));
  const claims: NumericClaim[] = [];

  // 阿拉伯数字后允许紧跟或空一格接中文数量级（「1 万」「3.5千万」），按一个声明处理。
  const arabic = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([kKwW])?\s*([万亿])?/gu;
  for (const match of masked.matchAll(arabic)) {
    const digits = match[1]!.replace(/,/gu, '');
    let value = Number(digits);
    if (!Number.isFinite(value)) continue;
    const suffix = match[2];
    if (suffix) value *= MULTIPLIERS[suffix] ?? 1;
    const magnitude = match[3];
    if (magnitude) value *= magnitude === '万' ? 1e4 : 1e8;
    const start = match.index!;
    const { kind, scale } = kindAfter(masked, start + match[0].length);
    claims.push({ raw: match[0].trim(), value: value * scale, kind, start, end: start + match[0].length });
  }

  for (const match of masked.matchAll(/[零〇一二两三四五六七八九十百千万亿]+/gu)) {
    const parsed = parseZhNumber(match[0]);
    if (parsed === null) continue;
    // 「一」「两」单独出现时多为量词或泛指，不作为断言。
    if (match[0].length === 1 && (match[0] === '一' || match[0] === '两')) continue;
    // 已被前面的阿拉伯数字声明吸收的数量级不再重复计数。
    if (claims.some((claim) => match.index! >= claim.start && match.index! < claim.end)) continue;
    const start = match.index!;
    const { kind, scale } = kindAfter(masked, start + match[0].length);
    claims.push({ raw: match[0], value: parsed * scale, kind, start, end: start + match[0].length });
  }

  const enNumber = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)(?:[\s-]+(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion))*\b/giu;
  for (const match of masked.matchAll(enNumber)) {
    const parsed = parseEnNumber(match[0]);
    if (parsed === null) continue;
    const start = match.index!;
    const { kind, scale } = kindAfter(masked, start + match[0].length);
    claims.push({ raw: match[0], value: parsed * scale, kind, start, end: start + match[0].length });
  }

  return claims;
}

function sameValue(a: NumericClaim, b: NumericClaim): boolean {
  const tolerance = Math.max(1e-6, Math.abs(a.value) * 1e-4);
  return Math.abs(a.value - b.value) <= tolerance;
}

/* ------------------------------------------------------------------ *
 * 指标域：判断「同一个数字」是不是被挪到了别的对象上
 * ------------------------------------------------------------------ */

const METRIC_DOMAINS: Array<[string, RegExp]> = [
  ['cost', /\b(?:costs?|spend(?:ing)?|budgets?|expenses?|bills?|billing|opex|capex|pricing|savings?|revenue|arr|gmv|profit|margin|roi|usd|cny|rmb|dollars?)\b|[$¥€£]|(?:成本|费用|预算|开支|支出|账单|节省|营收|收入|利润|销售额|流水|客单价|人力成本)/iu],
  ['error', /\b(?:errors?|failures?|faults?|defects?|bugs?|crashes?|outages?|incidents?|alerts?|timeouts?|retr(?:y|ies)|rollbacks?|uptime|downtime|slas?|slos?|mttr)\b|(?:错误|故障|报错|失败|异常|缺陷|事故|宕机|超时|重试|可用性|稳定性)/iu],
  ['latency', /\b(?:latenc(?:y|ies)|delays?|lag|(?:response|load|execution|build|startup|wait|processing|query|render|training|inference)\s+times?|runtimes?|cold\s+starts?|durations?|turnaround|p\d{2}|ttft|tpot|speed|faster|slower)\b|(?:时延|延迟|耗时|用时|工时|速度|提速|周期|响应时间)/iu],
  ['throughput', /\b(?:throughput|qps|rps|tps|bandwidth|capacit(?:y|ies)|concurrenc(?:y|ies)|traffic|requests?|queries|transactions?|messages?|records?|tokens?|workloads?|deployments?|releases?)\b|(?:吞吐|并发|流量|请求量|查询量|处理量|产能|规模|承载)/iu],
  ['efficiency', /\b(?:cpu|gpus?|memory|ram|disk|storage|footprint|utilization|efficienc(?:y|ies)|mfu|power|energy|waste|overhead|toil|manual\s+(?:effort|work|hours))\b|(?:内存|显存|存储|磁盘|利用率|占用|功耗|效率|人效)/iu],
  ['headcount', /\b(?:engineers?|developers?|programmers?|researchers?|scientists?|designers?|members?|people|staff|employees?|reports?|headcount|teams?|squads?|orgs?|organizations?)\b|(?:工程师|研发|成员|团队|下属|人数|部门|组织)/iu],
  ['users', /\b(?:users?|customers?|clients?|subscribers?|accounts?|tenants?|merchants?|dau|mau|wau|conversion|retention|churn|ctr|cvr|engagement|clicks?)\b|(?:用户|客户|买家|商家|会员|租户|日活|月活|留存|转化|点击率)/iu],
  ['quality', /\b(?:accurac(?:y|ies)|precision|recall|f1|auc|ndcg|bleu|perplexity|pass\s+rates?|success\s+rates?|hit\s+rates?|cache\s+hits?|coverage|quality)\b|(?:准确率|精确率|召回率|命中率|覆盖率|通过率|成功率|质量)/iu],
];

/** 取数字前后各约 24 字作为判断主体用的窗口（按标点截断）。 */
function clauseAround(text: string, start: number, end: number): string {
  const left = text.slice(Math.max(0, start - 24), start).split(/[，,。；;！？!?\n]/u).pop() ?? '';
  const right = text.slice(end, end + 24).split(/[，,。；;！？!?\n]/u)[0] ?? '';
  return `${left} ${right}`;
}

function domainsOf(text: string): Set<string> {
  const found = new Set<string>();
  for (const [name, pattern] of METRIC_DOMAINS) if (pattern.test(text)) found.add(name);
  return found;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

/* ------------------------------------------------------------------ *
 * 联系方式与语言
 * ------------------------------------------------------------------ */

const CONTACT_RE = /(?:https?:\/\/[^\s）)]+|[\w.%+-]+@[\w.-]+\.[a-z]{2,}|\b1[3-9]\d{9}\b|(?:^|[\s:：])\+?\d[\d\s().-]{6,}\d(?:$|\s))/iu;

const EXPLICIT_TRANSLATION_RE = /(?:翻译|译成|译为|转成(?:中文|英文|英语|日文|日语)|改为(?:中文|英文|英语)|改成(?:中文|英文|英语)|换成(?:中文|英文|英语)|(?:写|出|整理)一份?(?:中文|英文|英语)版|中译英|英译中|translate|translation|in\s+(?:chinese|english)|into\s+(?:chinese|english)|to\s+(?:chinese|english)|(?:chinese|english)\s+version)/iu;

/** 用户是否明确要求翻译。没有明确要求时，中英互换一律视为擅自改写。 */
export function isExplicitTranslationRequest(text: string): boolean {
  return EXPLICIT_TRANSLATION_RE.test(String(text ?? ''));
}

const STRUCTURAL_RE = /^(?:#{1,6}\s|\s*(?:[-*_]\s*){3,}$|[|<>]|\[!|!\[|```|~~~)/u;
const BULLET_PREFIX_RE = /^([ \t]*(?:(?:[-*+]|[1-9]\d?[.)])\s+|[•·▪●○]\s*))/u;

function detectLanguage(text: string): 'zh' | 'en' | 'unknown' {
  const han = (text.match(/\p{Script=Han}/gu) ?? []).length;
  const latin = (text.match(/[A-Za-z]{2,}/g) ?? []).length;
  if (han >= 4) return 'zh';
  if (latin >= 3 && han === 0) return 'en';
  return 'unknown';
}

/* ------------------------------------------------------------------ *
 * 校验入口
 * ------------------------------------------------------------------ */

function buildResult(issues: FactGuardIssue[]): FactGuardResult {
  return { ok: issues.length === 0, issues };
}

function sample(values: string[]): string[] {
  return [...new Set(values)].slice(0, 5);
}

/**
 * 校验一组「原文 → 改写」的指标与联系方式。列表字段逐条比对，
 * 单行字段就是数组里唯一的那一对。
 */
function checkPairs(
  pairs: Array<{ before: string; after: string }>,
  allowedClaims: NumericClaim[],
  allowedContacts: boolean,
  allowTranslation: boolean,
  language: 'zh' | 'en' | 'unknown',
): FactGuardIssue[] {
  const issues: FactGuardIssue[] = [];
  const unverified: string[] = [];
  const relabeled: string[] = [];
  const newContacts: string[] = [];
  const translation: string[] = [];

  const beforeText = pairs.map((pair) => pair.before).join('\n');
  const beforeContacts = CONTACT_RE.test(beforeText);
  const sourceClaims = [...allowedClaims, ...extractNumericClaims(beforeText)];

  for (const pair of pairs) {
    const after = pair.after;

    for (const claim of extractNumericClaims(after)) {
      const matches = sourceClaims.filter((source) => sameValue(source, claim));
      if (!matches.length) {
        unverified.push(claim.raw);
        continue;
      }
      // 数值对得上，还要看它是不是被安到了原文没有的对象上。
      const claimDomains = domainsOf(clauseAround(after, claim.start, claim.end));
      if (!claimDomains.size) continue;
      const semanticOk = matches.some((source) => intersects(claimDomains, domainsOf(clauseAround(pair.before, source.start, source.end))));
      if (!semanticOk) relabeled.push(claim.raw);
    }

    if (!beforeContacts && CONTACT_RE.test(after)) newContacts.push(after.match(CONTACT_RE)![0]);

    if (!allowTranslation && language !== 'unknown') {
      const afterLanguage = detectLanguage(after);
      if (afterLanguage !== 'unknown' && afterLanguage !== language) translation.push(after.slice(0, 40));
    }
  }

  if (unverified.length) {
    issues.push({
      code: 'metric',
      details: sample(unverified),
      message: `改写引入了原句没有的数字或指标（${sample(unverified).join('、')}），请先核实再采纳。`,
    });
  }
  if (relabeled.length) {
    issues.push({
      code: 'metric_semantic',
      details: sample(relabeled),
      message: `改写把原句的指标换到了别的对象上（${sample(relabeled).join('、')}），数值对得上但含义变了。`,
    });
  }
  if (newContacts.length) {
    issues.push({
      code: 'protected',
      details: sample(newContacts),
      message: '改写加入了原句没有的联系方式或链接，已拦截。',
    });
  }
  if (translation.length) {
    issues.push({
      code: 'language',
      details: sample(translation),
      message: '改写改变了正文语言。如确需翻译，请在请求中明确说明。',
    });
  }
  return issues;
}

function checkStructure(before: string, after: string, maxLength: number): FactGuardIssue | null {
  const text = String(after ?? '');
  if (!text.trim()) return { code: 'structure', details: [], message: '改写结果为空。' };
  if (text.length > maxLength) return { code: 'structure', details: [], message: `改写结果超过 ${maxLength} 字上限。` };
  if (/[\r\n]/u.test(text)) return { code: 'structure', details: [], message: '一条改写应当只有一行纯文本，不能包含换行。' };
  if (STRUCTURAL_RE.test(text)) return { code: 'structure', details: [text.slice(0, 40)], message: '改写不能引入标题、表格或引用等结构标记。' };
  const beforeBullet = BULLET_PREFIX_RE.exec(before)?.[1];
  if (beforeBullet && !text.startsWith(beforeBullet.trim())) {
    return { code: 'structure', details: [text.slice(0, 40)], message: '改写应当只替换正文，保留原有的项目符号。' };
  }
  return null;
}

/** 校验一条单行改写。`before` 是改写前的原文，`after` 是模型给出的新文本。 */
export function validateRewrittenLine(before: string, after: string, options: FactGuardOptions = {}): FactGuardResult {
  const source = String(before ?? '');
  const target = String(after ?? '');
  const maxLength = options.maxLength ?? MAX_LENGTH;
  const structure = checkStructure(source, target, maxLength);
  if (structure) return buildResult([structure]);

  const allowedClaims = (options.confirmedFacts ?? []).flatMap((fact) => extractNumericClaims(fact));
  const allowTranslation = isExplicitTranslationRequest(options.userText ?? '');
  const language = options.resumeLanguage ?? detectLanguage(source);
  return buildResult(checkPairs([{ before: source, after: target }], allowedClaims, false, allowTranslation, language));
}

/** 校验数组型字段（highlights、techStack、items）。按「每条成员对应一条原文」比较。 */
export function validateRewrittenList(before: string[], after: string[], options: FactGuardOptions = {}): FactGuardResult {
  const sourceList = Array.isArray(before) ? before.map(String) : [];
  const targetList = Array.isArray(after) ? after.map(String) : [];
  const maxLength = options.maxLength ?? MAX_LENGTH;
  for (const item of targetList) {
    const structure = checkStructure('', item, maxLength);
    if (structure) return buildResult([structure]);
  }

  const allowedClaims = (options.confirmedFacts ?? []).flatMap((fact) => extractNumericClaims(fact));
  const allowTranslation = isExplicitTranslationRequest(options.userText ?? '');
  const language = options.resumeLanguage ?? detectLanguage(sourceList.join('\n'));

  // 允许重排：每条新文本优先匹配最相近的原文；匹配不到就与整个原文集合比较。
  const used = new Set<number>();
  const pairs: Array<{ before: string; after: string }> = [];
  for (const item of targetList) {
    let bestIndex = -1;
    let bestScore = -1;
    sourceList.forEach((source, index) => {
      if (used.has(index)) return;
      const score = similarity(source, item);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && bestScore > 0) used.add(bestIndex);
    const counterpart = bestIndex >= 0 && bestScore > 0 ? sourceList[bestIndex]! : sourceList.join('\n');
    pairs.push({ before: counterpart, after: item });
  }
  return buildResult(checkPairs(pairs, allowedClaims, false, allowTranslation, language));
}

/** 粗略相似度：共享的字符二元组数量，只用于配对，不参与事实判断。 */
function similarity(a: string, b: string): number {
  const grams = (text: string) => {
    const set = new Set<string>();
    const clean = text.replace(/\s+/gu, '');
    for (let i = 0; i < clean.length - 1; i += 1) set.add(clean.slice(i, i + 2));
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  let score = 0;
  for (const gram of ga) if (gb.has(gram)) score += 1;
  return score;
}

