/**
 * JD 风险表述词典。
 *
 * 纯数据，与扫描逻辑分开：词汇随行业变化，这里只增删词条，不改判断逻辑。
 *
 * 每条规则给三样东西：
 * - terms：命中词（大小写不敏感）
 * - translation：大白话翻译，说明这个词通常意味着什么
 * - question：一条可直接带去面试的反问
 *
 * 严重度：
 * - high：直接影响是否值得投
 * - medium：需要核实的工作方式
 * - info：只是提醒留意，不是好坏判断
 */

export type JdRiskSeverity = 'high' | 'medium' | 'info';

export interface JdRiskRule {
  id: string;
  category: string;
  severity: JdRiskSeverity;
  terms: string[];
  translation: string;
  question: string;
  /**
   * 否定语境词。命中词前后出现这些词时不报警，例如「不接受外包」「不需要加班」。
   * 缺省用全局默认否定词。
   */
  negations?: string[];
  /**
   * 要求语境词。命中词所在分句出现这些词时不报警，用于区分
   * 「你有外包经验」和「这个岗位是外包」。
   */
  requirementMarkers?: string[];
}

/** 全局否定词：出现在命中词之前的同一分句里，说明是在否认而不是承认。 */
export const DEFAULT_NEGATIONS = [
  '不需要', '无需', '不要求', '不提倡', '不鼓励', '不用', '不必',
  '不接受', '不涉及', '不包含', '不设', '没有', '无', '非', '不是', '并非', '绝不', '拒绝',
  'not', 'no', 'never', 'without', "n't",
];

/** 全局要求语境词：说明这段在讲「你需要有什么」，不是在描述岗位本身。 */
export const DEFAULT_REQUIREMENT_MARKERS = [
  '经验', '经历', '背景', '优先', '加分', '熟悉', '了解', '具备', '拥有', '掌握',
  'experience', 'preferred', 'plus', 'familiar', 'knowledge', 'background',
];

export const JD_RISK_RULES: JdRiskRule[] = [
  {
    id: 'overtime',
    category: '加班 / 强度',
    severity: 'high',
    terms: [
      '抗压能力强', '较强的抗压能力', '良好抗压能力', '抗压能力', '承受较大压力', '高强度工作', '能适应高强度',
      '接受加班', '能适应加班', '适应加班', '快节奏高压', '狼性', '使命必达', '拥抱变化',
      'work hard', 'high-pressure', 'high pressure', 'tight deadlines', 'tight timeline',
      'long hours', 'go the extra mile', 'hustle culture', 'high intensity', 'fast-paced',
    ],
    translation: '通常意味着交付排期紧或常态化加班，对工作时长和响应速度要求较高。',
    question: '团队过去一个季度的平均下班时间和发版节奏大概是什么样？',
    // 「结果导向」单独出现不一定是加班信号，但不该被否词误伤；这里不放进去。
  },
  {
    id: 'oncall',
    category: '值班 / 补位',
    severity: 'high',
    terms: [
      '7*24', '7x24', '7×24', '24/7', '24x7', '随时响应', '全天候响应', '随时待命',
      '急招', '立即到岗', '快速到岗', '急聘',
      'on-call', 'oncall', 'after-hours', 'pager rotation', 'immediate start', 'urgent hire',
    ],
    translation: '可能伴随高频夜间值班；「急招 / 立即到岗」也常见于前任突然离职留下的补缺岗位。',
    question: '这个岗位是业务扩编还是替补？On-Call 轮值频率和调休机制如何？',
  },
  {
    id: 'boundary',
    category: '职责边界',
    severity: 'medium',
    terms: [
      '不设边界', '不设限', '身兼数职', '一专多能', '创业心态', '创业精神', '扁平化管理', '一线也要扛',
      '其他交办事项', '领导交办的其他工作', '工作内容以实际安排为准',
      'wear many hats', 'wearing many hats', 'scrappy', 'high ambiguity', 'other duties as assigned',
      'no ego', 'like a family', 'we are a family', 'flat hierarchy', 'jack of all trades',
    ],
    translation: '常见于人手紧张或早期团队：一人需兼顾多角色，需求变更快、流程规范少。',
    question: '目前小组有几位工程师？入职前 90 天最明确要交付的 1–2 个里程碑是什么？',
  },
  {
    id: 'maturity',
    category: '业务成熟度',
    severity: 'info',
    terms: [
      '从0到1', '从 0 到 1', '0到1', '0-1', '快速试错', '快速迭代', '摸着石头过河', '方向还在探索',
      '0-to-1', '0 to 1', 'zero to one', 'move fast', 'rapidly changing', 'shifting priorities',
    ],
    translation: '业务或架构仍在早期探索期，试错与推倒重来概率较高，稳定性与沉淀相对弱。',
    question: '这个方向目前处于验证期还是规模化阶段？核心业务指标和投入周期怎么定？',
  },
  {
    id: 'compensation',
    category: '薪酬 / 福利',
    severity: 'high',
    terms: [
      '薪资面议', '有竞争力的薪酬', '极具竞争力的薪酬', '丰厚期权', '期权激励', '股权激励',
      '弹性工作', '弹性打工', '上不封顶',
      'competitive salary', 'competitive compensation', 'commensurate with experience',
      'unlimited pto', 'unlimited vacation', 'flexible time off', 'generous equity',
    ],
    translation: '薪酬结构或现金/期权占比不透明；「弹性」有时只指下班弹性，未必包含加班费。',
    question: '薪资包里现金 Base、年终月数与期权占比大概如何？期权行权和回购条款怎么安排？',
  },
  {
    id: 'outsource',
    category: '用工性质',
    severity: 'high',
    terms: [
      '外包', '劳务派遣', '驻场', '第三方用工', '第三方编制', '外包编制', '外派',
      'OD岗', '华为OD', '人员派驻', 'staffing', 'outsourced', 'staff augmentation', 'agency contract',
    ],
    translation: '劳动关系可能挂在第三方，薪资体系、职级晋升和福利与甲方正式员工不同。',
    question: '劳动合同与哪一方签署？社保由谁缴纳，晋升和调薪走公司还是外包方体系？',
    // 用工性质要单独判定：只看这句话是不是在给「本岗位」定性。
    negations: ['不接受', '不涉及', '不包含', '非', '不是', '并非', '无', '没有', '不设', '拒绝'],
    requirementMarkers: ['经验', '经历', '背景', '优先', '加分', '熟悉', '了解', '管理', '协调', '对接', '验收', '审核', '协助', '配合'],
  },
  {
    id: 'middleOffice',
    category: '协作 / 权责',
    severity: 'info',
    terms: [
      '深度赋能', '业务赋能', '抓手', '组合拳', '拉通对齐', '打通闭环', '沉淀方法论', '生态共建',
      'influence without authority', 'matrix organization', 'dotted line', 'stakeholder buy-in',
    ],
    translation: '偏中台或强跨团队协调型岗位，容易陷入「背指标却没有业务决策权」的拉扯。',
    question: '这个岗位对业务有哪些具体决策权？需要拍板的范围和预算是多少？',
  },
  {
    id: 'deferred',
    category: '承诺 / 兑现',
    severity: 'medium',
    terms: [
      '画饼', '上市后结算', '结果对赌', '股权稀释', '期权分红', '效益奖金', '转正后调整',
      'equity after', 'vesting cliff', 'performance-based bonus',
    ],
    translation: '回报依赖未来不确定事件，现金部分可能被压低，需要问清认定条件与发放时点。',
    question: '这部分回报的认定条件、发放时点和书面约定分别是什么？',
  },
];

/** 输入上限：超过部分不扫描，避免长文本拖慢界面。 */
export const JD_RISK_MAX_LENGTH = 20000;
