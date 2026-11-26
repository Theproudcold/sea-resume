import type { ResumeData } from '@/types/resume';
import { createResumePdfBlob } from './export-pdf';
import { extractPdfText } from '@/services/ai/pdfResumeImport';

export interface AtsCheckItem {
  id: string;
  label: string;
  status: 'pass' | 'warning' | 'info';
  detail: string;
}

export interface AtsAuditReport {
  pageCount: number;
  columnPages: number;
  extractedText: string;
  checks: AtsCheckItem[];
}

const TWO_COLUMN_TEMPLATES = new Set(['professional', 'editorial', 'creative']);

function compact(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function plainText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

function isMultiColumnLayout(resume: ResumeData): boolean {
  if (resume.layout) return resume.layout.structure !== 'single';
  return TWO_COLUMN_TEMPLATES.has(resume.templateId);
}

/**
 * 对比机器提取出的纯文本与简历可见字段，生成纯本地 ATS / 官网一键解析预检报告。
 * 纯函数设计，便于直接做确定性单元测试。
 */
export function analyzeExtractedResumeText(
  resume: ResumeData,
  extracted: { text: string; pageCount: number; columnPages: number },
): AtsAuditReport {
  const checks: AtsCheckItem[] = [];
  const raw = extracted.text || '';
  const normalized = compact(raw);
  const hidden = resume.hiddenSections ?? [];

  // 1. 姓名提取检查
  const name = plainText(resume.basic.name);
  if (name) {
    const matched = normalized.includes(compact(name));
    checks.push({
      id: 'ats-name',
      label: '姓名识别',
      status: matched ? 'pass' : 'warning',
      detail: matched ? `已完整识别姓名「${name}」。` : `提取文本中未完整命中姓名「${name}」，请检查字体或特殊字符。`,
    });
  }

  // 2. 联系方式识别（邮箱与电话是最容易被空格/断行打散的字段）
  const email = plainText(resume.basic.email);
  const phone = plainText(resume.basic.phone);
  const missingContacts: string[] = [];
  if (email && !raw.toLowerCase().includes(email.toLowerCase())) missingContacts.push(`邮箱(${email})`);
  if (phone && !normalized.includes(compact(phone))) missingContacts.push(`电话(${phone})`);
  if (email || phone) {
    checks.push({
      id: 'ats-contact',
      label: '联系方式解析',
      status: missingContacts.length ? 'warning' : 'pass',
      detail: missingContacts.length
        ? `以下联系方式未被完整连续识别：${missingContacts.join('、')}，建议检查是否发生折行。`
        : '邮箱与电话均完整连续，可被网申系统正常抽取。',
    });
  }

  // 3. 公司与学校名称识别
  const orgNames: string[] = [];
  if (!hidden.includes('experience')) {
    resume.experiences
      .filter((item) => item.visible !== false)
      .forEach((item) => {
        const company = plainText(item.company);
        if (company) orgNames.push(company);
      });
  }
  if (!hidden.includes('education')) {
    resume.education
      .filter((item) => item.visible !== false)
      .forEach((item) => {
        const school = plainText(item.school);
        if (school) orgNames.push(school);
      });
  }
  if (orgNames.length) {
    const missingOrgs = orgNames.filter((org) => !normalized.includes(compact(org)));
    checks.push({
      id: 'ats-orgs',
      label: '公司与学校识别',
      status: missingOrgs.length ? 'warning' : 'pass',
      detail: missingOrgs.length
        ? `以下组织名称未完整命中：${missingOrgs.slice(0, 4).join('、')}。`
        : `全部 ${orgNames.length} 项公司/学校名称均可被完整读取。`,
    });
  }

  // 4. 分栏排版与阅读顺序提醒
  if (extracted.columnPages > 0 || isMultiColumnLayout(resume)) {
    checks.push({
      id: 'ats-columns',
      label: '单双栏兼容性',
      status: 'info',
      detail: '当前为多栏版式；部分老旧大厂网申解析器可能跨栏拼接文本。投递官网自动填表时，推荐切换「经典学院 / ATS」等单栏模板再导出可搜索 PDF。',
    });
  } else {
    checks.push({
      id: 'ats-columns',
      label: '单双栏兼容性',
      status: 'pass',
      detail: '当前为单栏流式结构，机器阅读顺序自然，对 ATS / 官网一键解析最友好。',
    });
  }

  // 5. 导出格式提示
  checks.push({
    id: 'ats-export-tip',
    label: '投递导出格式提示',
    status: 'info',
    detail: '「下载 PDF」为所见即所得图片型 PDF，适合直接发给面试官阅读；投递需要自动解析填表的官网时，请使用「其他格式 → 可复制文字的 PDF」。',
  });

  return {
    pageCount: extracted.pageCount,
    columnPages: extracted.columnPages,
    extractedText: raw,
    checks,
  };
}

/**
 * 纯本地运行一次“生成可搜索 PDF → pdfjs 提取纯文本 → ATS 字段校验”闭环，
 * 让用户在投递大厂官网前直接看到机器解析结果。
 */
export async function runLocalAtsPdfPreview(resume: ResumeData): Promise<AtsAuditReport> {
  const blob = await createResumePdfBlob(resume);
  const file = new File([blob], `${resume.title || 'resume'}.pdf`, { type: 'application/pdf' });
  const extracted = await extractPdfText(file);
  return analyzeExtractedResumeText(resume, extracted);
}
