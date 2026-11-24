/**
 * 2026-11-18 Quality 与 Deploy 一起失败：用例写死
 * `http://localhost:3000/ai-relay/relay.mjs`，CI 的 BASE_URL 是 `/sea-resume/`。
 * 生产代码当时已经按 BASE_URL 拼接。这里锁住那个测试，避免根路径断言再阻断发布。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const spec = readFileSync(
  resolve(process.cwd(), 'src/components/ai/__tests__/ExternalAiPanel.spec.ts'),
  'utf8',
);

describe('relay 地址断言', () => {
  it('跟随 BASE_URL，不写死站点根路径上的 relay 包', () => {
    expect(spec).toContain('import.meta.env.BASE_URL');
    expect(spec).not.toContain('http://localhost:3000/ai-relay/relay.mjs');
  });
});
