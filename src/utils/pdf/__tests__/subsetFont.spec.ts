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
    expect(new Set(characters).size).toBe(characters.length);
  });

  it('drops unused CJK glyphs from the full face', async () => {
    const source = await readFile(resolve(process.cwd(), 'src/assets/fonts/noto-sans-sc/NotoSansSC-Regular.otf'));
    const subset = await subsetOpenTypeFont(source, collectResumeCharacters(templateDemoData));
    expect(subset.byteLength).toBeLessThan(source.byteLength / 10);
    expect(subset.byteLength).toBeGreaterThan(1000);
  });
});
