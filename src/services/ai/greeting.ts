import type { AiProviderConfig } from '@/types/ai';
import type { ResumeData } from '@/types/resume';
import { requestAiJson, type AiRequestOptions } from './AiClient';
import { buildResumeContext } from './resumeContext';

const PROMPT = `根据简历生成用于招聘平台向招聘方首次沟通的中文打招呼语，返回 JSON：{"greetings":["文案1","文案2","文案3"]}。
生成三条不同表述，每条 60～180 字，礼貌自然、简洁专业，可直接发送，不含标题、占位符或 Markdown。
有招聘要求时，结合岗位要求突出简历中有证据的相关技能或经历；没有招聘要求时，仅根据简历求职意向和真实优势生成通用版本，不假定公司或岗位。
只使用简历已有事实，不把招聘要求当作候选人经历，不编造年限、业绩、技能或匹配程度，不承诺到岗时间，不添加联系方式。以简短问候开头，以邀请进一步沟通结束。`;

export async function requestGreetings(config: AiProviderConfig, resume: ResumeData, jobDescription: string, options: AiRequestOptions = {}): Promise<string[]> {
  const jd = jobDescription.trim();
  if (jd.length > 10000) throw new Error('招聘要求不能超过 10000 字。');
  const result = await requestAiJson(config, PROMPT, { resume: buildResumeContext(resume), jobDescription: jd }, options);
  if (!result || typeof result !== 'object' || !('greetings' in result) || !Array.isArray(result.greetings)
    || result.greetings.length !== 3 || result.greetings.some(item => typeof item !== 'string' || !item.trim() || item.length > 500)) {
    throw new Error('AI 返回的打招呼语格式无效，请重新生成。');
  }
  return result.greetings.map((item: string) => item.trim());
}
