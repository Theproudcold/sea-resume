import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { zipSync } from 'fflate';

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
  return {
    name: 'sea-resume-relay-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = (request.url ?? '').split('?')[0]!;
        const entry = [...files].find(([name]) => pathname.endsWith(`/ai-relay/${name}`));
        if (!entry) return next();
        response.setHeader('Content-Type', `${entry[1].type}; charset=utf-8`);
        response.end(entry[1].body);
      });
    },
    generateBundle() {
      for (const [name, file] of files) this.emitFile({ type: 'asset', fileName: `ai-relay/${name}`, source: file.body });
    },
  };
}
