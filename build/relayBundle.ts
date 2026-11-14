import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { rolldown } from 'rolldown';

const NOTICE = `// Sea Resume 本机 MCP relay —— 由 @mcp-b/webmcp-local-relay@6.0.3 及依赖（MIT）在构建时打包，依赖已内联。
// 固定版本、只监听回环地址；源码角色和协议与上游一致，请勿改用 @latest。`;

/**
 * 把上游 relay CLI 连同依赖打成单个 ESM 文件：用户只需要一条命令即可接入，
 * 不需要解压或 `npm ci`。依赖从本项目解析，`pnpm.overrides.zod` 与
 * tools/ai-relay/package.json 保持同一个 4.4.3，避免上游混用两个 Zod 后工具列表为空。
 */
export async function createRelayBundle(): Promise<string> {
  const require = createRequire(import.meta.url);
  /** dist/index.mjs is the package entry; the CLI sits next to it. */
  const relayDist = dirname(require.resolve('@mcp-b/webmcp-local-relay'));
  const build = await rolldown({
    input: join(relayDist, 'cli.mjs'),
    platform: 'node',
    resolve: { conditionNames: ['node', 'import', 'default'] },
  });
  const { output } = await build.generate({ format: 'esm', inlineDynamicImports: true, banner: NOTICE });
  const chunk = output.find(item => item.type === 'chunk' && item.isEntry) ?? output.find(item => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('relay 单文件打包失败：没有生成入口代码。');
  return chunk.code;
}
