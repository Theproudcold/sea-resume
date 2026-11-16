// @vitest-environment node
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { clear() {} } });
}
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const subsetCalls = vi.hoisted(() => ({ count: 0 }));

// Count real subsetting work while still producing a valid font for pdfmake.
vi.mock('@/utils/pdf/subsetFont', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/pdf/subsetFont')>();
  return {
    ...actual,
    subsetOpenTypeFont: (bytes: Uint8Array, text: string) => {
      subsetCalls.count += 1;
      return actual.subsetOpenTypeFont(bytes, text);
    },
  };
});

import { templateDemoData } from '@/data/template-demo';
import { createResumePdfBlob } from '@/utils/export-pdf';
import type { ResumeData } from '@/types/resume';

async function fontResponse(fileName: string): Promise<Response> {
  const file = resolve(process.cwd(), 'src/assets/fonts/noto-sans-sc', fileName);
  return new Response(await readFile(file), { status: 200, headers: { 'content-type': 'font/otf' } });
}

describe('searchable PDF font subset cache', () => {
  beforeEach(() => {
    subsetCalls.count = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('NotoSansSC-Regular')) return fontResponse('NotoSansSC-Regular.otf');
      if (url.includes('NotoSansSC-Bold')) return fontResponse('NotoSansSC-Bold.otf');
      throw new Error(`Unexpected PDF asset request: ${url}`);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('reuses the subset for identical resume text and recomputes it when the text changes', async () => {
    const data: ResumeData = structuredClone(templateDemoData);

    // One regular and one bold subset for the first export.
    await createResumePdfBlob(data);
    expect(subsetCalls.count).toBe(2);

    // Same text: both subsets come from the cache.
    await createResumePdfBlob(structuredClone(data));
    expect(subsetCalls.count).toBe(2);

    // A character that is not in the demo data must invalidate the cache.
    const changed = structuredClone(data);
    changed.basic.name = '龘';
    await createResumePdfBlob(changed);
    expect(subsetCalls.count).toBe(4);
  });
});
