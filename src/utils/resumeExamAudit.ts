import type { ResumeData } from '@/types/resume';
import type { ResumeQualitySection } from './resumeQuality';

export type ExamAuditCategory = 'tech_depth' | 'metric_claim' | 'ownership';
export type ExamAuditStatus = 'unchecked' | 'ready' | 'study' | 'remove';

export interface ResumeExamPoint {
  id: string;
  category: ExamAuditCategory;
  risk: 'high' | 'medium';
  topic: string;
  section: ResumeQualitySection;
  target: string | null;
  sourceLabel: string;
  sourceSnippet: string;
  probeQuestions: [string, string];
  advice: string;
}

interface TechProbeRule {
  id: string;
  topic: string;
  pattern: RegExp;
  questions: [string, string];
  risk: 'high' | 'medium';
}

const TECH_PROBE_RULES: readonly TechProbeRule[] = [
  {
    id: 'jvm',
    topic: 'JVM 与 Java 底层',
    pattern: /\bJVM\b|垃圾回收|GC|类加载|反射|Java\s*并发|JMM|线程池/iu,
    risk: 'high',
    questions: [
      '线上遇到过哪次 GC 抖动或 OOM？怎么定位堆内存与调优参数的？',
      '双亲委派机制什么时候会被打破？线程池核心参数在你们业务中怎么定？',
    ],
  },
  {
    id: 'mysql',
    topic: 'MySQL / 存储与事务',
    pattern: /\bMySQL\b|\bInnoDB\b|\bMVCC\b|binlog|redolog|undolog|\bWAL\b|索引优化|分库分表/iu,
    risk: 'high',
    questions: [
      'MVCC 在 RR 和 RC 隔离级别下 ReadView 生成时机有什么区别？幻读怎么解决？',
      '慢查询排查时看到什么执行计划会立刻优化？联合索引最左前缀与回表成本怎么权衡？',
    ],
  },
  {
    id: 'redis',
    topic: 'Redis 与多级缓存',
    pattern: /\bRedis\b|分布式锁|缓存穿透|缓存雪崩|缓存击穿|持久化|RDB|AOF/iu,
    risk: 'high',
    questions: [
      '缓存与数据库双写一致性你们怎么保证的？极端并发下有没有出现过脏读？',
      'Redis 大 Key / 热 Key 在线上是怎么发现并治理的？分布式锁续期与主从切换风险怎么处理？',
    ],
  },
  {
    id: 'mq',
    topic: '消息队列与异步解耦',
    pattern: /\bKafka\b|\bRocketMQ\b|\bRabbitMQ\b|消息队列|\bMQ\b|削峰|死信/iu,
    risk: 'high',
    questions: [
      '消息重复消费、乱序和积压在你们系统里怎么兜底？幂等键怎么设计？',
      '如何确保本地数据库事务与发消息的一致性（事务消息/本地消息表）？',
    ],
  },
  {
    id: 'frontend-framework',
    topic: 'Vue / React 与前端性能',
    pattern: /\bVue(?:\.?js|3|2)?\b|\bReact\b|虚拟\s*DOM|响应式|Fiber|首屏|白屏|SSR|Vite|Webpack/iu,
    risk: 'high',
    questions: [
      '框架响应式/更新调度在复杂大列表或高频交互下遇到过什么性能瓶颈？怎么量化排查的？',
      '首屏加载或打包体积优化中，哪个动作收益最大？优化前后用什么指标验证？',
    ],
  },
  {
    id: 'cloud-native',
    topic: 'Docker / K8s 与微服务治理',
    pattern: /\bKubernetes\b|\bK8s\b|\bDocker\b|微服务|限流|熔断|降级|Service\s*Mesh|CI\/CD/iu,
    risk: 'medium',
    questions: [
      '服务雪崩时限流和熔断阈值是如何设定的？降级后对上游业务的影响如何评估？',
      '容器化部署中遇到过哪些镜像体积、健康检查或滚动发布导致的线上问题？',
    ],
  },
  {
    id: 'ai-agent',
    topic: '大模型 / Agent / RAG 工程',
    pattern: /\bLLM\b|\bAgent\b|\bRAG\b|\bMCP\b|大模型|提示词|Prompt|微调|向量检索|Embedding/iu,
    risk: 'high',
    questions: [
      '模型幻觉、输出格式不稳定和长上下文退化你们怎么构建评测集与确定性护栏？',
      'RAG 检索召回率与重排延迟如何权衡？线上 Token 成本与 P99 耗时怎么控制？',
    ],
  },
  {
    id: 'os-network',
    topic: '操作系统与计算机网络',
    pattern: /操作系统|线程|进程|epoll|TCP|HTTP\/?[23]|HTTPS|内存管理|调度/iu,
    risk: 'medium',
    questions: [
      '高并发场景下 TCP 连接状态异常（如大量 TIME_WAIT/CLOSE_WAIT）怎么排查定位？',
      '线程切换与锁竞争开销在你们业务里是怎么观测并减少的？',
    ],
  },
];

const METRIC_CLAIM_RE = /(?<![A-Za-z0-9_])(?:\d+(?:\.\d+)?\s*(?:%|％|倍|万\+?|亿\+?|k\+?|K\+?|w\+?|W\+?|ms|毫秒|秒|QPS|TPS|RPS))(?![A-Za-z0-9_])/u;
const OWNERSHIP_CLAIM_RE = /(主导|从\s*0\s*到\s*1|从零到一|独立负责|架构设计|核心负责人|重构|技术负责人|牵头)/u;

function plainText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

function excerptAround(text: string, pattern: RegExp, maxLen = 78): string {
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return text.slice(0, maxLen);
  const start = Math.max(0, match.index - 22);
  const end = Math.min(text.length, match.index + match[0].length + 40);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

/**
 * 纯本地「简历即考纲」防翻车自查：
 * 扫描当前简历可见的技能、经历与项目，列出面试官最可能围绕简历深挖的考点，
 * 帮助用户在投递前决定「已掌握 / 去补学 / 怕被问倒先删掉」。
 */
export function buildResumeExamAudit(resume: ResumeData): ResumeExamPoint[] {
  const points: ResumeExamPoint[] = [];
  const hidden = resume.hiddenSections ?? [];
  const seenTechIds = new Set<string>();

  const scanTech = (
    text: string,
    section: ResumeQualitySection,
    target: string | null,
    sourceLabel: string,
  ) => {
    if (!text) return;
    for (const rule of TECH_PROBE_RULES) {
      if (seenTechIds.has(rule.id)) continue;
      if (!rule.pattern.test(text)) continue;
      seenTechIds.add(rule.id);
      points.push({
        id: `tech-${rule.id}`,
        category: 'tech_depth',
        risk: rule.risk,
        topic: rule.topic,
        section,
        target,
        sourceLabel,
        sourceSnippet: excerptAround(text, rule.pattern),
        probeQuestions: rule.questions,
        advice: '简历写了该技术方向就等于自己划了考纲：能讲清原理与踩坑就保留，仅听说过建议降级措辞或移除。',
      });
    }
  };

  if (!hidden.includes('skills')) {
    resume.skills.forEach((skill, idx) => {
      if (skill.visible === false) return;
      const text = `${skill.category} ${(skill.items ?? []).join(' ')}`.trim();
      scanTech(text, 'skills', `skill-items-${skill.id}`, `专业技能 · ${skill.category || `分类 ${idx + 1}`}`);
    });
  }

  if (!hidden.includes('experience')) {
    resume.experiences.forEach((exp, idx) => {
      if (exp.visible === false) return;
      const desc = [plainText(exp.description), ...(exp.highlights ?? []).map(plainText)].filter(Boolean).join('；');
      const label = [plainText(exp.company), plainText(exp.position)].filter(Boolean).join(' · ') || `工作经历 ${idx + 1}`;
      const target = `experience-description-${exp.id}`;
      scanTech(desc, 'experience', target, label);

      if (METRIC_CLAIM_RE.test(desc)) {
        points.push({
          id: `metric-exp-${exp.id}`,
          category: 'metric_claim',
          risk: 'high',
          topic: '量化数据溯源',
          section: 'experience',
          target,
          sourceLabel: label,
          sourceSnippet: excerptAround(desc, METRIC_CLAIM_RE),
          probeQuestions: [
            '这个指标优化前的基线是多少？数据是通过什么监控/压测口径统计出来的？',
            '这项收益里有多少来自你的直接改动，多少来自业务自然增长或上下游配合？',
          ],
          advice: '量化数字是高频深挖点，建议提前在「面试口述备忘」里写清统计口径和个人归因。',
        });
      }

      if (OWNERSHIP_CLAIM_RE.test(desc)) {
        points.push({
          id: `owner-exp-${exp.id}`,
          category: 'ownership',
          risk: 'medium',
          topic: '主导权责与方案取舍',
          section: 'experience',
          target,
          sourceLabel: label,
          sourceSnippet: excerptAround(desc, OWNERSHIP_CLAIM_RE),
          probeQuestions: [
            '当时还有哪些备选技术方案？为什么最终选了现在的做法、放弃了另一种？',
            '推进过程中遇到过哪些阻力、返工或线上故障？如果重来你会改什么？',
          ],
          advice: '写了“主导/重构/从0到1”必须能讲清权衡取舍，否则容易被追问露馅。',
        });
      }
    });
  }

  if (!hidden.includes('projects')) {
    resume.projects.forEach((project, idx) => {
      if (project.visible === false) return;
      const desc = `${plainText(project.description)} ${(project.techStack ?? []).join(' ')}`.trim();
      const label = [plainText(project.name), plainText(project.role)].filter(Boolean).join(' · ') || `项目经验 ${idx + 1}`;
      const target = `project-description-${project.id}`;
      scanTech(desc, 'projects', target, label);

      if (METRIC_CLAIM_RE.test(desc)) {
        points.push({
          id: `metric-proj-${project.id}`,
          category: 'metric_claim',
          risk: 'high',
          topic: '项目量化成果核验',
          section: 'projects',
          target,
          sourceLabel: label,
          sourceSnippet: excerptAround(desc, METRIC_CLAIM_RE),
          probeQuestions: [
            '项目的这个量化指标是在真实生产流量还是压测/离线环境测出来的？',
            '你本人具体写了哪几块核心代码？如果让我现在看架构图，瓶颈在哪个环节？',
          ],
          advice: '务必能自洽解释项目的数据来源与测试环境，无法核验的夸大表述建议提前修正。',
        });
      }

      if (OWNERSHIP_CLAIM_RE.test(desc)) {
        points.push({
          id: `owner-proj-${project.id}`,
          category: 'ownership',
          risk: 'medium',
          topic: '项目决策与复盘',
          section: 'projects',
          target,
          sourceLabel: label,
          sourceSnippet: excerptAround(desc, OWNERSHIP_CLAIM_RE),
          probeQuestions: [
            '这个项目最难的技术点是什么？你是怎么一步步拆解并验证的？',
            '上线后有没有暴露出当时没想到的边界问题或性能短板？',
          ],
          advice: '提前准备 1 个真实踩坑复盘案例，比完美无缺的叙述更有说服力。',
        });
      }
    });
  }

  return points.slice(0, 20);
}

const AUDIT_STATE_PREFIX = 'sea-resume:exam-audit-state:v1:';

export function loadExamAuditStatuses(resumeId: string): Record<string, ExamAuditStatus> {
  if (!resumeId) return {};
  try {
    const raw = localStorage.getItem(`${AUDIT_STATE_PREFIX}${resumeId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const valid: Record<string, ExamAuditStatus> = {};
    for (const [id, status] of Object.entries(parsed as Record<string, unknown>)) {
      if (status === 'ready' || status === 'study' || status === 'remove') valid[id] = status;
    }
    return valid;
  } catch {
    return {};
  }
}

export function saveExamAuditStatus(resumeId: string, pointId: string, status: ExamAuditStatus): Record<string, ExamAuditStatus> {
  const current = loadExamAuditStatuses(resumeId);
  if (status === 'unchecked') delete current[pointId];
  else current[pointId] = status;
  if (resumeId) {
    try {
      if (Object.keys(current).length === 0) localStorage.removeItem(`${AUDIT_STATE_PREFIX}${resumeId}`);
      else localStorage.setItem(`${AUDIT_STATE_PREFIX}${resumeId}`, JSON.stringify(current));
    } catch {
      // ignore
    }
  }
  return current;
}
