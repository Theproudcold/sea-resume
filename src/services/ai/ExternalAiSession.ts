import type { ResumeData } from '@/types/resume';
import type { AiResumeContext } from './resumeContext';
import { assertExternalOperations, assertProposalBaseline, externalContext, EXTERNAL_EDIT_SCHEMA, parseChangeProposal, previewProposal, type ResumeChangeProposal } from './changeProposal';

export type ProposalStatus = 'pending' | 'applying' | 'applied' | 'rejected' | 'conflict';
export interface ExternalProposal { proposal: ResumeChangeProposal; status: ProposalStatus; error: string }
const SESSION_MS = 30 * 60_000;
/** In-memory only: no credentials, contexts or bridge permissions survive a reload. */
export class ExternalAiSession {
  resumeId = '';
  expiresAt = 0;
  entries: ExternalProposal[] = [];
  private generation = 0;
  private grants = new Map<string, AiResumeContext>();
  private readonly readResume: () => ResumeData;
  private readonly saveProposal: (proposal: ResumeChangeProposal, assertAuthorized: () => void) => Promise<void>;
  constructor(readResume: () => ResumeData, saveProposal: (proposal: ResumeChangeProposal, assertAuthorized: () => void) => Promise<void>) {
    this.readResume = readResume;
    this.saveProposal = saveProposal;
  }
  authorize(): void {
    this.revoke();
    this.resumeId = this.readResume().id;
    this.expiresAt = Date.now() + SESSION_MS;
  }
  revoke(): void {
    this.generation++;
    this.resumeId = '';
    this.expiresAt = 0;
    this.grants.clear();
    this.entries = [];
  }
  assertAuthorized(): number {
    if (!this.resumeId || Date.now() >= this.expiresAt || this.readResume().id !== this.resumeId) throw new Error('外部 AI 未授权、已过期或已切换简历。请重新授权。');
    return this.generation;
  }
  private assertGeneration(generation: number): void {
    this.assertAuthorized();
    if (generation !== this.generation) throw new Error('外部 AI 授权已撤销。');
  }
  async getContext() {
    const generation = this.assertAuthorized();
    const result = await externalContext(this.readResume());
    this.assertGeneration(generation);
    if (!this.grants.has(result.baseRevision) && this.grants.size >= 30) throw new Error('本次授权上下文数量已达上限，请重新授权。');
    this.grants.set(result.baseRevision, result.context);
    return result;
  }
  getSchema() { this.assertAuthorized(); return EXTERNAL_EDIT_SCHEMA; }
  async propose(input: unknown) {
    const generation = this.assertAuthorized();
    const proposal = parseChangeProposal(input);
    const existing = this.entries.find(entry => entry.proposal.proposalId === proposal.proposalId);
    if (existing) {
      if (JSON.stringify(existing.proposal) !== JSON.stringify(proposal)) throw new Error('草稿 ID 已被其他内容使用。');
      return { proposalId: proposal.proposalId, status: existing.status };
    }
    if (this.entries.length >= 50) throw new Error('本次会话草稿数量已达上限，请重新授权。');
    const context = this.grants.get(proposal.baseRevision);
    if (!context) throw new Error('请先读取／导出本次授权的简历上下文。');
    assertExternalOperations(context, proposal.operations);
    const current = this.readResume();
    await assertProposalBaseline(current, proposal);
    this.assertGeneration(generation);
    previewProposal(current, proposal);
    // Concurrent submissions can finish hashing in the same turn.
    const duplicate = this.entries.find(entry => entry.proposal.proposalId === proposal.proposalId);
    if (duplicate) {
      if (JSON.stringify(duplicate.proposal) !== JSON.stringify(proposal)) throw new Error('草稿 ID 已被其他内容使用。');
      return { proposalId: proposal.proposalId, status: duplicate.status };
    }
    if (this.entries.length >= 50) throw new Error('本次会话草稿数量已达上限。');
    this.entries.push({ proposal, status: 'pending', error: '' });
    return { proposalId: proposal.proposalId, status: 'pending' as const };
  }
  getStatus(proposalId: string) {
    this.assertAuthorized();
    const entry = this.entries.find(entry => entry.proposal.proposalId === proposalId);
    if (!entry) throw new Error('未找到本次会话的草稿。');
    return { proposalId, status: entry.status, error: entry.error };
  }
  reject(proposalId: string): void {
    this.assertAuthorized();
    const entry = this.entries.find(entry => entry.proposal.proposalId === proposalId);
    if (entry?.status === 'pending' || entry?.status === 'conflict') entry.status = 'rejected';
  }
  /** Deliberately NOT exposed by the MCP tool registry. */
  async approve(proposalId: string): Promise<void> {
    const generation = this.assertAuthorized();
    const entry = this.entries.find(entry => entry.proposal.proposalId === proposalId);
    if (!entry || entry.status !== 'pending') throw new Error('草稿不处于待确认状态。');
    entry.status = 'applying';
    try {
      await assertProposalBaseline(this.readResume(), entry.proposal);
      this.assertGeneration(generation);
    } catch (error) {
      entry.status = 'conflict';
      entry.error = error instanceof Error ? error.message : '版本检查失败';
      throw error;
    }
    try {
      await this.saveProposal(entry.proposal, () => this.assertGeneration(generation));
      entry.status = 'applied';
      entry.error = '';
    } catch (error) {
      entry.status = 'pending';
      entry.error = error instanceof Error ? error.message : '保存失败，请重试';
      throw error;
    }
  }
}
