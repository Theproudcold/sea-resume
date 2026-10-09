// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '../parseResumeMarkdown';
import { markdownToSafeHtml, sanitizeMarkdownUrl } from '../markdownSafety';
import { resumeToMarkdown } from '../exportResumeMarkdown';

const source = `---
title: 于海波 - AI Agent 工程师
name: 于海波
position: AI Agent 工程师
email: hai.bo@example.com
phone: +86 138-0013-8000
location: 北京
source: personal-notes
---
# 于海波 | AI Agent 工程师
[GitHub](https://github.com/hypoy) · [博客](https://example.com/blog)

## 个人概况
专注于 **AI Agent** 和 TypeScript 工程化。

## 工作经历
### Sea Labs | AI Agent 工程师 | 2022.09 — 至今
- 构建可观测的 Agent 平台
- 服务支持 10 万用户

## 教育经历
### 北京大学 | 硕士 | 计算机科学 | 2018.09 - 2022.07

## 项目经历
### Resume Copilot | 负责人 | 2024.05 - 2025.02
链接：[项目主页](https://example.com/resume)
技术栈：Vue、TypeScript
- 完成简历解析与预览

## 技能
### 编程语言
- TypeScript
- Python
### 框架
- Vue
- Node.js

## 开源贡献
### Resume Parser
- 维护 Markdown 解析器

## 其他
<script>alert('x')</script>
`;

describe('parseResumeMarkdown', () => {
  it('maps common resume fields and keeps unknown content', () => {
    const result = parseResumeMarkdown(source, 'resume.md');
    expect(result.sourceTitle).toBe('于海波 - AI Agent 工程师');
    expect(result.resume.basic.name).toBe('于海波');
    expect(result.resume.basic.title).toBe('AI Agent 工程师');
    expect(result.resume.basic.email).toBe('hai.bo@example.com');
    expect(result.resume.basic.phone).toContain('138-0013-8000');
    expect(result.resume.basic.website).toBe('https://github.com/hypoy');
    expect(result.resume.experiences[0]).toMatchObject({ company: 'Sea Labs', position: 'AI Agent 工程师', startDate: '2022-09', endDate: 'present' });
    expect(result.resume.experiences[0]?.highlights).toContain('构建可观测的 Agent 平台');
    expect(result.resume.education[0]).toMatchObject({ school: '北京大学', degree: '硕士', major: '计算机科学', startDate: '2018-09', endDate: '2022-07' });
    expect(result.resume.projects[0]).toMatchObject({ name: 'Resume Copilot', role: '负责人', link: 'https://example.com/resume', techStack: ['Vue', 'TypeScript'] });
    expect(result.resume.skills.map((skill) => skill.category)).toEqual(['编程语言', '框架']);
    expect(result.unknownSections).toContain('开源贡献');
    expect(result.resume.customBlocks.some((block) => block.title === '开源贡献')).toBe(true);
    expect(result.resume.customBlocks.some((block) => block.title === '未映射的 Frontmatter')).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'unknown-section')).toBe(true);
  });

  it('uses filename fallback and rejects empty or oversized input', () => {
    expect(parseResumeMarkdown('# 简历', '海波.md').sourceTitle).toBe('简历');
    expect(parseResumeMarkdown('## 工作经历\n\n### 公司').resume.title).toBe('resume');
    expect(() => parseResumeMarkdown('  ')).toThrow('为空');
    expect(() => parseResumeMarkdown('x'.repeat(1024 * 1024 + 1))).toThrow('1 MB');
  });

  it('escapes raw HTML and refuses executable or remote-resource URLs', () => {
    const html = markdownToSafeHtml('<script>alert(1)</script> ![remote](https://example.com/x.png)');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<img');
    expect(sanitizeMarkdownUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeMarkdownUrl('data:text/html,evil')).toBeNull();
    expect(sanitizeMarkdownUrl('https://example.com')).toBe('https://example.com');
  });

  it('exports a normalized Markdown document that can be imported again', () => {
    const imported = parseResumeMarkdown(source).resume;
    const normalized = resumeToMarkdown(imported);
    const roundtrip = parseResumeMarkdown(normalized).resume;
    expect(normalized).toContain('[https://github.com/hypoy](https://github.com/hypoy)');
    expect(roundtrip.basic.name).toBe(imported.basic.name);
    expect(roundtrip.basic.email).toBe(imported.basic.email);
    expect(roundtrip.experiences[0]?.company).toBe(imported.experiences[0]?.company);
    expect(roundtrip.projects[0]?.link).toBe(imported.projects[0]?.link);
    expect(roundtrip.skills.flatMap((skill) => skill.items)).toEqual(expect.arrayContaining(['TypeScript', 'Python', 'Vue', 'Node.js']));
    expect(roundtrip.customBlocks.some((block) => block.title === '开源贡献')).toBe(true);
  });
});
