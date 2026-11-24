import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { ExternalAiSession } from '../ExternalAiSession';
import { assertExternalBaseline, createExternalProposal, parseExternalProposal, resumeRevision } from '../externalProposal';
import { createExternalContextArchive, readExternalProposal } from '../externalAiFiles';
import { externalTools, relayAgentPrompt, relayBundleUrl, relayClients, relayConfigTarget, relayConfiguration, relaySetupCommand, startExternalAiBridge, type RelayClient } from '../externalAiBridge';
import { createResumeLibrary } from '../resumeLibrary';
import { builtinToRecipe } from '@/utils/layout-template';
import { applyResumePatch, parseResumePatch } from '../resumePatch';

const fixture = () => {
  const resume = parseResumeMarkdown('# Private Name\n\n## 工作经历\n### Example | Engineer | 2022.01 — 至今\n- Build tools').resume;
  resume.basic.email = 'secret@example.com'; resume.basic.phone = '123456'; resume.basic.birthDate = '1990-01-01'; resume.basic.avatar = 'secret-avatar';
  return resume;
};
const operations = [{ type: 'set_basic' as const, field: 'summary' as const, value: '事实简介' }];
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('unified change proposals', () => {
  it('hashes unsaved content, ignores auto-save timestamp and normalizes object order', async () => {
    const resume = fixture();
    const first = await resumeRevision(resume);
    resume.updatedAt = 'later';
    expect(await resumeRevision(resume)).toBe(first);
    expect(await resumeRevision({ ...resume, basic: { ...resume.basic } })).toBe(first);
    resume.basic.summary = 'unsaved';
    expect(await resumeRevision(resume)).not.toBe(first);
  });
  it('rejects cross-resume, stale, malformed and oversized proposals', async () => {
    const resume = fixture(); const proposal = await createExternalProposal(resume, { explanation: 'why', operations });
    await expect(assertExternalBaseline({ ...resume, id: 'another' }, proposal)).rejects.toThrow('不属于');
    await expect(assertExternalBaseline({ ...resume, title: 'edited' }, proposal)).rejects.toThrow('变化');
    expect(() => parseExternalProposal({ ...proposal, schemaVersion: 2 })).toThrow('版本');
    expect(() => parseExternalProposal({ ...proposal, proposalId: '../file' })).toThrow('ID');
    expect(() => parseExternalProposal('x'.repeat(250001))).toThrow('过大');
  });
  it('enforces exact value types and removes unknown operation payloads at both boundaries', () => {
    expect(() => parseResumePatch({ operations: [{ type: 'set_basic', field: 'summary', value: [] }] })).toThrow();
    expect(() => parseResumePatch({ operations: [{ type: 'update_skill', id: 'x', field: 'items', value: 'not-array' }] })).toThrow();
    expect(parseResumePatch({ operations: [{ ...operations[0], code: 'execute' }] }).operations[0]).not.toHaveProperty('code');
    expect(() => applyResumePatch(fixture(), [{ type: 'set_basic', field: '__proto__', value: 'bad' }] as never)).toThrow('不允许');
  });
});

describe('external AI authorization and file exchange', () => {
  function setup() {
    let resume = fixture();
    const save = vi.fn(async (proposal) => { resume = applyResumePatch(resume, proposal.operations); });
    const session = new ExternalAiSession(() => JSON.parse(JSON.stringify(resume)), save);
    return { session, save, read: () => resume, replace: (value: typeof resume) => { resume = value; } };
  }
  it('denies unauthorized, expired and switched-resume calls', async () => {
    const { session, read, replace } = setup();
    await expect(session.getContext()).rejects.toThrow('未授权');
    session.authorize(); replace({ ...read(), id: 'other' });
    await expect(session.getContext()).rejects.toThrow('切换');
    session.authorize(); session.expiresAt = Date.now() - 1;
    expect(() => session.getSchema()).toThrow('过期');
  });
  it('exports only visible text plus both CLI guides, not contact fields or hidden entries', async () => {
    const { session, read } = setup();
    read().experiences[0]!.visible = false;
    session.authorize();
    const archive = unzipSync(await createExternalContextArchive(session));
    expect(archive['AGENTS.md']).toBeDefined(); expect(archive['CLAUDE.md']).toBeDefined();
    const serialized = strFromU8(archive['context/resume.json']!);
    for (const secret of ['secret@example.com', '123456', '1990-01-01', 'secret-avatar', 'Private Name', 'Build tools']) expect(serialized).not.toContain(secret);
    expect(JSON.parse(serialized).context.experiences).toEqual([]);
    expect(JSON.parse(strFromU8(archive['proposal.example.json']!)).baseRevision).toMatch(/^sha256:/);
  });
  it('requires an issued baseline and rejects identity, hidden IDs, links and layout edits', async () => {
    const { session, read } = setup(); session.authorize();
    const proposal = await createExternalProposal(read(), { explanation: '', operations });
    await expect(session.propose(proposal)).rejects.toThrow('先读取');
    await session.getContext();
    for (const operation of [
      { type: 'set_basic', field: 'email', value: 'changed' },
      { type: 'update_experience', id: 'hidden', field: 'company', value: 'bad' },
      { type: 'set_template', templateId: 'modern' },
    ]) await expect(session.propose({ ...proposal, operations: [operation] })).rejects.toThrow();
    const layout = builtinToRecipe('professional', read().theme);
    await expect(session.propose({ ...proposal, proposalId: 'layout-edit', operations: [{ type: 'set_layout', layout }] })).resolves.toMatchObject({ status: 'pending' });
    await expect(session.propose({ ...proposal, proposalId: 'layout-css', operations: [{ type: 'set_layout', layout: { ...layout, css: 'x' } }] })).rejects.toThrow('版式');
  });
  it('returns pending without saving; handles duplicate concurrent requests and ID collisions', async () => {
    const { session, save, read } = setup(); session.authorize(); await session.getContext();
    const proposal = await createExternalProposal(read(), { explanation: 'why', operations });
    await Promise.all([session.propose(proposal), session.propose(proposal)]);
    expect(session.entries).toHaveLength(1); expect(save).not.toHaveBeenCalled();
    expect(session.getStatus(proposal.proposalId).status).toBe('pending');
    await expect(session.propose({ ...proposal, explanation: 'different' })).rejects.toThrow('ID');
    await session.approve(proposal.proposalId);
    expect(save).toHaveBeenCalledTimes(1); expect(session.getStatus(proposal.proposalId).status).toBe('applied');
    await session.propose(proposal); expect(save).toHaveBeenCalledTimes(1);
    await expect(session.approve(proposal.proposalId)).rejects.toThrow('待确认');
  });
  it('marks stale drafts as conflict and rejected drafts cannot save', async () => {
    const { session, read, save } = setup(); session.authorize(); await session.getContext();
    const proposal = await createExternalProposal(read(), { explanation: '', operations }); await session.propose(proposal);
    read().basic.title = 'manual edit';
    await expect(session.approve(proposal.proposalId)).rejects.toThrow('变化');
    expect(session.getStatus(proposal.proposalId).status).toBe('conflict');
    session.reject(proposal.proposalId); expect(save).not.toHaveBeenCalled();
    await expect(session.approve(proposal.proposalId)).rejects.toThrow('待确认');
  });
  it('keeps failed saves pending and revocation clears context grants', async () => {
    const { session, read, save } = setup(); session.authorize(); await session.getContext();
    const proposal = await createExternalProposal(read(), { explanation: '', operations }); await session.propose(proposal);
    save.mockRejectedValueOnce(new Error('disk full'));
    await expect(session.approve(proposal.proposalId)).rejects.toThrow('disk full');
    expect(session.getStatus(proposal.proposalId).status).toBe('pending');
    session.revoke(); session.authorize();
    await expect(session.propose(proposal)).rejects.toThrow('先读取');
  });
  it('rejects context/proposal requests revoked while hashing', async () => {
    const { session, read } = setup(); session.authorize();
    const context = session.getContext(); session.revoke();
    await expect(context).rejects.toThrow('授权');
    session.authorize(); await session.getContext();
    const proposal = await createExternalProposal(read(), { explanation: '', operations });
    const pending = session.propose(proposal); session.revoke();
    await expect(pending).rejects.toThrow('授权'); expect(session.entries).toEqual([]);
  });
  it('checks uploaded file size before reading', async () => {
    const text = vi.fn();
    await expect(readExternalProposal({ size: 250001, text } as unknown as File)).rejects.toThrow('过大');
    expect(text).not.toHaveBeenCalled();
  });
  it('caps context grants and draft queue', async () => {
    const { session, read } = setup(); session.authorize(); await session.getContext();
    const proposal = await createExternalProposal(read(), { explanation: '', operations });
    for (let i = 0; i < 50; i++) await session.propose({ ...proposal, proposalId: `p-${i}` });
    await expect(session.propose({ ...proposal, proposalId: 'overflow' })).rejects.toThrow('上限');
  });
  it('accepts removal of a shared visible entry and rejects a hidden one', async () => {
    const { session, save, read } = setup();
    const visible = read().experiences[0]!;
    read().experiences.push({ ...visible, id: 'hidden-exp', visible: false, company: 'Hidden Co' });
    session.authorize();
    await session.getContext();
    const removal = await createExternalProposal(read(), { explanation: '删除这段经历', operations: [{ type: 'remove_entry', collection: 'experiences', id: visible.id }] });
    await session.propose(removal);
    expect(save).not.toHaveBeenCalled();
    await expect(session.propose({ ...removal, proposalId: 'hidden', operations: [{ type: 'remove_entry', collection: 'experiences', id: 'hidden-exp' }] })).rejects.toThrow('未授权');
    await session.approve(removal.proposalId);
    expect(save).toHaveBeenCalledTimes(1);
    expect(read().experiences.map(item => item.id)).not.toContain(visible.id);
    expect(read().experiences.map(item => item.id)).toContain('hidden-exp');
  });
});

describe('MCP business tools', () => {
  it('lists every resume and updates one by id without a second grant', async () => {
    const resume = fixture();
    const library = createResumeLibrary({
      list: async () => [{ id: resume.id, title: resume.title, templateId: resume.templateId, createdAt: 1, updatedAt: 2 }],
      read: async (id) => id === resume.id ? resume : null,
      save: async () => undefined,
      remove: async () => undefined,
    });
    const tools = externalTools(library);
    expect(tools.map(tool => tool.name)).toEqual(['sea_resume_list', 'sea_resume_get', 'sea_resume_set', 'sea_resume_create', 'sea_resume_delete', 'sea_resume_export_pdf', 'sea_interview_list', 'sea_interview_get', 'sea_interview_delete', 'sea_interview_start']);
    const listed = await tools[0]!.execute({}) as { content: { text: string }[] };
    expect(JSON.parse(listed.content[0]!.text)[0].id).toBe(resume.id);
    const read = await tools[1]!.execute({ id: resume.id }) as { content: { text: string }[] };
    expect(JSON.parse(read.content[0]!.text).basic.email).toBe('secret@example.com');
    const rejected = await tools[2]!.execute({ resume: { id: resume.id, basic: {} } }) as { isError?: boolean; content: { text: string }[] };
    expect(rejected.isError).toBe(true);
    expect(rejected.content[0]!.text).toContain('完整');
    const config = relayConfiguration('https://resume.example.com', '/Users/test/sea-resume-ai-relay/start.mjs');
    expect(config.command).toBe('node');
    expect(config.args[0]).toBe('/Users/test/sea-resume-ai-relay/start.mjs');
    expect(config.args.slice(-6)).toEqual(['--host', '127.0.0.1', '--widget-origin', 'https://resume.example.com', '--max-payload', '2000000']);
    expect(() => relayConfiguration('https://example.com/path')).toThrow();
  });
  it('turns the pinned single-file relay into one terminal line and one sentence for the CLI', () => {
    const origin = 'https://resume.example.com';
    const baseUrl = '/sea-resume/';
    const url = relayBundleUrl(origin, baseUrl);
    expect(url).toBe('https://resume.example.com/sea-resume/ai-relay/relay.mjs');
    const codex = relaySetupCommand('codex', origin, baseUrl);
    expect(codex).toContain(`curl -fsSL '${url}' -o "$HOME/.sea-resume-ai-relay/relay.mjs"`);
    expect(codex).toContain('codex mcp add sea-resume -- node "$HOME/.sea-resume-ai-relay/relay.mjs" --host 127.0.0.1 --widget-origin https://resume.example.com --max-payload 2000000');
    expect(codex).not.toContain('npm ci');
    const claude = relaySetupCommand('claude', origin, baseUrl, 'powershell');
    expect(claude).toContain('Invoke-WebRequest -UseBasicParsing');
    expect(claude).toContain('; if (-not $?) { exit 1 }; claude mcp add --transport stdio sea-resume -- node "$HOME\\.sea-resume-ai-relay\\relay.mjs"');
    expect(claude).not.toContain('&&');
    const prompt = relayAgentPrompt('codex', origin, baseUrl);
    expect(prompt).toContain(codex);
    expect(prompt).toContain('sea_resume_list');
    expect(prompt).toContain('sea_resume_delete');
    expect(prompt).not.toContain('sea_resume_get_context');
    for (const call of [() => relayBundleUrl('https://example.com/path', baseUrl), () => relaySetupCommand('codex', 'https://example.com/path', baseUrl), () => relayAgentPrompt('claude', 'ftp://example.com', baseUrl)]) expect(call).toThrow();
  });
  it('keeps mcp add for CLI harnesses and a short config snippet for the rest', () => {
    const origin = 'https://resume.example.com';
    const baseUrl = '/sea-resume/';
    const flags = '--host 127.0.0.1 --widget-origin https://resume.example.com --max-payload 2000000';
    const cli: Record<string, string> = {
      codex: `codex mcp add sea-resume -- node "$HOME/.sea-resume-ai-relay/relay.mjs" ${flags}`,
      claude: `claude mcp add --transport stdio sea-resume -- node "$HOME/.sea-resume-ai-relay/relay.mjs" ${flags}`,
      pi: `pi mcp add sea-resume -- node "$HOME/.sea-resume-ai-relay/relay.mjs" ${flags}`,
      opencode: `opencode mcp add sea-resume -- node "$HOME/.sea-resume-ai-relay/relay.mjs" ${flags}`,
      gemini: `gemini mcp add -s user sea-resume node "$HOME/.sea-resume-ai-relay/relay.mjs" ${flags}`,
      qwen: `qwen mcp add --scope user sea-resume node "$HOME/.sea-resume-ai-relay/relay.mjs" ${flags}`,
      amp: `amp mcp add sea-resume -- node "$HOME/.sea-resume-ai-relay/relay.mjs" ${flags}`,
      copilot: `copilot mcp add sea-resume -- node "$HOME/.sea-resume-ai-relay/relay.mjs" ${flags}`,
    };
    for (const [id, register] of Object.entries(cli)) {
      const command = relaySetupCommand(id as RelayClient, origin, baseUrl);
      expect(command).toContain(register);
      expect(command).not.toContain('npm ci');
      expect(command).not.toContain('printf');
      expect(command).not.toContain('SEA_RESUME_MCP_CLIENT');
      expect(relayConfigTarget(id as RelayClient)).toBeNull();
      expect(relayAgentPrompt(id as RelayClient, origin, baseUrl)).toContain(relayClients.find((item) => item.id === id)!.reload);
    }
    const home = mkdtempSync(join(tmpdir(), 'sea-resume-mcp-'));
    const relay = join(home, '.sea-resume-ai-relay', 'relay.mjs');
    mkdirSync(join(home, '.sea-resume-ai-relay'), { recursive: true });
    writeFileSync(relay, '');
    const relayArgs = [relay, '--host', '127.0.0.1', '--widget-origin', origin, '--max-payload', '2000000'];
    const printed = (client: RelayClient) => {
      const command = relaySetupCommand(client, origin, baseUrl);
      const script = command.split("<<'EOF'\n")[1]?.split('\nEOF')[0];
      expect(script).toBeTruthy();
      const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
        input: script,
        encoding: 'utf8',
        env: { ...process.env, SEA_RESUME_MCP_CLIENT: client, SEA_RESUME_MCP_ORIGIN: origin, SEA_RESUME_MCP_HOME: home },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).not.toContain('$HOME');
      expect(result.stdout).not.toContain('绝对路径');
      return result.stdout.trim();
    };
    const zcode = JSON.parse(printed('zcode'));
    expect(zcode.mcp.servers['sea-resume']).toEqual({ type: 'stdio', command: 'node', args: relayArgs, protocolVersion: 'auto' });
    const crush = JSON.parse(printed('crush'));
    expect(crush.mcp['sea-resume']).toEqual({ type: 'stdio', command: 'node', args: relayArgs });
    expect(crush.mcp['sea-resume'].protocolVersion).toBeUndefined();
    const goose = printed('goose');
    expect(goose.split('\n')).toHaveLength(15);
    expect(goose.match(/extensions:/g)).toHaveLength(1);
    expect(goose.match(/sea-resume:/g)).toHaveLength(1);
    expect(goose).toContain('cmd: "node"');
    expect(goose).toContain(`      - ${JSON.stringify(relay)}`);
    expect(goose).toContain('timeout: 300');
    const dsh = printed('dsh');
    expect(dsh.match(/id: mcp-sea-resume/g)).toHaveLength(1);
    expect(dsh).toContain('name: "@deepseek-ai/dsh-mcp-client"');
    expect(dsh).toContain(`command: ${JSON.stringify(process.execPath)}`);
    expect(dsh).toContain('failOnStartupError: false');
    expect(dsh).toContain('toolCallTimeoutMs: 120000');
    for (const id of ['zcode', 'crush', 'goose', 'dsh'] as const) {
      const command = relaySetupCommand(id, origin, baseUrl);
      expect(command).toContain(`curl -fsSL '${relayBundleUrl(origin, baseUrl)}'`);
      expect(command).toContain(`SEA_RESUME_MCP_CLIENT='${id}'`);
      expect(command).not.toContain('mcp add');
      expect(command).not.toContain('writeFileSync');
      const prompt = relayAgentPrompt(id, origin, baseUrl);
      expect(prompt).toContain(relayConfigTarget(id));
      expect(prompt).toContain('终端打印出的配置');
      expect(prompt).not.toContain('/绝对路径/');
      expect(prompt).toContain(relayClients.find((item) => item.id === id)!.reload);
    }
    expect(relayConfigTarget('crush', 'powershell')).toBe('%APPDATA%\\crush\\crush.json');
    expect(relayConfigTarget('dsh')).toBe('~/.dsh/profiles/<profile>/cordis.patch.yml');
    const powershell = relaySetupCommand('dsh', origin, baseUrl, 'powershell');
    expect(powershell).toContain('Invoke-WebRequest');
    expect(powershell.split("@'")[0]).not.toContain('&&');
    expect(powershell).toContain("$env:SEA_RESUME_MCP_CLIENT='dsh'");
    expect(powershell).toContain("'@ | node --input-type=module -");
    const missing = mkdtempSync(join(tmpdir(), 'sea-resume-mcp-empty-'));
    const absent = spawnSync(process.execPath, ['--input-type=module', '-'], {
      input: relaySetupCommand('zcode', origin, baseUrl).split("<<'EOF'\n")[1]!.split('\nEOF')[0],
      encoding: 'utf8',
      env: { ...process.env, SEA_RESUME_MCP_CLIENT: 'zcode', SEA_RESUME_MCP_ORIGIN: origin, SEA_RESUME_MCP_HOME: missing },
    });
    expect(absent.status).not.toBe(0);
    expect(absent.stderr).toContain('找不到 relay.mjs');
    expect(absent.stdout).toBe('');
    expect(() => relaySetupCommand('goose', 'https://example.com/path', baseUrl)).toThrow();
  });
  it('reports waiting after the host loads and only accepts relay notices from that frame', async () => {
    vi.resetModules();
    vi.doMock('@mcp-b/webmcp-polyfill', () => ({ installWebMCP() { Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool: vi.fn(async () => undefined) } }); } }));
    const { startExternalAiBridge: start } = await import('../externalAiBridge');
    const states: string[] = [];
    const access = createResumeLibrary({ list: async () => [], read: async () => fixture(), save: async () => undefined, remove: async () => undefined });
    const host = document.createElement('iframe');
    const realCreate = document.createElement.bind(document);
    const embed = realCreate('script');
    const append = vi.spyOn(document.body, 'appendChild').mockImplementation(node => node);
    vi.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'iframe' ? host : embed));
    Object.defineProperty(host, 'contentDocument', { configurable: true, value: { body: { appendChild: () => undefined }, createElement: () => embed } });
    Object.defineProperty(host, 'contentWindow', { configurable: true, value: {} });
    Object.defineProperty(host, 'onload', { configurable: true, set(value: () => void) { queueMicrotask(value); } });
    Object.defineProperty(embed, 'onload', { configurable: true, set(value: () => void) { queueMicrotask(value); } });
    const stop = await start(access, undefined, state => states.push(state));
    expect(states).toEqual(['waiting']);
    const notice = (source: MessageEventSource | null, origin: string, type: string, state: string) => {
      window.dispatchEvent(new MessageEvent('message', { origin, source, data: { type, state } }));
    };
    notice(window, location.origin, 'sea-resume.relay', 'connected');
    notice(host.contentWindow, 'https://evil.example', 'sea-resume.relay', 'connected');
    notice(host.contentWindow, location.origin, 'sea-resume.relay', 'connected');
    notice(host.contentWindow, location.origin, 'webmcp.reload', 'connected');
    expect(states).toEqual(['waiting', 'connected']);
    stop();
    notice(host.contentWindow, location.origin, 'sea-resume.relay', 'reconnecting');
    expect(states).toEqual(['waiting', 'connected']);
    append.mockRestore();
    vi.doUnmock('@mcp-b/webmcp-polyfill');
    vi.resetModules();
    delete (document as unknown as { modelContext?: unknown }).modelContext;
  });
});
