import { beforeEach, describe, expect, it, vi } from 'vitest';
const { records, opener, db } = vi.hoisted(() => {
  const records = new Map<string, any>();
  const db = {
    put: vi.fn(async (_store: string, r: any) => { records.set(r.key, r); }),
    get: vi.fn(async (_store: string, key: string) => records.get(key)),
    getAllFromIndex: vi.fn(async (_s: string, _i: string, kind: string) => [...records.values()].filter(r => r.kind === kind)),
    delete: vi.fn(async (_s: string, key: string) => { records.delete(key); }),
    clear: vi.fn(async () => records.clear()),
  };
  return { records, db, opener: vi.fn(async () => db) };
});
vi.mock('idb', () => ({ openDB: opener }));
import { AiWorkspaceRepository, withoutAiSecrets } from '../AiWorkspaceRepository';
beforeEach(() => { records.clear(); vi.clearAllMocks(); opener.mockResolvedValue(db); });
describe('separate AI local workspace', () => {
  it('recursively excludes credentials and does not mutate caller data', async () => {
    const repo = new AiWorkspaceRepository();
    const data = { id: 's1', provider: { apiKey: 'secret', model: 'm', Authorization: 'Bearer s' }, turns: [{ text: 'answer' }] };
    await repo.save('interview', data);
    expect(JSON.stringify([...records.values()])).not.toContain('secret');
    expect(data.provider.apiKey).toBe('secret');
    expect(await repo.get('interview', 's1')).toEqual({ id: 's1', provider: { model: 'm' }, turns: [{ text: 'answer' }] });
    expect(withoutAiSecrets({ password: 's', nested: { accessToken: 's' } })).toEqual({ nested: {} });
  });
  it('keeps kinds independent and supports individual and complete removal', async () => {
    const repo = new AiWorkspaceRepository();
    await repo.save('interview', { id: 'one' }); await repo.save('optimization', { id: 'one' });
    expect(await repo.list('interview')).toEqual([{ id: 'one' }]);
    await repo.delete('interview', 'one');
    expect(await repo.get('interview', 'one')).toBeNull();
    expect(await repo.get('optimization', 'one')).toEqual({ id: 'one' });
    await repo.clear(); expect(records.size).toBe(0);
  });
  it('reports unavailable storage and retries opening only on explicit next call', async () => {
    opener.mockRejectedValueOnce(new Error('blocked'));
    const repo = new AiWorkspaceRepository();
    await expect(repo.save('interview', { id: 's1' })).rejects.toThrow('仅本次会话');
    expect(opener).toHaveBeenCalledTimes(1);
    await repo.save('interview', { id: 's1' });
    expect(opener).toHaveBeenCalledTimes(2);
  });
  it('rejects invalid IDs and excessive records without opening storage', async () => {
    const repo = new AiWorkspaceRepository();
    await expect(repo.save('interview', { id: '' })).rejects.toThrow('ID');
    await expect(repo.save('interview', { id: 's1', text: 'x'.repeat(3000001) })).rejects.toThrow('过大');
    expect(opener).not.toHaveBeenCalled();
  });
});
