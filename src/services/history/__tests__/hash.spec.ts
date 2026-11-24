import { describe, expect, it } from 'vitest';
import { createDefaultResumeData } from '@/utils/resumeData';
import {
  commitHash,
  materializeSnapshot,
  resumeContentHash,
  sha256Hex,
  stableStringify,
  toResumeSnapshot,
} from '../hash';

describe('版本历史哈希', () => {
  it('matches the standard SHA-256 vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('中文')).toBe('72726d8818f693066ceb69afa364218b692e62ea92b385782363780f47529c21');
    expect(sha256Hex('a'.repeat(55))).toBe('9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318');
    expect(sha256Hex('a'.repeat(56))).toBe('b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a');
    expect(sha256Hex('a'.repeat(64))).toBe('ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
    expect(sha256Hex('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });

  it('stable stringify sorts object keys but keeps array order', () => {
    expect(stableStringify({ b: 1, a: [{ y: 2, x: 1 }] })).toBe('{"a":[{"x":1,"y":2}],"b":1}');
    expect(stableStringify([2, 1])).toBe('[2,1]');
  });

  it('ignores identity, timestamps, avatar and equivalent defaults', () => {
    const base = createDefaultResumeData();
    base.basic.name = '张三';
    base.experiences = [{
      id: 'e1', company: 'Acme', position: '前端', startDate: '2022-01', endDate: 'present',
      description: '<p>负责前端</p>', visible: true,
    }];
    base.basic.avatar = 'data:image/png;base64,AAAA';
    const first = toResumeSnapshot(base);
    const second = toResumeSnapshot({
      ...JSON.parse(JSON.stringify(base)),
      id: 'another-id',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2030-01-01T00:00:00.000Z',
    });
    expect(second.snapshot).toEqual(first.snapshot);
    expect(second.avatar).toBe(first.avatar);
    expect('avatar' in second.snapshot.basic).toBe(false);
    expect((second.snapshot.experiences[0] as unknown as Record<string, unknown>).visible).toBeUndefined();
    expect(resumeContentHash(first.snapshot, 'avatar-a')).not.toBe(resumeContentHash(first.snapshot, 'avatar-b'));
  });

  it('changes the content hash when visible content changes', () => {
    const base = createDefaultResumeData();
    const before = toResumeSnapshot(base).snapshot;
    const changed = JSON.parse(JSON.stringify(base));
    changed.basic.name = '李四';
    const after = toResumeSnapshot(changed).snapshot;
    expect(resumeContentHash(before)).not.toBe(resumeContentHash(after));
  });

  it('derives commit ids from the parent so restored identical content is still a new commit', () => {
    const content = resumeContentHash(toResumeSnapshot(createDefaultResumeData()).snapshot);
    const createdAt = '2026-01-01T00:00:00.000Z';
    const first = commitHash({ parentHash: null, contentHash: content, createdAt, message: '初始版本' });
    const second = commitHash({ parentHash: first, contentHash: content, createdAt, message: '恢复' });
    expect(second).not.toBe(first);
  });

  it('materializes a snapshot with the current identity and clears a removed avatar', () => {
    const current = createDefaultResumeData();
    current.id = 'current-id';
    current.createdAt = '2020-01-01T00:00:00.000Z';
    current.basic.avatar = 'data:image/png;base64,AAAA';
    const snapshot = toResumeSnapshot(current).snapshot;
    const restored = materializeSnapshot(snapshot, current, null);
    expect(restored.id).toBe('current-id');
    expect(restored.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(restored.basic.avatar).toBeUndefined();
    expect(restored.basic.name).toBe(current.basic.name);
  });
});
