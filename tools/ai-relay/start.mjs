// Thin launcher only: keep the upstream protocol and origin checks unchanged.
await import(new URL('./cli.mjs', import.meta.resolve('@mcp-b/webmcp-local-relay')));
