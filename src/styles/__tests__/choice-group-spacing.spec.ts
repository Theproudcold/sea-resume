import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}\\s*\\{[^}]*\\}`).exec(stylesheet)?.[0] ?? '';
}

describe('选项组（按钮式单选框）的留白', () => {
  it('外框留白与按钮间隙都取 4px，相邻圆角之间才有可见缝隙', () => {
    const tray = rule('.el-radio-group:has(> .el-radio-button)');

    expect(tray).toContain('gap: var(--space-2xs);');
    expect(tray).toContain('padding: var(--space-2xs);');
  });

  it('按钮内边距比 Element 默认值略窄，抵消加宽的留白后总宽不失控', () => {
    const inner = rule('.el-radio-button__inner');

    expect(inner).toContain('padding: 8px 14px;');
  });

  it('激活项在浅色底纹上仍有轮廓，不只靠白色和阴影', () => {
    const active = rule('.el-radio-button.is-active .el-radio-button__inner');

    expect(active).toContain('0 0 0 1px var(--color-rule)');
    expect(active).toContain('var(--shadow-key)');
  });
});
