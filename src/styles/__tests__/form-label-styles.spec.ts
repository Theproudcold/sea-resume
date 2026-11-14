import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');

describe('顶部表单标签', () => {
  it('用 flex 承载必填星号，避免带图标的标签被星号挤成两行', () => {
    expect(stylesheet).toMatch(/\.el-form-item--label-top \.el-form-item__label\s*\{[^}]*display:\s*flex;/);
  });
});
