import { describe, expect, it } from 'vitest';
import {
  appendStarBulletToHtml,
  boldResumeMetricsHtml,
  composeStarListItemHtml,
  composeStarPlainText,
} from '@/utils/starBuilder';

describe('starBuilder utilities', () => {
  it('composes non-empty STAR segments cleanly without filler labels', () => {
    expect(composeStarPlainText({
      situation: '大促期间结算接口超时。',
      task: '负责性能治理',
      action: '引入本地缓存并优化慢查询，',
      result: '接口耗时降低 45%',
    })).toBe('大促期间结算接口超时，负责性能治理，引入本地缓存并优化慢查询，接口耗时降低 45%。');

    expect(composeStarPlainText({ situation: '', task: '', action: '重构表格渲染', result: '' })).toBe('重构表格渲染。');
    expect(composeStarPlainText({ situation: '  ', task: '', action: '', result: '' })).toBe('');
  });

  it('bolds quantified metrics safely without double-wrapping or mangling tech identifiers and links', () => {
    const html = '<p>优化 P99 接口，耗时降低 45%，承载 10k QPS，详见 <a href="https://example.com/v2">https://example.com/100%</a>，已有 <strong>3 倍</strong> 提升。</p>';
    const result = boldResumeMetricsHtml(html);
    expect(result).toContain('P99');
    expect(result).not.toContain('P<strong>99');
    expect(result).toContain('<strong>45%</strong>');
    expect(result).toContain('<strong>10k</strong>');
    expect(result).toContain('<a href="https://example.com/v2">https://example.com/100%</a>');
    expect(result).toContain('已有 <strong>3 倍</strong> 提升');
    expect(result).not.toContain('<strong><strong>');
  });

  it('appends composed STAR items into an existing bullet list when present', () => {
    const item = composeStarListItemHtml({
      situation: '',
      task: '',
      action: '拆分构建产物',
      result: '首屏体积下降 32%',
    });
    expect(item).toBe('<li>拆分构建产物，首屏体积下降 <strong>32%</strong>。</li>');
    expect(appendStarBulletToHtml('', item)).toBe(`<ul>${item}</ul>`);
    expect(appendStarBulletToHtml('<ul><li>已有要点</li></ul>', item)).toBe(`<ul><li>已有要点</li>${item}</ul>`);
  });
});
