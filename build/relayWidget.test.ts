import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { patchRelayWidget } from './relayWidget';

const require = createRequire(import.meta.url);
const root = dirname(require.resolve('@mcp-b/webmcp-local-relay'));
const widget = readFileSync(join(root, 'browser/widget.js'), 'utf8');

describe('relay widget connection notices', () => {
  it('reports the real handshake and a later disconnect without changing the protocol', () => {
    const patched = patchRelayWidget(widget, 'widget.js');
    expect(patched).toContain("postMessage({type:`sea-resume.relay`,state:`connected`},e.hostOrigin)");
    expect(patched).toContain("postMessage({type:`sea-resume.relay`,state:`reconnecting`},e.hostOrigin)");
    expect(patched).not.toContain('sea-resume.relay`,state:`connected`},\'*\'');
    expect(patched.match(/sea-resume\.relay/g)).toHaveLength(3);
    expect(patched).toContain('type:`tools/list`');
    expect(patched).toContain('type:`webmcp.reload`');
    expect(() => patchRelayWidget('upstream changed', 'widget.js')).toThrow('6.0.3');
  });
});
