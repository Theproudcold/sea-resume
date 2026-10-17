import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { parseResumeMarkdown } from '@/utils/markdown/parseResumeMarkdown';
import { ExternalAiSession } from '../ExternalAiSession';
import { assertProposalBaseline, createChangeProposal, parseChangeProposal, resumeRevision } from '../changeProposal';
import { createExternalContextArchive, readExternalProposal } from '../externalAiFiles';
import { externalTools, relayConfiguration } from '../externalAiBridge';
import { applyResumeAiOperations, parseResumeAiDraft } from '../resumeTools';

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
    const resume = fixture(); const proposal = await createChangeProposal(resume, { explanation: 'why', operations });
    await expect(assertProposalBaseline({ ...resume, id: 'another' }, proposal)).rejects.toThrow('不属于');
    await expect(assertProposalBaseline({ ...resume, title: 'edited' }, proposal)).rejects.toThrow('变化');
    expect(() => parseChangeProposal({ ...proposal, schemaVersion: 2 })).toThrow('版本');
    expect(() => parseChangeProposal({ ...proposal, proposalId: '../file' })).toThrow('ID');
    expect(() => parseChangeProposal('x'.repeat(250001))).toThrow('过大');
  });
  it('enforces exact value types and removes unknown operation payloads at both boundaries', () => {
    expect(() => parseResumeAiDraft({ operations: [{ type: 'set_basic', field: 'summary', value: [] }] })).toThrow();
    expect(() => parseResumeAiDraft({ operations: [{ type: 'update_skill', id: 'x', field: 'items', value: 'not-array' }] })).toThrow();
    expect(parseResumeAiDraft({ operations: [{ ...operations[0], code: 'execute' }] }).operations[0]).not.toHaveProperty('code');
    expect(() => applyResumeAiOperations(fixture(), [{ type: 'set_basic', field: '__proto__', value: 'bad' }] as never)).toThrow('不允许');
  });
});

describe('external AI authorization and file exchange', () => {
  function setup() {
    let resume = fixture();
    const save = vi.fn(async (proposal) => { resume = applyResumeAiOperations(resume, proposal.operations); });
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
    const proposal = await createChangeProposal(read(), { explanation: '', operations });
    await expect(session.propose(proposal)).rejects.toThrow('先读取');
    await session.getContext();
    for (const operation of [
      { type: 'set_basic', field: 'email', value: 'changed' },
      { type: 'update_experience', id: 'hidden', field: 'company', value: 'bad' },
      { type: 'set_template', templateId: 'modern' },
    ]) await expect(session.propose({ ...proposal, operations: [operation] })).rejects.toThrow();
  });
  it('returns pending without saving; handles duplicate concurrent requests and ID collisions', async () => {
    const { session, save, read } = setup(); session.authorize(); await session.getContext();
    const proposal = await createChangeProposal(read(), { explanation: 'why', operations });
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
    const proposal = await createChangeProposal(read(), { explanation: '', operations }); await session.propose(proposal);
    read().basic.title = 'manual edit';
    await expect(session.approve(proposal.proposalId)).rejects.toThrow('变化');
    expect(session.getStatus(proposal.proposalId).status).toBe('conflict');
    session.reject(proposal.proposalId); expect(save).not.toHaveBeenCalled();
    await expect(session.approve(proposal.proposalId)).rejects.toThrow('待确认');
  });
  it('keeps failed saves pending and revocation clears context grants', async () => {
    const { session, read, save } = setup(); session.authorize(); await session.getContext();
    const proposal = await createChangeProposal(read(), { explanation: '', operations }); await session.propose(proposal);
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
    const proposal = await createChangeProposal(read(), { explanation: '', operations });
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
    const proposal = await createChangeProposal(read(), { explanation: '', operations });
    for (let i = 0; i < 50; i++) await session.propose({ ...proposal, proposalId: `p-${i}` });
    await expect(session.propose({ ...proposal, proposalId: 'overflow' })).rejects.toThrow('上限');
  });
});

describe('MCP business tools', () => {
  it('exposes exactly four non-saving tools and pins loopback, package and origin', async () => {
    const resume = fixture();
    const session = new ExternalAiSession(() => resume, vi.fn());
    const tools = externalTools(session);
    expect(tools.map(tool => tool.name)).toEqual(['sea_resume_get_context', 'sea_resume_get_edit_schema', 'sea_resume_propose_changes', 'sea_resume_get_proposal_status']);
    await expect(tools[0]!.execute({})).rejects.toThrow('授权');
    session.authorize(); const result = await tools[0]!.execute({}) as { content: { text: string }[] };
    expect(JSON.parse(result.content[0]!.text).baseRevision).toMatch(/^sha256:/);
    const config = relayConfiguration('https://resume.example.com', '/Users/test/sea-resume-ai-relay/start.mjs');
    expect(config.command).toBe('node');
    expect(config.args[0]).toBe('/Users/test/sea-resume-ai-relay/start.mjs');
    expect(config.args.slice(-6)).toEqual(['--host', '127.0.0.1', '--widget-origin', 'https://resume.example.com', '--max-payload', '500000']);
    expect(() => relayConfiguration('https://example.com/path')).toThrow();
  });
});
