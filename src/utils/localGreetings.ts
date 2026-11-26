import type { ResumeData } from '@/types/resume';
import { calculateWorkExperience } from './resumeSmartFields';

export type GreetingChannel = 'standard' | 'boss' | 'headhunter';

export interface GreetingChannelOption {
  value: GreetingChannel;
  label: string;
  description: string;
  minLength: number;
  maxLength: number;
}

export const GREETING_CHANNELS: readonly GreetingChannelOption[] = [
  {
    value: 'standard',
    label: '标准直聊',
    description: '40~220 字，适合常规招聘平台沟通',
    minLength: 40,
    maxLength: 220,
  },
  {
    value: 'boss',
    label: 'Boss 极简破冰',
    description: '18~80 字，一句话直给最硬匹配点，不折叠',
    minLength: 18,
    maxLength: 80,
  },
  {
    value: 'headhunter',
    label: '猎头 / 内推',
    description: '60~300 字，结构化呈现定位与代表成果',
    minLength: 60,
    maxLength: 300,
  },
];

function plainText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

/** 从简历里抽取前几项核心技能词（尽量取短词，长句则截断到第一个标点前）。 */
function pickSkillKeywords(resume: ResumeData, limit = 4): string[] {
  const hidden = resume.hiddenSections ?? [];
  if (hidden.includes('skills')) return [];
  const tokens: string[] = [];
  for (const group of resume.skills) {
    if (group.visible === false) continue;
    for (const raw of group.items ?? []) {
      const cleaned = plainText(raw).split(/[，。；：,;（(]/u)[0]?.trim() ?? '';
      if (!cleaned) continue;
      if (cleaned.length <= 18 && !tokens.includes(cleaned)) tokens.push(cleaned);
      if (tokens.length >= limit) return tokens;
    }
    if (group.category.trim() && !tokens.length) tokens.push(group.category.trim());
  }
  return tokens;
}

/**
 * 纯本地、零 AI 调用的打招呼语模板生成。
 * 只引用简历里可见的真实字段，绝不编造年限、指标或联系方式。
 */
export function buildLocalGreetings(resume: ResumeData, channel: GreetingChannel = 'boss', jd = ''): string[] {
  const hidden = resume.hiddenSections ?? [];
  const role = plainText(resume.basic.title) || '目标岗位';
  const city = plainText(resume.basic.location);
  const expYears = calculateWorkExperience(resume.experiences);
  const latestExp = hidden.includes('experience')
    ? undefined
    : resume.experiences.find((item) => item.visible !== false && (plainText(item.position) || plainText(item.company)));
  const latestProject = hidden.includes('projects')
    ? undefined
    : resume.projects.find((item) => item.visible !== false && plainText(item.name));
  const skills = pickSkillKeywords(resume, 4);
  const skillText = skills.length ? skills.join(' / ') : '';
  const hasJd = plainText(jd).length > 0;

  if (channel === 'boss') {
    const expPart = expYears ? `${expYears}经验` : '';
    const line1Parts = [
      `您好，应聘${role}`,
      expPart,
      skillText ? `熟悉 ${skillText}` : '',
      '可随时发简历进一步沟通。',
    ].filter(Boolean);

    const recentAnchor = latestExp
      ? `近期任${plainText(latestExp.position) || role}`
      : latestProject
        ? `近期主导过「${plainText(latestProject.name)}」项目`
        : `主攻${role}方向`;
    const line2 = `您好，${recentAnchor}${skillText ? `，核心技术栈含 ${skillText}` : ''}，想进一步了解贵司该岗位的具体业务方向。`;

    return [line1Parts.join('，').replace('，可随时', '，可随时'), line2];
  }

  if (channel === 'headhunter') {
    const profileLine = [
      `定位：${role}`,
      expYears ? `工作经验：${expYears}` : '',
      city ? `意向城市：${city}` : '',
    ].filter(Boolean).join('；');
    const bgLine = latestExp
      ? `最近一段担任 ${plainText(latestExp.position) || role}`
      : latestProject
        ? `代表项目包括「${plainText(latestProject.name)}」`
        : '具备相关方向实践经历';
    const stackLine = skillText ? `核心技能覆盖 ${skillText}。` : '';
    const jdHint = hasJd ? '看到您分享的岗位要求与我的背景契合度较高，' : '';
    return [
      `您好，${jdHint}简单同步下我的背景：${profileLine}。${bgLine}，${stackLine}如当前有匹配机会，我可以发送最新完整简历供您评估。`,
      `您好，目前正在看${city ? `${city}` : ''}${role}相关机会${expYears ? `（${expYears}相关经验）` : ''}，${stackLine || '有完整项目落地经验。'}方便的话请告知团队现状与岗位侧重点，我同步最新简历给您。`,
    ];
  }

  const line1 = `您好，看到贵司正在招聘${role}。我${expYears ? `有 ${expYears}相关经验，` : ''}${skillText ? `技术方向聚焦 ${skillText}，` : ''}${latestExp ? `最近一段担任${plainText(latestExp.position) || role}，` : ''}希望能进一步交流岗位细节。`;
  const line2 = `您好，我的求职方向是${role}${city ? `（${city}）` : ''}，${latestProject ? `近期参与了「${plainText(latestProject.name)}」项目的落地，` : ''}${skillText ? `常用 ${skillText}，` : ''}如方便可发您完整简历并了解团队目前的业务重点。`;
  return [line1, line2];
}
