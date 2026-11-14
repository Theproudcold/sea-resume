import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { zipSync } from 'fflate';
import { createRelayBundle } from './relayBundle';

/** Ship pinned upstream browser resources, never fetch executable code from a CDN. */
export function relayAssets(): Plugin {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve('@mcp-b/webmcp-local-relay'));
  const files = new Map<string, { body: string | Uint8Array; type: string }>();
  for (const file of ['embed.js', 'widget.html', 'widget.js']) {
    files.set(file, { body: readFileSync(join(root, 'browser', file), 'utf8'), type: file.endsWith('.js') ? 'text/javascript' : 'text/html' });
  }
  files.set('LICENSE', { body: readFileSync(join(root, '..', 'LICENSE'), 'utf8'), type: 'text/plain' });
  files.set('host.html', { body: '<!doctype html><html><head><meta charset="utf-8"><title>Sea Resume AI Relay</title></head><body></body></html>', type: 'text/html' });
  const launcher: Record<string, Uint8Array> = {};
  for (const name of ['package.json', 'package-lock.json', 'start.mjs', 'relay.test.mjs', 'README.md']) {
    launcher[`sea-resume-ai-relay/${name}`] = new Uint8Array(readFileSync(join(process.cwd(), 'tools/ai-relay', name)));
  }
  files.set('relay-install.zip', { body: zipSync(launcher), type: 'application/zip' });
  /** Bundling is slow, so it happens once, on demand, for whichever comes first: dev request or production build. */
  let packaged: Promise<Uint8Array> | undefined;
  const relayBundle = () => (packaged ??= createRelayBundle().then(code => new TextEncoder().encode(code)));
  return {
    name: 'sea-resume-relay-assets',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = (request.url ?? '').split('?')[0]!;
        if (pathname.endsWith('/ai-relay/relay.mjs')) {
          try {
            const body = await relayBundle();
            response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
            response.end(body);
          } catch (error) {
            response.statusCode = 500;
            response.end(error instanceof Error ? error.message : 'relay 单文件打包失败。');
          }
          return;
        }
        const entry = [...files].find(([name]) => pathname.endsWith(`/ai-relay/${name}`));
        if (!entry) return next();
        response.setHeader('Content-Type', `${entry[1].type}; charset=utf-8`);
        response.end(entry[1].body);
      });
    },
    async generateBundle() {
      for (const [name, file] of files) this.emitFile({ type: 'asset', fileName: `ai-relay/${name}`, source: file.body });
      this.emitFile({ type: 'asset', fileName: 'ai-relay/relay.mjs', source: await relayBundle() });
    },
  };
}
