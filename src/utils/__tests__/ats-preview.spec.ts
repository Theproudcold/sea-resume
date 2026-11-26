import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { analyzeExtractedResumeText } from '@/utils/atsPreview';

describe('ATS extracted text audit', () => {
  it('passes when name, contact and organizations are preserved in single-column extracted text', () => {
    const resume = parseResumeMarkdown(`# 林海 | 后端工程师
linhai@example.com · 13900001111 · 深圳

## 工作经历
### 星海科技 | 高级后端 | 2022-01 — 至今
负责高并发网关

## 教育背景
### 华南理工大学 | 本科 | 软件工程 | 2018-09 — 2022-06`).resume;
    resume.templateId = 'classic';

    const report = analyzeExtractedResumeText(resume, {
      pageCount: 1,
      columnPages: 0,
      text: '林海 后端工程师\nlinhai@example.com 13900001111 深圳\n星海科技 高级后端\n华南理工大学 本科 软件工程',
    });

    expect(report.checks.find((item) => item.id === 'ats-name')?.status).toBe('pass');
    expect(report.checks.find((item) => item.id === 'ats-contact')?.status).toBe('pass');
    expect(report.checks.find((item) => item.id === 'ats-orgs')?.status).toBe('pass');
    expect(report.checks.find((item) => item.id === 'ats-columns')?.status).toBe('pass');
  });

  it('warns on missing contacts/orgs and notes multi-column layouts', () => {
    const resume = parseResumeMarkdown(`# 林海 | 后端工程师
linhai@example.com · 13900001111

## 工作经历
### 星海科技 | 高级后端 | 2022-01 — 至今
负责高并发网关`).resume;
    resume.templateId = 'professional';

    const report = analyzeExtractedResumeText(resume, {
      pageCount: 1,
      columnPages: 1,
      text: '林海 后端工程师\nlin hai@example.com',
    });

    expect(report.checks.find((item) => item.id === 'ats-contact')?.status).toBe('warning');
    expect(report.checks.find((item) => item.id === 'ats-orgs')?.status).toBe('warning');
    expect(report.checks.find((item) => item.id === 'ats-columns')?.status).toBe('info');
  });
});
