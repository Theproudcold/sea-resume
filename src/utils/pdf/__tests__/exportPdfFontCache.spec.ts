// @vitest-environment node
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { clear() {} } });
}
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` factories run before module-level `const` initialisation, so all
// mutable state used by the factory has to live in `vi.hoisted`.
const mocks = vi.hoisted(() => ({
  calls: 0,
  realSubset: undefined as Promise<Uint8Array> | undefined,
}));

/**
 * Count how often real subsetting is requested while doing the expensive work
 * once: the cache assertions only need the invocation count, and repeating a
 * full ~8MB CJK subset four times would add a multi-second CPU burst to the suite.
 */
vi.mock('@/utils/pdf/subsetFont', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/pdf/subsetFont')>();
  return {
    ...actual,
    subsetOpenTypeFont: (bytes: Uint8Array, text: string) => {
      mocks.calls += 1;
      mocks.realSubset ??= actual.subsetOpenTypeFont(bytes, text);
      return mocks.realSubset;
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
    mocks.calls = 0;
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
    const first = await createResumePdfBlob(data);
    expect(mocks.calls).toBe(2);
    expect(first.size).toBeGreaterThan(1000);

    // Same text: both subsets come from the cache.
    await createResumePdfBlob(structuredClone(data));
    expect(mocks.calls).toBe(2);

    // A character that is not in the demo data must invalidate the cache.
    const changed = structuredClone(data);
    changed.basic.name = '龘';
    const rerendered = await createResumePdfBlob(changed);
    expect(mocks.calls).toBe(4);
    expect(rerendered.size).toBeGreaterThan(1000);
  });
});
