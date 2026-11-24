/**
 * 共享外观的两条历史回归。
 *
 * 1. 设计系统把非全屏弹窗写成 `margin: 0 auto !important` 之后，Element Plus
 *    的 align-center 失去垂直 auto 外边距，9 个对话框被 stretch 到顶。
 *    修复规则必须排在那条 margin 之后；类名挂在 `.el-dialog` 上，挂回 overlay 等于没写。
 * 2. 头像取景框写死 260px，对话框内容盒只有约 238px，溢出变成横向滚动条。
 *    260px 只能当上限。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8');
const cropDialog = readFileSync(resolve(process.cwd(), 'src/components/editor/AvatarCropDialog.vue'), 'utf8');

describe('共享弹窗与取景框', () => {
  it('中心对齐弹窗的 auto 外边距排在 margin: 0 auto 之后，并且类名在 dialog 上', () => {
    const zeroMargin = stylesheet.indexOf('margin: 0 auto !important');
    const alignRule = stylesheet.indexOf('.el-dialog.is-align-center {');

    expect(zeroMargin).toBeGreaterThanOrEqual(0);
    expect(alignRule).toBeGreaterThan(zeroMargin);
    expect(stylesheet.slice(alignRule, alignRule + 80)).toContain('margin: auto !important');
    expect(stylesheet).not.toContain('.el-overlay-dialog.is-align-center');
  });

  it('取景框宽度不超过对话框内容盒', () => {
    expect(cropDialog).toContain('width: min(100%, 260px)');
    expect(cropDialog).not.toMatch(/width:\s*260px\s*;/);
  });
});
