/**
 * JD 风险表述扫描。
 *
 * 纯本地词典匹配，不调用模型、不读取简历、不发送任何内容。
 * 只回答「这段 JD 里出现了哪些常见风险表述」，不是对公司或岗位的评价。
 */
import {
  DEFAULT_NEGATIONS,
  DEFAULT_REQUIREMENT_MARKERS,
  JD_RISK_MAX_LENGTH,
  JD_RISK_RULES,
  type JdRiskRule,
  type JdRiskSeverity,
} from './jdRiskLexicon.rules';

export { JD_RISK_MAX_LENGTH, JD_RISK_RULES };
export type { JdRiskRule, JdRiskSeverity };

export interface JdRiskHit {
  ruleId: string;
  category: string;
  severity: JdRiskSeverity;
  translation: string;
  question: string;
  /** JD 中命中的原词。 */
  term: string;
  /** 命中处所在的原文分句，便于核对。 */
  excerpt: string;
}

export interface JdRiskScan {
  hits: JdRiskHit[];
  /** 命中条数；为 0 表示未发现收录的表述，不代表岗位安全。 */
  count: number;
  /** 输入超过上限被截断时为 true。 */
  truncated: boolean;
}

/** 分句：中文标点与换行都视为边界。 */
const SEGMENT_SPLIT = /(?<=[。；;！!？?\n])/u;

function segmentsOf(text: string): string[] {
  return text.split(SEGMENT_SPLIT);
}

/** 定位命中词所在的分句，并返回该分句在整体里的位置，用于排序。 */
function segmentAt(segments: string[], globalIndex: number): { text: string; offset: number } {
  let offset = 0;
  for (const segment of segments) {
    if (globalIndex < offset + segment.length) return { text: segment, offset };
    offset += segment.length;
  }
  return { text: '', offset: 0 };
}

/** 命中词在所属分句内的相对位置。 */
function localIndexIn(segment: { text: string; offset: number }, globalIndex: number): number {
  return Math.max(0, globalIndex - segment.offset);
}

/**
 * 命中词是否处于否定语境。
 *
 * 只看命中词之前、同一分句内、有限窗口（12 字）的文本：
 * 「我们不接受外包」里「外包」前是「我们不接受」，「无外包成份」同理。
 * 窗口限制是为了避免「团队没有加班文化，但要求抗压能力强」把后半句也否掉。
 */
function isNegated(segment: string, termIndex: number, negations: string[]): boolean {
  // 转折词之后是新的语义：句首的「没有」不能把「但要求抗压能力强」也否掉。
  const pivot = Math.max(
    segment.lastIndexOf('但', termIndex),
    segment.lastIndexOf('但是', termIndex),
    segment.lastIndexOf('然而', termIndex),
    segment.lastIndexOf('不过', termIndex),
    segment.lastIndexOf('but', termIndex),
    segment.lastIndexOf('however', termIndex),
  );
  const start = Math.max(0, termIndex - 12, pivot + 1);
  if (start >= termIndex) return false;
  const before = segment.slice(start, termIndex);
  return negations.some((word) => before.includes(word));
}

/**
 * 命中词是否只是「你需要具备的经验」。
 *
 * 例如「有外包供应商管理经验者优先」：这句话在讲候选人要管外包，
 * 不是在说这个岗位是外包。判定要求：
 * - 命中词之后（同一分句）出现「经验 / 优先 / 管理 / 对接」等词
 * - 且分句不是以「本岗位 / 岗位性质：」这类给岗位定性的句式开头
 */
function isRequirementOnly(segment: string, termIndex: number, markers: string[], ruleId: string): boolean {
  // 给岗位定性的句式优先于要求语境。
  if (/^\s*(?:本岗位|该岗位|此岗位|本职位|该职位|岗位性质|用工性质|用工形式|编制类型)\s*[:：为系属于]/u.test(segment)) {
    return false;
  }
  const after = segment.slice(termIndex + 1);
  return markers.some((word) => after.includes(word));
}

function scanRule(text: string, segments: string[], rule: JdRiskRule): JdRiskHit | null {
  const negations = rule.negations ?? DEFAULT_NEGATIONS;
  const markers = rule.requirementMarkers ?? [];
  const lower = text.toLowerCase();
  for (const term of rule.terms) {
    const needle = term.toLowerCase();
    let from = 0;
    while (true) {
      const index = lower.indexOf(needle, from);
      if (index < 0) break;
      from = index + needle.length;
      const located = segmentAt(segments, index);
      const localIndex = localIndexIn(located, index);
      if (isNegated(located.text, localIndex, negations)) continue;
      if (markers.length && isRequirementOnly(located.text, localIndex, markers, rule.id)) continue;
      return {
        ruleId: rule.id,
        category: rule.category,
        severity: rule.severity,
        translation: rule.translation,
        question: rule.question,
        term,
        excerpt: located.text.trim().slice(0, 120),
      };
    }
  }
  return null;
}

/**
 * 扫描一段 JD，返回按出现顺序排列的命中项。
 * 同一规则最多命中一次，避免同一类风险刷屏。
 */
export function scanJdRisks(jd: string): JdRiskScan {
  const raw = typeof jd === 'string' ? jd : '';
  const truncated = raw.length > JD_RISK_MAX_LENGTH;
  const text = truncated ? raw.slice(0, JD_RISK_MAX_LENGTH) : raw;
  if (!text.trim()) return { hits: [], count: 0, truncated };

  const segments = segmentsOf(text);
  const found: Array<{ hit: JdRiskHit; index: number }> = [];
  for (const rule of JD_RISK_RULES) {
    const hit = scanRule(text, segments, rule);
    if (!hit) continue;
    found.push({ hit, index: text.toLowerCase().indexOf(hit.term.toLowerCase()) });
  }
  found.sort((a, b) => a.index - b.index);
  const hits = found.map((entry) => entry.hit);
  return { hits, count: hits.length, truncated };
}
