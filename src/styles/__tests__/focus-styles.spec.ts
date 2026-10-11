import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/main.scss'), 'utf8');

describe('shared focus styles', () => {
  it('does not draw the generic outline over highlighted dropdown menu items', () => {
    expect(stylesheet).toMatch(/\.el-dropdown-menu__item:focus-visible\s*\{\s*outline:\s*none;\s*\}/);
  });
});
