import type { ResumeData } from '@/types/resume';

interface GlyphMetric { advance: number; bearing: number }
type FontkitModule = typeof import('fontkit');

function collectStrings(value: unknown, parts: string[]): void {
  if (typeof value === 'string') {
    parts.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, parts));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, parts));
  }
}

const PDF_CHROME = '个人简介联系方式工作经验教育经历项目经历专业技能技术架构至今';

/** Characters the searchable PDF can actually draw, plus ASCII so dates and links stay intact. */
export function collectResumeCharacters(data: ResumeData): string {
  const parts: string[] = [PDF_CHROME];
  collectStrings(data, parts);
  const seen = new Set<number>();
  let text = '';
  const push = (codePoint: number) => {
    if (codePoint < 32 || seen.has(codePoint)) return;
    seen.add(codePoint);
    text += String.fromCodePoint(codePoint);
  };
  for (let codePoint = 32; codePoint < 127; codePoint += 1) push(codePoint);
  for (const part of parts) {
    for (const char of part) push(char.codePointAt(0) ?? 0);
  }
  return text;
}

function u16(value: number): Uint8Array {
  return Uint8Array.of((value >> 8) & 0xff, value & 0xff);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function tag(value: string): Uint8Array {
  return Uint8Array.from(value.slice(0, 4).padEnd(4, '\0'), (char) => char.charCodeAt(0));
}

function checksum(bytes: Uint8Array): number {
  let sum = 0;
  for (let offset = 0; offset < bytes.length; offset += 4) {
    sum = (sum + (
      ((bytes[offset] ?? 0) << 24)
      | ((bytes[offset + 1] ?? 0) << 16)
      | ((bytes[offset + 2] ?? 0) << 8)
      | (bytes[offset + 3] ?? 0)
    )) >>> 0;
  }
  return sum;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** fontkit's lazy hmtx array does not materialize records, so read the source table directly. */
function readSourceMetrics(fontBytes: Uint8Array): DataView | null {
  if (fontBytes.length < 12) return null;
  const view = new DataView(fontBytes.buffer, fontBytes.byteOffset, fontBytes.byteLength);
  const count = view.getUint16(4);
  for (let index = 0; index < count; index += 1) {
    const base = 12 + index * 16;
    if (base + 16 > fontBytes.length) return null;
    const name = String.fromCharCode(fontBytes[base] ?? 0, fontBytes[base + 1] ?? 0, fontBytes[base + 2] ?? 0, fontBytes[base + 3] ?? 0);
    if (name !== 'hmtx') continue;
    const offset = view.getUint32(base + 8);
    const length = view.getUint32(base + 12);
    if (offset + length > fontBytes.length) return null;
    return new DataView(fontBytes.buffer, fontBytes.byteOffset + offset, length);
  }
  return null;
}

function metricForGlyph(table: DataView | null, glyphId: number): GlyphMetric {
  const offset = glyphId * 4;
  if (!table || offset + 4 > table.byteLength) return { advance: 1000, bearing: 0 };
  return { advance: table.getUint16(offset), bearing: table.getInt16(offset + 2) };
}

function hmtxTable(metrics: GlyphMetric[]): Uint8Array {
  const bytes = new Uint8Array(metrics.length * 4);
  metrics.forEach((metric, index) => {
    const offset = index * 4;
    const advance = Math.max(0, Math.min(0xffff, Math.round(metric.advance)));
    const bearing = Math.max(-32768, Math.min(32767, Math.round(metric.bearing)));
    bytes[offset] = (advance >> 8) & 0xff;
    bytes[offset + 1] = advance & 0xff;
    bytes[offset + 2] = (bearing >> 8) & 0xff;
    bytes[offset + 3] = bearing & 0xff;
  });
  return bytes;
}

function i16(value: number): Uint8Array {
  return u16(value & 0xffff);
}

function headTable(): Uint8Array {
  return concat([
    u32(0x00010000), u32(0x00010000), u32(0), u32(0x5f0f3cf5), u16(3), u16(1000),
    u32(0), u32(0), u32(0), u32(0),
    i16(-1002), i16(-1048), i16(2928), i16(1808),
    u16(0), u16(3), i16(2), i16(0), i16(0),
  ]);
}

function maxpTable(numGlyphs: number): Uint8Array {
  return concat([u32(0x00005000), u16(numGlyphs)]);
}

/** Format 4 cmap limited to the BMP characters this subset actually contains. */
function cmapTable(mappings: Array<[number, number]>): Uint8Array {
  const pairs = mappings
    .filter(([codePoint]) => codePoint > 0 && codePoint <= 0xffff)
    .sort((left, right) => left[0] - right[0]);
  const segments: Array<{ start: number; end: number; startGlyph: number }> = [];
  for (const [codePoint, glyphId] of pairs) {
    const last = segments[segments.length - 1];
    if (last && codePoint === last.end + 1 && glyphId === last.startGlyph + (last.end - last.start + 1)) {
      last.end = codePoint;
    } else {
      segments.push({ start: codePoint, end: codePoint, startGlyph: glyphId });
    }
  }
  segments.push({ start: 0xffff, end: 0xffff, startGlyph: 0 });
  const segmentCount = segments.length;
  const searchRange = 2 ** Math.floor(Math.log2(segmentCount)) * 2;
  const entrySelector = Math.log2(searchRange / 2);
  const rangeShift = segmentCount * 2 - searchRange;
  const body = concat([
    u16(4), u16(0), u16(0), u16(segmentCount * 2), u16(searchRange), u16(entrySelector), u16(rangeShift),
    ...segments.map((segment) => u16(segment.end)), u16(0),
    ...segments.map((segment) => u16(segment.start)),
    ...segments.map((segment) => i16(segment.startGlyph - segment.start)),
    ...segments.map(() => u16(0)),
  ]);
  const length = body.length;
  return concat([
    u16(0), u16(1), u16(3), u16(1), u32(12),
    u16(4), u16(length), u16(0), body.slice(6),
  ]);
}

function postTable(): Uint8Array {
  return concat([
    u32(0x00030000), u32(0), i16(-125), i16(50),
    u32(0), u32(0), u32(0), u32(0), u32(0),
  ]);
}

function hheaTable(numberOfMetrics: number): Uint8Array {
  const bytes = new Uint8Array(36);
  bytes.set(u32(0x00010000));
  bytes.set(u16(800), 4);
  bytes.set(u16((-200) & 0xffff), 6);
  bytes.set(u16(200), 8);
  bytes.set(u16(1000), 10);
  bytes.set(u16(1), 18);
  bytes.set(u16(numberOfMetrics), 34);
  return bytes;
}

/**
 * fontkit 2 emits a bare CFF program. pdfmake parses the virtual file as a font first,
 * so the program has to travel inside an OpenType container that also carries glyph widths.
 */
export function wrapCffAsOpenType(cff: Uint8Array, metrics: GlyphMetric[], characterMap: Array<[number, number]>): Uint8Array {
  const tables = [
    { name: 'CFF ', data: cff },
    { name: 'cmap', data: cmapTable(characterMap) },
    { name: 'head', data: headTable() },
    { name: 'hhea', data: hheaTable(metrics.length) },
    { name: 'hmtx', data: hmtxTable(metrics) },
    { name: 'maxp', data: maxpTable(metrics.length) },
    { name: 'post', data: postTable() },
  ].map((table) => ({
    ...table,
    padded: concat([table.data, new Uint8Array((4 - (table.data.length % 4)) % 4)]),
  }));
  const count = tables.length;
  let offset = 12 + count * 16;
  const records = tables.map((table) => {
    const record = concat([tag(table.name), u32(checksum(table.padded)), u32(offset), u32(table.data.length)]);
    offset += table.padded.length;
    return record;
  });
  const searchRange = 2 ** Math.floor(Math.log2(count)) * 16;
  const directory = concat([
    tag('OTTO'), u16(count), u16(searchRange), u16(Math.log2(searchRange / 16)), u16(count * 16 - searchRange),
    ...records,
  ]);
  return concat([directory, ...tables.map((table) => table.padded)]);
}

/** Keep only the glyphs this resume needs. The source files are full CJK faces (~8MB each). */
export async function subsetOpenTypeFont(bytes: Uint8Array, text: string): Promise<Uint8Array> {
  const fontkit = await import('fontkit') as FontkitModule;
  const font = fontkit.create(bytes);
  const subset = font.createSubset();
  const characterMap: Array<[number, number]> = [];
  const seen = new Set<number>();
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (!codePoint || seen.has(codePoint)) continue;
    seen.add(codePoint);
    const sourceGlyph = font.glyphForCodePoint(codePoint).id;
    characterMap.push([codePoint, subset.includeGlyph(sourceGlyph)]);
  }
  const sourceMetrics = readSourceMetrics(bytes);
  const metrics = subset.glyphs.map((glyphId) => metricForGlyph(sourceMetrics, glyphId));
  return wrapCffAsOpenType(subset.encode(), metrics, characterMap);
}
