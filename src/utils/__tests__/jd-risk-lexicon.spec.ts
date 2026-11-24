import { describe, expect, it } from 'vitest';
import { JD_RISK_RULES, scanJdRisks } from '../jdRiskLexicon';

/** 命中项里是否包含某个规则。 */
function hits(text: string, ruleId: string) {
  return scanJdRisks(text).hits.filter((hit) => hit.ruleId === ruleId);
}

describe('规则表本身', () => {
  it('exposes well-formed rules with unique ids', () => {
    const ids = JD_RISK_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of JD_RISK_RULES) {
      expect(rule.terms.length).toBeGreaterThan(0);
      expect(rule.translation.length).toBeGreaterThan(4);
      expect(rule.question.length).toBeGreaterThan(4);
      expect(['high', 'medium', 'info']).toContain(rule.severity);
    }
  });

  it('every rule has at least one term that actually triggers', () => {
    for (const rule of JD_RISK_RULES) {
      const triggered = rule.terms.some((term) => scanJdRisks(`我们${term}地推进项目`).hits.some((hit) => hit.ruleId === rule.id));
      expect(triggered, `规则 ${rule.id} 没有任何词能命中`).toBe(true);
    }
  });
});

describe('命中', () => {
  it('detects the five required categories', () => {
    expect(hits('要求抗压能力强，能适应快节奏', 'overtime').length).toBeGreaterThan(0);
    expect(hits('需要 7×24 随时响应线上告警', 'oncall').length).toBeGreaterThan(0);
    expect(hits('我们这里不设边界，一人多岗', 'boundary').length).toBeGreaterThan(0);
    expect(hits('薪资面议，期权激励丰厚', 'compensation').length).toBeGreaterThan(0);
    expect(hits('本岗位为外包驻场用工', 'outsource').length).toBeGreaterThan(0);
  });

  it('reports one hit per rule even when many terms match', () => {
    const text = '抗压能力强，能接受加班，狼性团队，结果导向';
    expect(hits(text, 'overtime')).toHaveLength(1);
  });

  it('returns the matched term verbatim and an excerpt that is a substring of the JD', () => {
    const text = '岗位职责：负责核心系统研发。任职要求：抗压能力强，接受加班。';
    const hit = hits(text, 'overtime')[0]!;
    expect(text).toContain(hit.term);
    expect(text).toContain(hit.excerpt);
  });

  it('orders hits by position in the JD', () => {
    const text = '先说薪资面议。再说抗压能力强。';
    const ids = scanJdRisks(text).hits.map((hit) => hit.ruleId);
    expect(ids.indexOf('compensation')).toBeLessThan(ids.indexOf('overtime'));
  });

  it('counts hits and treats an empty JD as no signal', () => {
    expect(scanJdRisks('').hits).toHaveLength(0);
    expect(scanJdRisks('   ').count).toBe(0);
    expect(scanJdRisks('负责核心系统研发与线上稳定性').count).toBe(0);
  });
});

describe('否定语境不命中', () => {
  it('ignores negated phrases', () => {
    expect(hits('我们不接受外包，全部自有编制', 'outsource')).toHaveLength(0);
    expect(hits('本岗位非外包，与公司直签', 'outsource')).toHaveLength(0);
    expect(hits('公司无外包成份，团队均为全职', 'outsource')).toHaveLength(0);
    expect(hits('不需要加班，双休不打卡', 'overtime')).toHaveLength(0);
    expect(hits('工作强度不大，不提倡加班文化', 'overtime')).toHaveLength(0);
  });

  it('stops negation at an adversative pivot', () => {
    // 句首的「没有」管不到转折之后：这仍然是在承认抗压要求，必须提示。
    expect(hits('团队没有加班文化，但要求抗压能力强', 'overtime').length).toBeGreaterThan(0);
    expect(hits('团队没有加班文化，节奏也很轻松', 'overtime')).toHaveLength(0);
  });
});

describe('要求语境不命中', () => {
  it('does not flag a qualification that asks for experience', () => {
    // 「有外包项目管理经验」说的是你要管外包，不是你是外包。
    expect(hits('具备外包供应商管理与验收经验者优先', 'outsource')).toHaveLength(0);
    expect(hits('有驻场团队协调经历优先', 'outsource')).toHaveLength(0);
    // 「抗压能力」出现在任职要求里时仍然要提示，这是真实信号；但只描述能力名词本身不算。
    expect(hits('要求具备较强的抗压能力', 'overtime').length).toBeGreaterThan(0);
  });

  it('keeps a standalone employment label even inside a requirements section', () => {
    const text = '任职要求：本科以上。\n岗位性质：劳务派遣';
    expect(hits(text, 'outsource').length).toBeGreaterThan(0);
  });
});

describe('边界', () => {
  it('caps oversized JD input and warns instead of throwing', () => {
    const huge = '抗压能力强。'.repeat(5000);
    const result = scanJdRisks(huge);
    expect(result.truncated).toBe(true);
    expect(result.count).toBeGreaterThan(0);
  });

  it('handles English JDs', () => {
    const result = scanJdRisks('We are a high-pressure team, expect long hours and on-call rotation.');
    expect(result.hits.some((hit) => hit.ruleId === 'overtime' || hit.ruleId === 'oncall')).toBe(true);
  });

  it('never returns more than one hit per rule and stays bounded', () => {
    const text = JD_RISK_RULES.flatMap((rule) => rule.terms).join('，');
    const result = scanJdRisks(text);
    expect(result.hits.length).toBeLessThanOrEqual(JD_RISK_RULES.length);
    expect(new Set(result.hits.map((hit) => hit.ruleId)).size).toBe(result.hits.length);
  });
});
