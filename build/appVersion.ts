import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/**
 * 把 package.json 的版本号注入前端，保证界面与发版 tag 出自同处。
 * 发版分支与 tag 会校验 package.json，构建时再读一次，避免两处版本各说各话。
 */
export function readAppVersion(root = process.cwd()): string {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: unknown };
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
    throw new Error('package.json 缺少 version 字段，无法注入应用版本号。');
  }
  return manifest.version.trim();
}

export function appVersion(): Plugin {
  return {
    name: 'sea-resume-app-version',
    config() {
      return {
        define: {
          __APP_VERSION__: JSON.stringify(readAppVersion()),
        },
      };
    },
  };
}
