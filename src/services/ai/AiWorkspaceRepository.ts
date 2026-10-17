import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type AiRecordKind = 'optimization' | 'interview';
interface StoredRecord { key: string; kind: AiRecordKind; id: string; updatedAt: number; version: 1; data: unknown }
interface AiWorkspaceDb extends DBSchema { records: { key: string; value: StoredRecord; indexes: { kind: AiRecordKind } } }
const SECRET_FIELDS = new Set(['apikey', 'authorization', 'password', 'access_token', 'refresh_token', 'accesstoken', 'refreshtoken']);
/** Defense in depth: credentials are excluded even if a caller accidentally supplies config. */
export function withoutAiSecrets<T>(record: T): T {
  return JSON.parse(JSON.stringify(record, (key, value) => SECRET_FIELDS.has(key.toLowerCase()) ? undefined : value)) as T;
}
function assertKind(kind: AiRecordKind): void { if (!['optimization', 'interview'].includes(kind)) throw new Error('AI 记录类型无效。'); }
function assertId(id: string): void { if (typeof id !== 'string' || !id || id.length > 250) throw new Error('AI 记录 ID 无效。'); }
export class AiWorkspaceRepository {
  private dbPromise: Promise<IDBPDatabase<AiWorkspaceDb>> | undefined;
  private db(): Promise<IDBPDatabase<AiWorkspaceDb>> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<AiWorkspaceDb>('sea-resume-ai-workspace', 1, {
        upgrade(db) { db.createObjectStore('records', { keyPath: 'key' }).createIndex('kind', 'kind'); },
        blocking: () => { void this.dbPromise?.then(db => db.close()); this.dbPromise = undefined; },
      }).catch(error => { this.dbPromise = undefined; throw new Error(`AI 记录存储不可用：${error instanceof Error ? error.message : '未知错误'}。可改为仅本次会话。`); });
    }
    return this.dbPromise;
  }
  async save<T extends { id: string }>(kind: AiRecordKind, record: T): Promise<void> {
    assertKind(kind); assertId(record.id);
    const data = withoutAiSecrets(record);
    if (JSON.stringify(data).length > 3000000) throw new Error('AI 记录过大，未保存。请导出后继续。');
    await (await this.db()).put('records', { key: `${kind}:${record.id}`, id: record.id, kind, updatedAt: Date.now(), version: 1, data });
  }
  async get<T>(kind: AiRecordKind, id: string): Promise<T | null> {
    assertKind(kind); assertId(id);
    const record = await (await this.db()).get('records', `${kind}:${id}`);
    return record && record.version === 1 && record.kind === kind ? withoutAiSecrets(record.data) as T : null;
  }
  async list<T>(kind: AiRecordKind): Promise<T[]> {
    assertKind(kind);
    const records = await (await this.db()).getAllFromIndex('records', 'kind', kind);
    return records.filter(r => r.version === 1).sort((a, b) => b.updatedAt - a.updatedAt).map(r => withoutAiSecrets(r.data) as T);
  }
  async delete(kind: AiRecordKind, id: string): Promise<void> { assertKind(kind); assertId(id); await (await this.db()).delete('records', `${kind}:${id}`); }
  async clear(): Promise<void> { await (await this.db()).clear('records'); }
}
export const aiWorkspaceRepository = new AiWorkspaceRepository();
