import type { ResumeData } from '@/types/resume';
import type { ResumeSnapshot, StoredAvatar } from '@/types/history';
import { normalizeResumeData } from '@/utils/resumeData';

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const rotr = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));

/**
 * 同步 SHA-256。
 *
 * 版本历史和保存链路是同步触发的；用 Web Crypto 会引入异步时序和测试环境差异。
 * 这里只处理 UTF-8 字符串，实现足够小，也便于在 Node / jsdom 下得到一致结果。
 */
export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.floor((bytes.length + 8) / 64) * 64 + 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index++) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index++) {
      const previous15 = words[index - 15]!;
      const previous2 = words[index - 2]!;
      const sigma0 = rotr(previous15, 7) ^ rotr(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotr(previous2, 17) ^ rotr(previous2, 19) ^ (previous2 >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }

    let a = hash[0]!;
    let b = hash[1]!;
    let c = hash[2]!;
    let d = hash[3]!;
    let e = hash[4]!;
    let f = hash[5]!;
    let g = hash[6]!;
    let h = hash[7]!;

    for (let index = 0; index < 64; index++) {
      const sigma1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sigma1 + choice + SHA256_K[index]! + words[index]!) >>> 0;
      const sigma0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }

  return Array.from(hash, (value) => value.toString(16).padStart(8, '0')).join('');
}

/** 递归排序对象键；数组顺序保留。用于“同一内容永远得到同一哈希”。 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

type MutableRecord = Record<string, unknown>;

function dropDefaultVisible(record: MutableRecord): void {
  if (record.visible === true) delete record.visible;
}

/**
 * 把等价状态收敛成同一种写法：显示状态缺省就是显示，圆形是头像缺省形状。
 * 这样“把 true 删掉”不会被当成一次内容变化。
 */
function canonicalizeSnapshot(snapshot: ResumeSnapshot): ResumeSnapshot {
  const basic = snapshot.basic as MutableRecord;
  if (basic.avatarShape === 'circle') delete basic.avatarShape;
  if (basic.showAge === false) delete basic.showAge;
  if (basic.showExperienceYears === false) delete basic.showExperienceYears;

  const cleanRecords = (records: unknown): void => {
    if (!Array.isArray(records)) return;
    records.forEach((entry) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) dropDefaultVisible(entry as MutableRecord);
    });
  };
  cleanRecords(snapshot.experiences);
  cleanRecords(snapshot.education);
  cleanRecords(snapshot.skills);
  cleanRecords(snapshot.projects);
  snapshot.customBlocks.forEach((block) => {
    if (Array.isArray(block.content)) cleanRecords(block.content);
  });
  if (Array.isArray(snapshot.hiddenSections) && snapshot.hiddenSections.length === 0) {
    delete snapshot.hiddenSections;
  }
  return snapshot;
}

export interface SnapshotBuild {
  snapshot: ResumeSnapshot;
  avatar?: string;
}

/** 从活草稿提取可提交的正文快照；头像单独返回。 */
export function toResumeSnapshot(data: ResumeData): SnapshotBuild {
  const normalized = normalizeResumeData(data);
  const cloned = JSON.parse(JSON.stringify(normalized)) as ResumeData;
  const avatar = cloned.basic.avatar;
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, basic, ...rest } = cloned;
  const { avatar: _avatar, ...basicRest } = basic;
  return {
    snapshot: canonicalizeSnapshot({ ...rest, basic: basicRest } as ResumeSnapshot),
    ...(avatar ? { avatar } : {}),
  };
}

export function buildAvatarRecord(dataUrl: string): StoredAvatar {
  return {
    hash: sha256Hex(dataUrl),
    dataUrl,
    bytes: new TextEncoder().encode(dataUrl).length,
  };
}

/** 正文内容哈希；头像参与哈希，但图片本身不进快照。 */
export function resumeContentHash(snapshot: ResumeSnapshot, avatarHash?: string): string {
  return sha256Hex(stableStringify({ snapshot, avatarHash: avatarHash ?? null }));
}

/** 提交 ID 包含父提交，允许“恢复后的内容”与历史内容相同但仍是新提交。 */
export function commitHash(input: {
  parentHash: string | null;
  contentHash: string;
  createdAt: string;
  message: string;
}): string {
  return sha256Hex([
    input.parentHash ?? 'root',
    input.contentHash,
    input.createdAt,
    input.message,
  ].join('\n'));
}

export function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

/** 快照转成可交给现有 diff / 预览逻辑的完整简历数据。 */
export function snapshotToResumeData(
  snapshot: ResumeSnapshot,
  identity: { id?: string; createdAt?: string; updatedAt?: string } = {},
): ResumeData {
  return normalizeResumeData({
    ...JSON.parse(JSON.stringify(snapshot)),
    id: identity.id ?? 'history-snapshot',
    createdAt: identity.createdAt ?? new Date().toISOString(),
    updatedAt: identity.updatedAt ?? new Date().toISOString(),
  });
}

/**
 * 把快照写回当前简历。恢复必须保留当前简历的身份与创建时间；
 * `avatar` 为 null 表示该版本本来就没有头像，undefined 表示头像 blob 丢失、沿用当前头像。
 */
export function materializeSnapshot(
  snapshot: ResumeSnapshot,
  current: Pick<ResumeData, 'id' | 'createdAt' | 'basic'>,
  avatar: string | null | undefined,
): ResumeData {
  const basic = { ...snapshot.basic } as ResumeSnapshot['basic'] & { avatar?: string };
  const resolvedAvatar = avatar === undefined ? current.basic.avatar : avatar;
  if (resolvedAvatar) basic.avatar = resolvedAvatar;
  else delete basic.avatar;
  return normalizeResumeData({
    ...JSON.parse(JSON.stringify(snapshot)),
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
    basic,
  });
}

export function estimateJsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
