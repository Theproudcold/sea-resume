import { describe, expect, it } from 'vitest';
import { isExplicitTranslationRequest, validateRewrittenLine, validateRewrittenList } from '../aiFactGuard';

/** 断言结果被拦下，并给出期望命中的 code。 */
function expectBlocked(result: ReturnType<typeof validateRewrittenLine>, code: string) {
  expect(result.ok, `应当被拦下（${code}），实际放行`).toBe(false);
  expect(result.issues.map((issue) => issue.code)).toContain(code);
}

describe('数字归一化', () => {
  it(' recognises the same quantity spelled differently', () => {
    // 旧实现只做字符串集合差，10k 会被当成新数字。
    expect(validateRewrittenLine('优化了接口', '优化了接口，QPS 从 2k 提到 10k，增长 5 倍').ok).toBe(false);
    expect(validateRewrittenLine('QPS 从 2k 提到 10k', 'QPS 由 2000 提升到 10000').ok).toBe(true);
    expect(validateRewrittenLine('覆盖 1 万用户', '覆盖 10000 用户').ok).toBe(true);
    expect(validateRewrittenLine('覆盖 10000 用户', '覆盖一万用户').ok).toBe(true);
    expect(validateRewrittenLine('覆盖 10000 用户', '覆盖 1 万 用户').ok).toBe(true);
  });

  it('treats a new number as an unverified metric', () => {
    const result = validateRewrittenLine('优化了订单接口', '优化了订单接口，QPS 提升 40%');
    expectBlocked(result, 'metric');
    // details 记录的是归一化后的值，40% 与 40 同值。
    expect(result.issues[0]!.details).toContain('40');
  });

  it('does not flag numbers the original already had', () => {
    expect(validateRewrittenLine('延迟降低 30%', '将接口延迟降低 30%').ok).toBe(true);
    expect(validateRewrittenLine('把 P99 延迟压到 80ms', '把 P99 延迟从 200ms 压到 80ms').ok).toBe(false);
  });
});

describe('技术编号不是指标', () => {
  it(' does not treat hardware and percentile tokens as numeric claims', () => {
    // 旧实现把 H800 归一成数字 800、把 P99 归一成 99，于是换型号会被误报成「新数字」，
    // 反过来同型号不同写法又可能漏报。技术编号应当整体按 token 比对，不进入指标口径。
    expect(validateRewrittenLine('基于 H800 训练', '基于 H800 集群完成训练').ok).toBe(true);
    expect(validateRewrittenLine('在 A100 上做了推理优化', '在 A100 上做了推理优化，单卡吞吐提升').ok).toBe(true);
    expect(validateRewrittenLine('监控 P99 延迟', '监控 P99 与 P95 延迟').ok).toBe(true);
    expect(validateRewrittenLine('部署在 K8s 集群', '部署在 Kubernetes（K8s）集群').ok).toBe(true);
  });

  it(' still flags a genuinely new count that sits next to an identifier', () => {
    const result = validateRewrittenLine('基于 H800 训练', '基于 H800 集群完成训练，覆盖 32 卡');
    expectBlocked(result, 'metric');
    expect(result.issues[0]!.details).toContain('32');
  });

  it(' does not let an identifier mask a numeric claim', () => {
    // 「P99」被正确排除，但句子里的 90ms 是新增指标，必须被抓住。
    expectBlocked(validateRewrittenLine('监控 P99 延迟', '监控 P99 延迟，压到 90ms'), 'metric');
  });
});

describe('指标主体校验', () => {
  it(' rejects a number moved onto a subject the original never had', () => {
    // 数字对得上，但主体从「延迟」换成了「成本」。
    expectBlocked(validateRewrittenLine('将推理延迟降低 30%', '将推理成本降低 30%'), 'metric_semantic');
    expectBlocked(validateRewrittenLine('把错误率压到 0.3%', '把人力成本压到 0.3%'), 'metric_semantic');
  });

  it(' allows rewording that keeps the same metric subject', () => {
    expect(validateRewrittenLine('将推理延迟降低 30%', '推理时延下降 30%').ok).toBe(true);
  });
});

describe('联系方式', () => {
  it(' blocks contacts that only exist in the rewrite', () => {
    expectBlocked(validateRewrittenLine('负责接口设计', '负责接口设计，详见 https://example.com/me'), 'protected');
    expectBlocked(validateRewrittenLine('负责接口设计', '负责接口设计，联系 a@b.com'), 'protected');
  });

  it(' allows contacts that the original line already had', () => {
    expect(validateRewrittenLine('项目见 https://example.com/a', '项目源码 https://example.com/a').ok).toBe(true);
  });
});

describe('语言', () => {
  it(' blocks an unsolicited translation', () => {
    expectBlocked(validateRewrittenLine('负责订单系统的接口设计与性能优化', 'Owned the order service API design and performance tuning'), 'language');
    expectBlocked(validateRewrittenLine('Owned the order service API design', '负责订单服务接口设计与性能优化'), 'language');
  });

  it(' allows translation when the user explicitly asked for it', () => {
    expect(isExplicitTranslationRequest('把简历译成英文')).toBe(true);
    expect(validateRewrittenLine('负责订单系统的接口设计与性能优化', 'Owned the order service API design and performance tuning', { userText: '把简历译成英文' }).ok).toBe(true);
  });

  it(' does not treat an ordinary edit as translation', () => {
    expect(isExplicitTranslationRequest('帮我精简一下这段经历')).toBe(false);
    expect(isExplicitTranslationRequest('把这段经历改得专业一点')).toBe(false);
  });
});

describe('结构', () => {
  it(' blocks rewrites that change the line structure', () => {
    expectBlocked(validateRewrittenLine('- 负责接口设计', '## 工作经历'), 'structure');
    expectBlocked(validateRewrittenLine('- 负责接口设计', '- 负责接口设计\n- 新增一行'), 'structure');
    expectBlocked(validateRewrittenLine('- 负责接口设计', ''), 'structure');
  });

  it(' accepts an unchanged line without inventing a structural problem', () => {
    expect(validateRewrittenLine('- 负责接口设计', '- 负责接口设计').ok).toBe(true);
  });

  it(' allows plain single-line rewrites that keep the bullet prefix', () => {
    expect(validateRewrittenLine('- 负责接口设计', '- 负责订单服务接口设计与联调').ok).toBe(true);
  });

  it(' blocks dropping the bullet prefix, which would merge two items', () => {
    expectBlocked(validateRewrittenLine('- 负责接口设计', '负责订单服务接口设计与联调'), 'structure');
  });

  it(' rejects absurdly long output', () => {
    expectBlocked(validateRewrittenLine('- 负责接口设计', '负责接口设计'.repeat(1000)), 'structure');
  });
});

describe('列表字段', () => {
  it(' checks every rewritten member against the originals', () => {
    const result = validateRewrittenList(['负责接口设计', '优化查询性能'], ['负责接口设计', '优化查询性能，P99 从 300ms 降到 90ms']);
    expectBlocked(result, 'metric');
  });

  it(' accepts a rule-preserving rewrite of a list', () => {
    expect(validateRewrittenList(['负责接口设计', '优化查询性能'], ['主导接口设计', '优化查询性能']).ok).toBe(true);
  });

  it(' accepts reordering without introducing new content', () => {
    expect(validateRewrittenList(['负责接口设计', '优化查询性能'], ['优化查询性能', '负责接口设计']).ok).toBe(true);
  });
});
