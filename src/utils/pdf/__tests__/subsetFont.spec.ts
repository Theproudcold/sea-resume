import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { templateDemoData } from '@/data/template-demo';
import { collectResumeCharacters, subsetOpenTypeFont } from '@/utils/pdf/subsetFont';

describe('searchable PDF font subset', () => {
  it('collects resume text and the labels pdfmake adds itself', () => {
    const characters = collectResumeCharacters(templateDemoData);
    expect(characters).toContain('李');
    expect(characters).toContain('个人简介');
    expect(characters).toContain('A');
    for (const chromeChar of ['电', '话', '邮', '箱', '所', '在', '地', '：', '·']) {
      expect(characters).toContain(chromeChar);
    }
    expect(new Set(characters).size).toBe(characters.length);
  });

  it('drops unused CJK glyphs from the full face', async () => {
    const source = await readFile(resolve(process.cwd(), 'src/assets/fonts/noto-sans-sc/NotoSansSC-Regular.otf'));
    const subset = await subsetOpenTypeFont(source, collectResumeCharacters(templateDemoData));
    expect(subset.byteLength).toBeLessThan(source.byteLength / 10);
    expect(subset.byteLength).toBeGreaterThan(1000);
    const view = new DataView(subset.buffer, subset.byteOffset, subset.byteLength);
    const tableCount = view.getUint16(4);
    let cmapOffset = -1;
    let cmapLength = 0;
    for (let index = 0; index < tableCount; index += 1) {
      const record = 12 + index * 16;
      const name = String.fromCharCode(subset[record] ?? 0, subset[record + 1] ?? 0, subset[record + 2] ?? 0, subset[record + 3] ?? 0);
      if (name !== 'cmap') continue;
      cmapOffset = view.getUint32(record + 8);
      cmapLength = view.getUint32(record + 12);
    }
    expect(cmapOffset).toBeGreaterThan(0);
    const subtableLength = view.getUint16(cmapOffset + 14);
    expect(12 + subtableLength).toBeLessThanOrEqual(cmapLength);
  });
});
