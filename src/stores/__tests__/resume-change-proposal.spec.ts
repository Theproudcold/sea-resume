import { webcrypto } from 'node:crypto';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResumeStore } from '../resume';
import { storageManager } from '@/services/storage/StorageManager';
import { createChangeProposal } from '@/services/ai/changeProposal';
import { ExternalAiSession } from '@/services/ai/ExternalAiSession';

beforeEach(() => { setActivePinia(createPinia()); vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const draft = { explanation: 'why', operations: [{ type: 'set_basic' as const, field: 'summary' as const, value: '事实描述' }] };

describe('resume proposal persistence barrier', () => {
  it('saves through the current adapter, supports undo and refuses replay', async () => {
    const store = useResumeStore(); const save = vi.spyOn(storageManager, 'save').mockResolvedValue();
    const before = store.exportData(); const proposal = await createChangeProposal(before, draft);
    await store.applyChangeProposal(proposal);
    expect(save).toHaveBeenCalledTimes(1); expect(store.data.basic.summary).toContain('事实描述'); expect(store.canUndo).toBe(true);
    await expect(store.applyChangeProposal(proposal)).rejects.toThrow('已应用');
    await store.undo(); expect(store.data.basic.summary).toBe(before.basic.summary);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('does not replace unsaved manual edits or another resume', async () => {
    const store = useResumeStore(); const save = vi.spyOn(storageManager, 'save').mockResolvedValue();
    const proposal = await createChangeProposal(store.exportData(), draft);
    store.data.basic.title = 'unsaved edit';
    await expect(store.applyChangeProposal(proposal)).rejects.toThrow('变化');
    expect(store.data.basic.title).toBe('unsaved edit'); expect(save).not.toHaveBeenCalled();
    store.data.id = 'other'; await expect(store.applyChangeProposal(proposal)).rejects.toThrow('不属于');
  });
  it('rolls back only this batch on failure, retains retryable proposal and history', async () => {
    const store = useResumeStore(); const before = store.exportData();
    const save = vi.spyOn(storageManager, 'save').mockRejectedValueOnce(new Error('disk full')).mockResolvedValue();
    const proposal = await createChangeProposal(before, draft);
    await expect(store.applyChangeProposal(proposal)).rejects.toThrow('disk full');
    expect(store.exportData()).toEqual(before); expect(store.historyPast).toEqual([]); expect(store.appliedProposalIds).toEqual([]); expect(store.saveStatus).toBe('error');
    await store.applyChangeProposal(proposal); expect(save).toHaveBeenCalledTimes(2); expect(store.saveStatus).toBe('saved');
  });
  it('rejects concurrent approval while a disk write is pending', async () => {
    const store = useResumeStore(); let resolve!: () => void;
    vi.spyOn(storageManager, 'save').mockImplementation(() => new Promise<void>(r => { resolve = r; }));
    const proposal = await createChangeProposal(store.exportData(), draft);
    const pending = store.applyChangeProposal(proposal);
    await vi.waitFor(() => expect(store.saveStatus).toBe('saving'));
    await expect(store.applyChangeProposal(proposal)).rejects.toThrow('正在处理');
    resolve(); await pending;
  });
  it('does not roll back newer edits when an old proposal write fails', async () => {
    const store = useResumeStore(); let reject!: (error: Error) => void;
    vi.spyOn(storageManager, 'save').mockImplementation(() => new Promise<void>((_r, fail) => { reject = fail; }));
    const proposal = await createChangeProposal(store.exportData(), draft);
    const pending = store.applyChangeProposal(proposal);
    const failure = expect(pending).rejects.toThrow('disk full');
    await vi.waitFor(() => expect(store.saveStatus).toBe('saving'));
    store.updateBasic({ title: 'newer typing' });
    store.cancelScheduledSave();
    reject(new Error('disk full')); await failure;
    expect(store.data.basic.title).toBe('newer typing'); expect(store.appliedProposalIds).toEqual([]);
  });
  it('rejects mutation during the asynchronous baseline check', async () => {
    const store = useResumeStore(); const save = vi.spyOn(storageManager, 'save').mockResolvedValue();
    const proposal = await createChangeProposal(store.exportData(), draft);
    const pending = store.applyChangeProposal(proposal);
    store.data.basic.title = 'typed during digest';
    await expect(pending).rejects.toThrow('变化'); expect(save).not.toHaveBeenCalled();
  });
  it('revocation during the Store digest cancels before mutation or disk write', async () => {
    const store = useResumeStore();
    const save = vi.spyOn(storageManager, 'save').mockResolvedValue();
    const before = store.exportData();
    const session = new ExternalAiSession(() => store.exportData(), (proposal, check) => {
      const pending = store.applyChangeProposal(proposal, check);
      session.revoke();
      return pending;
    });
    session.authorize(); await session.getContext();
    const proposal = await createChangeProposal(before, draft);
    await session.propose(proposal);
    await expect(session.approve(proposal.proposalId)).rejects.toThrow('授权');
    expect(save).not.toHaveBeenCalled();
    expect(store.exportData()).toEqual(before);
    expect(store.historyPast).toEqual([]);
  });
});
