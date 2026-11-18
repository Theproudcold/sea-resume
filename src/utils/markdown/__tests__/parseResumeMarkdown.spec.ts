// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseResumeMarkdown } from '../parseResumeMarkdown';
import { markdownToSafeHtml, sanitizeMarkdownUrl } from '../markdownSafety';
import { resumeToMarkdown } from '../exportResumeMarkdown';

const source = `---
title: 李明 - AI Agent 工程师
name: 李明
position: AI Agent 工程师
email: liming@example.com
phone: +86 138-0000-0000
location: 北京
source: personal-notes
---
# 李明 | AI Agent 工程师
[GitHub](https://github.com/example-user) · [博客](https://example.com/blog)

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
    expect(result.sourceTitle).toBe('李明 - AI Agent 工程师');
    expect(result.resume.basic.name).toBe('李明');
    expect(result.resume.basic.title).toBe('AI Agent 工程师');
    expect(result.resume.basic.email).toBe('liming@example.com');
    expect(result.resume.basic.phone).toContain('138-0000-0000');
    expect(result.resume.basic.website).toBe('https://github.com/example-user');
    expect(result.resume.experiences[0]).toMatchObject({ company: 'Sea Labs', position: 'AI Agent 工程师', startDate: '2022-09', endDate: 'present' });
    expect(result.resume.experiences[0]?.highlights).toEqual(['构建可观测的 Agent 平台', '服务支持 10 万用户']);
    expect(result.resume.experiences[0]?.description).not.toContain('构建可观测的 Agent 平台');
    expect(result.resume.education[0]).toMatchObject({ school: '北京大学', degree: '硕士', major: '计算机科学', startDate: '2018-09', endDate: '2022-07' });
    expect(result.resume.projects[0]).toMatchObject({ name: 'Resume Copilot', role: '负责人', link: 'https://example.com/resume', techStack: ['Vue', 'TypeScript'] });
    expect(result.resume.skills.map((skill) => skill.category)).toEqual(['编程语言', '框架']);
    expect(result.unknownSections).toContain('开源贡献');
    expect(result.resume.customBlocks.some((block) => block.title === '开源贡献')).toBe(true);
    expect(result.resume.customBlocks.some((block) => block.title === '未映射的 Frontmatter')).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'unknown-section')).toBe(true);
  });

  it.each([
    {
      name: 'mixed prose and bullets',
      body: '负责项目架构。\n- 完成简历解析与预览\n- 支持离线编辑',
      description: '<p>负责项目架构。</p><ul><li>完成简历解析与预览</li><li>支持离线编辑</li></ul>',
    },
    {
      name: 'bullets only',
      body: '- 完成简历解析与预览\n- 支持离线编辑',
      description: '<ul><li>完成简历解析与预览</li><li>支持离线编辑</li></ul>',
    },
  ])('preserves project descriptions with $name through Markdown import and export', ({ body, description }) => {
    const imported = parseResumeMarkdown(`# 李明\n\n## 项目经历\n### Resume Copilot | 负责人 | 2024-05 — 2025-02\n链接：[项目主页](https://example.com/resume)\n技术栈：Vue、TypeScript\n${body}`).resume;

    expect(imported.projects[0]).toMatchObject({
      name: 'Resume Copilot',
      role: '负责人',
      startDate: '2024-05',
      endDate: '2025-02',
      link: 'https://example.com/resume',
      techStack: ['Vue', 'TypeScript'],
      description,
    });
    const roundtrip = parseResumeMarkdown(resumeToMarkdown(imported)).resume;
    expect(roundtrip.projects[0]?.description).toBe(description);
  });

  it.each(['：', ':'])('preserves unknown %s labels in experience and project content', (separator) => {
    const experienceProse = `Context${separator}负责平台建设`;
    const highlight = `独立成果标记${separator}交付自动化工具`;
    const projectProse = `范围${separator}支持离线编辑`;
    const projectBullet = `Outcome${separator}完成简历解析与预览`;
    const imported = parseResumeMarkdown(`# 李明

## 工作经历
### 标题公司 | 标题职位
Company${separator}Sea Labs
职位${separator}工程师
${experienceProse}
- ${highlight}

## 项目经历
### Resume Copilot | 负责人
链接${separator}[项目主页](https://example.com/resume)
技术栈${separator}Vue、TypeScript
${projectProse}
- ${projectBullet}`).resume;

    expect(imported.experiences[0]).toMatchObject({
      company: 'Sea Labs', position: '工程师',
      description: `<p>${experienceProse}</p>`, highlights: [highlight],
    });
    const projectDescription = `<p>${projectProse}</p><ul><li>${projectBullet}</li></ul>`;
    expect(imported.projects[0]).toMatchObject({
      name: 'Resume Copilot', role: '负责人',
      link: 'https://example.com/resume', techStack: ['Vue', 'TypeScript'],
      description: projectDescription,
    });
    const roundtrip = parseResumeMarkdown(resumeToMarkdown(imported)).resume;
    expect(roundtrip.experiences[0]?.description).toBe(`<p>${experienceProse}</p>`);
    expect(roundtrip.experiences[0]?.highlights).toEqual([highlight]);
    expect(roundtrip.projects[0]?.description).toBe(projectDescription);
  });

  it('uses filename fallback and rejects empty or oversized input', () => {
    expect(parseResumeMarkdown('# 简历', '海波.md').sourceTitle).toBe('简历');
    expect(parseResumeMarkdown('## 工作经历\n\n### 公司').resume.title).toBe('resume');
    expect(() => parseResumeMarkdown('  ')).toThrow('为空');
    expect(() => parseResumeMarkdown('x'.repeat(1024 * 1024 + 1))).toThrow('1 MB');
  });

  it('recovers an entry whose title was written as body text instead of a heading', () => {
    const result = parseResumeMarkdown(`# 于海波 | Agent 应用开发工程师

hypoy9040@163.com

## 工作经历

杭州唐梨科技有限公司 | Agent 应用开发工程师
2026/05 - 至今
参与企业级智能体研发，负责 Agent 规划运行时与多 Agent 协作的落地。

## 教育背景

浙江大学 | 本科 | 计算机科学与技术
2022-09 - 2026-07
`);
    expect(result.resume.experiences).toHaveLength(1);
    expect(result.resume.experiences[0]).toMatchObject({
      company: '杭州唐梨科技有限公司',
      position: 'Agent 应用开发工程师',
      startDate: '2026-05',
      endDate: 'present',
    });
    expect(result.resume.experiences[0]?.description).toContain('参与企业级智能体研发');
    expect(result.resume.experiences[0]?.description).not.toContain('杭州唐梨科技有限公司');
    expect(result.resume.experiences[0]?.description).not.toContain('2026');
    expect(result.resume.education[0]).toMatchObject({
      school: '浙江大学', degree: '本科', major: '计算机科学与技术', startDate: '2022-09', endDate: '2026-07',
    });
    expect(result.warnings.some((warning) => warning.code === 'missing-company')).toBe(false);
  });

  it('warns instead of silently dropping fields when an entry has no usable title', () => {
    const result = parseResumeMarkdown('## 工作经历\n\n参与企业级智能体研发，负责规划运行时。\n');
    expect(result.resume.experiences).toHaveLength(1);
    expect(result.resume.experiences[0]?.company).toBe('');
    expect(result.warnings.some((warning) => warning.code === 'missing-company')).toBe(true);
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
    expect(normalized).toContain('[https://github.com/example-user](https://github.com/example-user)');
    expect(roundtrip.basic.name).toBe(imported.basic.name);
    expect(roundtrip.basic.location).toBe('北京');
    expect(roundtrip.basic.email).toBe(imported.basic.email);
    expect(roundtrip.experiences[0]?.highlights).toEqual(imported.experiences[0]?.highlights);
    expect(roundtrip.experiences[0]?.description).not.toContain('构建可观测的 Agent 平台');
    expect(roundtrip.experiences[0]?.company).toBe(imported.experiences[0]?.company);
    expect(roundtrip.projects[0]?.link).toBe(imported.projects[0]?.link);
    expect(roundtrip.skills.flatMap((skill) => skill.items)).toEqual(expect.arrayContaining(['TypeScript', 'Python', 'Vue', 'Node.js']));
    expect(roundtrip.customBlocks.some((block) => block.title === '开源贡献')).toBe(true);
  });

  it('omits hidden entries and hidden sections from the exported Markdown', () => {
    const parsed = parseResumeMarkdown(`# 李明 | 工程师

liming@example.com

## 工作经历
### 甲公司 | 工程师 | 2022-01 - 2024-01
- 保留的经历

### 乙公司 | 工程师 | 2020-01 - 2022-01
- 隐藏的经历

## 技能
### 编程语言
- TypeScript

## 开源贡献
### Parser
- 维护解析器
`).resume;

    parsed.experiences[1]!.visible = false;
    const hiddenBlock = parsed.customBlocks.find((block) => block.title === '开源贡献')!;
    parsed.hiddenSections = [hiddenBlock.id, 'skills'];

    const markdown = resumeToMarkdown(parsed);
    expect(markdown).toContain('甲公司');
    expect(markdown).toContain('保留的经历');
    expect(markdown).not.toContain('乙公司');
    expect(markdown).not.toContain('隐藏的经历');
    expect(markdown).not.toContain('开源贡献');
    expect(markdown).not.toContain('TypeScript');
    expect(markdown).toContain('liming@example.com');
  });

  it('round-trips custom contacts without losing the primary contact fields', () => {
    const imported = parseResumeMarkdown(source).resume;
    imported.basic.customContacts = [
      { id: 'contact-1', icon: 'Link', label: '微信', value: 'sea-resume' },
      // A numeric contact must stay a custom contact instead of becoming the phone number.
      { id: 'contact-2', icon: 'Link', label: 'QQ', value: '123456789' },
    ];

    const normalized = resumeToMarkdown(imported);
    expect(normalized).toContain('- **微信**：sea-resume');
    expect(normalized).toContain('- **QQ**：123456789');

    const roundtrip = parseResumeMarkdown(normalized).resume;
    expect(roundtrip.basic.customContacts?.map(({ label, value }) => ({ label, value }))).toEqual([
      { label: '微信', value: 'sea-resume' },
      { label: 'QQ', value: '123456789' },
    ]);
    expect(roundtrip.basic.phone).toBe(imported.basic.phone);
    expect(roundtrip.basic.website).toBe(imported.basic.website);
  });

  it('reads the location from the exported contact line and splits plain entry headers', () => {
    const result = parseResumeMarkdown(`# 于海波 | 工程师

liming@example.com · 13800000000 · 杭州 · [主页](https://example.com)

## 工作经历

甲公司 | 工程师 | 2022年9月 - 2024年1月
负责平台建设。
- 完成上线

乙公司 | 工程师
Sep 2020 - Dec 2021
负责维护。

## 教育背景

浙江大学 | 本科 | 计算机
2022-09 - 2026-07
- 优秀毕业生

## 开源贡献
### Parser | 维护者 | 2024-01 — 2025-01
- 修复导入
`);
    expect(result.resume.basic.location).toBe('杭州');
    expect(result.resume.experiences.map((item) => item.company)).toEqual(['甲公司', '乙公司']);
    expect(result.resume.experiences[0]).toMatchObject({ startDate: '2022-09', endDate: '2024-01', highlights: ['完成上线'] });
    expect(result.resume.experiences[0]?.description).not.toContain('完成上线');
    expect(result.resume.experiences[1]).toMatchObject({ startDate: '2020-09', endDate: '2021-12' });
    expect(result.resume.experiences[1]?.description).not.toContain('Sep');
    expect(result.warnings.some((warning) => warning.code === 'unmapped-education-note' && warning.detail?.includes('优秀毕业生'))).toBe(true);
    const contribution = result.resume.customBlocks.find((block) => block.title === '开源贡献');
    expect(Array.isArray(contribution?.content) ? contribution.content[0] : null).toMatchObject({
      title: 'Parser', subtitle: '维护者', date: '2024-01 — 2025-01',
    });
  });
});
