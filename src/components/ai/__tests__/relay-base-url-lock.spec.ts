/**
 * 2026-11-18 Quality 与 Deploy 一起失败：用例写死
 * `http://localhost:3000/ai-relay/relay.mjs`，CI 的 BASE_URL 是 `/sea-resume/`。
 * 接入命令后来从 ExternalAiPanel 的测试挪到服务层和主页 MCP。
 * 锁住现在这两处，避免根路径断言再阻断发布。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const bridgeSpec = source('src/services/ai/__tests__/externalAi.spec.ts');
const connectionSpec = source('src/components/workbench/__tests__/McpConnection.spec.ts');

describe('relay 地址断言', () => {
  it('服务层用子路径拼 relay 包地址，不写死站点根路径', () => {
    expect(bridgeSpec).toContain('https://resume.example.com/sea-resume/ai-relay/relay.mjs');
    expect(bridgeSpec).not.toContain('http://localhost:3000/ai-relay/relay.mjs');
  });

  it('主页命令跟随 BASE_URL，不写死站点根路径上的 relay 包', () => {
    expect(connectionSpec).toContain('import.meta.env.BASE_URL');
    expect(connectionSpec).not.toContain('http://localhost:3000/ai-relay/relay.mjs');
  });
});
