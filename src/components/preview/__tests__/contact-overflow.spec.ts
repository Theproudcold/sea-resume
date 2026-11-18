/**
 * 联系方式必须完整可读。
 *
 * 历史问题：`.contact-item > span/a` 同时带 `white-space: nowrap` + `overflow: hidden` +
 * `text-overflow: ellipsis`，长邮箱、长主页地址会被省略号截断（`scrollWidth > clientWidth`）。
 * 预览和导出（html2canvas 读同一份计算样式）都会显示成看不全的残片。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/components/preview/templates/AiAgentTemplate.vue'), 'utf8');

/** 按源码原文定位选择器首行，再取到下一个右花括号；不用正则拼选择器，避免元字符漂移。 */
function ruleBody(selector: string): string {
  const start = source.indexOf(`${selector}\n`);
  if (start < 0) throw new Error(`找不到 ${selector} 的样式`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  if (open < 0 || close < 0) throw new Error(`${selector} 的样式规则不完整`);
  return source.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('联系方式的溢出策略', () => {
  it('联系方式文本不省略、不强制单行，并允许在任意位置断词', () => {
    const rule = ruleBody('.contact-item > span,');
    expect(rule).not.toMatch(/text-overflow\s*:\s*ellipsis/);
    expect(rule).not.toMatch(/white-space\s*:\s*nowrap/);
    expect(rule).not.toMatch(/overflow\s*:\s*hidden/);
    expect(rule).toMatch(/overflow-wrap\s*:\s*anywhere/);
  });
});
