import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');

describe('下拉菜单图标列', () => {
  it('给图标固定宽度与统一间距，标签落在同一条竖线上', () => {
    const iconRule = /\.el-dropdown-menu__item > \.el-icon\s*\{[^}]*\}/.exec(stylesheet)?.[0] ?? '';

    expect(iconRule).toContain('width: var(--dropdown-icon-rail);');
    expect(iconRule).toContain('margin-right: var(--dropdown-icon-gap);');
    expect(iconRule).toContain('font-size: var(--dropdown-icon-rail);');
  });

  it('菜单里有无图标的项也补出图标位，避免标签参差不齐', () => {
    expect(stylesheet).toMatch(
      /\.el-dropdown-menu:has\(> \.el-dropdown-menu__item > \.el-icon\)\s*>\s*\.el-dropdown-menu__item:not\(:has\(> \.el-icon\)\)\s*\{[^}]*padding-left:\s*calc\(/,
    );
  });
});
