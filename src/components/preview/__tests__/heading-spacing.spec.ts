/**
 * 章节标题的下划线间距回归。
 *
 * 浏览器把行盒（line box）里多出来的行距平分到字形上下，段落内边距必须盖过这半个行距，
 * 否则 padding 被吃掉，边框贴住字形——历史上 AI Agent 模板只有 5px 内边距，
 * 15px×1.3 的行盒下半个行距就把可见间距压到约 1.7px，导出后看起来“标题和下划线贴在一起”。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function sectionTitleRule(file: string): Record<string, string> {
  const css = readFileSync(resolve(process.cwd(), file), 'utf8');
  const block = /\.section-title\s*\{([\s\S]*?)\}/.exec(css)?.[1];
  if (!block) throw new Error(`${file} 里找不到 .section-title 规则`);
  const declarations: Record<string, string> = {};
  for (const match of block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) {
    declarations[match[1]!] = match[2]!.trim();
  }
  return declarations;
}

describe('章节标题与下划线的间距', () => {
  it('AI Agent 模板的标题内边距大于半行行距，下划线不会贴住字形', () => {
    const rule = sectionTitleRule('src/components/preview/templates/AiAgentTemplate.vue');
    const padding = rule.padding!.split(/\s+/).map((value) => Number.parseFloat(value));
    const paddingBottom = padding[2] ?? padding[0] ?? 0;
    const fontSize = Number.parseFloat(rule['font-size']!);
    const lineHeight = Number.parseFloat(rule['line-height']!);
    // 行盒比字形高的部分一半落在字形下方。
    const halfLeading = fontSize * (lineHeight - 1) * 0.5;
    const visibleGap = paddingBottom - halfLeading;
    expect(visibleGap).toBeGreaterThanOrEqual(8);
  });
});
