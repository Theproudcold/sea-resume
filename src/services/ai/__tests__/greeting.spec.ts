import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestGreetings } from '../greeting';
import { requestAiJson } from '../transport';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
vi.mock('../transport', () => ({ requestAiJson: vi.fn() }));
const config = { baseUrl: 'https://example.test/v1', model: 'test', apiKey: 'secret' };
beforeEach(() => vi.resetAllMocks());
describe('greeting generation', () => {
  it.each(['', '熟悉 Vue，有前端项目经验'])('generates with optional JD: %s', async jd => {
    const resume = parseResumeMarkdown('# 私密姓名\n\n## 个人简介\n擅长 Vue 开发').resume;
    resume.basic.phone = 'private-phone'; resume.basic.birthDate = '1990-01-01'; resume.basic.email = 'private@example.test';
    const greeting = '您好，我最近一段工作主要做 Vue 前端，简历里有对应项目，希望就这个岗位继续沟通。';
    vi.mocked(requestAiJson).mockResolvedValue({ greetings: [` ${greeting} `, greeting, greeting] });
    const controller = new AbortController();
    await expect(requestGreetings(config, resume, ` ${jd} `, { signal: controller.signal })).resolves.toHaveLength(3);
    const [sentConfig, prompt, data, options] = vi.mocked(requestAiJson).mock.calls[0]!;
    expect(sentConfig).toBe(config); expect(options?.signal).toBe(controller.signal); expect(options?.temperature).toBe(0.7);
    expect(data).toMatchObject({ jobDescription: jd, resume: { basic: { summary: '擅长 Vue 开发' } } });
    for (const secret of ['私密姓名', 'private-phone', '1990-01-01', 'private@example.test', 'secret']) expect(JSON.stringify(data)).not.toContain(secret);
    expect(prompt).toContain('不把招聘要求当作候选人经历');
    expect(prompt).toContain('恰好 3 条');
  });
  it.each([null, {}, { greetings: ['one'] }, { greetings: ['', 'two', 'three'] }, { greetings: [1, 2, 3] }, { greetings: ['啊'.repeat(39), '啊'.repeat(40), '啊'.repeat(40)] }, { greetings: ['啊'.repeat(221), '啊'.repeat(40), '啊'.repeat(40)] }])('rejects malformed output: %j', async result => {
    vi.mocked(requestAiJson).mockResolvedValue(result);
    await expect(requestGreetings(config, parseResumeMarkdown('# 测试').resume, '')).rejects.toThrow('格式无效');
  });
  it('rejects oversized JD before sending', async () => {
    await expect(requestGreetings(config, parseResumeMarkdown('# 测试').resume, 'a'.repeat(10001))).rejects.toThrow('10000');
    expect(requestAiJson).not.toHaveBeenCalled();
  });

  it('supports concise Boss channel length limits (18~80 chars)', async () => {
    const resume = parseResumeMarkdown('# 测试 | 后端工程师\n\n## 个人简介\n三年 Go 开发经验').resume;
    const shortMsg = '您好，三年 Go 后端经验，熟悉高并发微服务，想了解贵司岗位细节。';
    vi.mocked(requestAiJson).mockResolvedValue({ greetings: [shortMsg, shortMsg, shortMsg] });
    await expect(requestGreetings(config, resume, '', { channel: 'boss' })).resolves.toHaveLength(3);
    const [, prompt] = vi.mocked(requestAiJson).mock.calls[0]!;
    expect(prompt).toContain('Boss');
    expect(prompt).toContain('18 到 80 字');

    vi.mocked(requestAiJson).mockResolvedValue({ greetings: ['啊'.repeat(81), shortMsg, shortMsg] });
    await expect(requestGreetings(config, resume, '', { channel: 'boss' })).rejects.toThrow('格式无效');
  });
});
