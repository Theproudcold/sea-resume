import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

test('relay lock keeps a single compatible Zod version', async () => {
  const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url)));
  const lock = JSON.parse(await readFile(new URL('./package-lock.json', import.meta.url)));
  assert.equal(manifest.dependencies['@mcp-b/webmcp-local-relay'], '6.0.3');
  assert.equal(manifest.overrides.zod, '4.4.3');
  const versions = Object.entries(lock.packages).filter(([path]) => path.endsWith('node_modules/zod')).map(([, entry]) => entry.version);
  assert.deepEqual(versions, ['4.4.3']);
});

test('upstream stdio relay initializes and lists tools without a browser', { timeout: 15000 }, async t => {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('./start.mjs', import.meta.url)), '--host', '127.0.0.1', '--port', String(port), '--widget-origin', 'http://localhost:3000'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let sequence = 0; let buffer = ''; let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  t.after(() => { child.kill(); for (const call of pending.values()) clearTimeout(call.timer); });
  child.on('exit', () => { for (const call of pending.values()) { clearTimeout(call.timer); call.reject(new Error(`Relay exited: ${stderr}`)); } pending.clear(); });
  child.on('error', error => { for (const call of pending.values()) { clearTimeout(call.timer); call.reject(error); } pending.clear(); });
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line); const call = pending.get(message.id);
      if (!call) continue;
      clearTimeout(call.timer); pending.delete(message.id);
      if (message.error) call.reject(new Error(JSON.stringify(message.error)));
      else call.resolve(message.result);
    }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}; ${stderr}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const initialized = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'sea-resume-relay-check', version: '1' } });
  assert.equal(initialized.serverInfo.version, '6.0.3');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const listed = await request('tools/list', {});
  assert.ok(listed.tools.some(tool => tool.name === 'webmcp_call_tool'));
});
