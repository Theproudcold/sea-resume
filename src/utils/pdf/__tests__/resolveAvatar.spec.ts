import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { createResumePdfDefinition } from '@/utils/pdf/createResumePdfDefinition';
import { maskAvatarToCircle, resolveResumeAvatarForShape } from '@/utils/pdf/resolveAvatar';
import { createDefaultResumeData } from '@/utils/resumeData';

const SOURCE = 'data:image/jpeg;base64,YXZhdGFy';
const MASKED = 'data:image/png;base64,bWFza2Vk';

/** 环境相关的能力探测有进程级缓存，按用例取新实例，避免上一个用例的替身影响下一个。 */
async function freshModule() {
  vi.resetModules();
  return import('@/utils/pdf/resolveAvatar');
}

function stubImageDecoder(naturalWidth = 256, naturalHeight = 256, fail = false) {
  class ImageMock {
    naturalWidth = naturalWidth;
    naturalHeight = naturalHeight;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      if (fail) this.onerror?.();
      else this.onload?.();
    }
  }
  vi.stubGlobal('Image', ImageMock);
}

function stubCanvasRaster() {
  const arc = vi.fn();
  const clip = vi.fn();
  const drawImage = vi.fn();
  const toDataURL = vi.fn(() => MASKED);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
    return {
      width: 0,
      height: 0,
      getContext: () => ({ beginPath: vi.fn(), arc, clip, drawImage }),
      toDataURL,
    } as unknown as HTMLCanvasElement;
  });
  return { arc, clip, drawImage, toDataURL };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PDF avatar shape', () => {
  it('embeds the plain square photo for the square option and nothing without a photo', async () => {
    const { resolveResumeAvatarForShape: resolve } = await freshModule();

    expect(await resolve(SOURCE, 'square')).toBe(SOURCE);
    expect(await resolve(undefined, 'square')).toBeUndefined();
  });

  it('applies the circle default to resumes that never stored a shape', async () => {
    const { resolveResumeAvatarForShape: resolve } = await freshModule();
    stubImageDecoder();
    stubCanvasRaster();

    expect(await resolve(SOURCE, undefined)).toBe(MASKED);
  });

  it('clips a centered square through a circular path and embeds the transparent-corner PNG', async () => {
    const { maskAvatarToCircle } = await freshModule();
    stubImageDecoder(300, 500);
    const { arc, clip, drawImage, toDataURL } = stubCanvasRaster();

    expect(await maskAvatarToCircle(SOURCE)).toBe(MASKED);

    expect(arc).toHaveBeenCalledWith(150, 150, 150, 0, Math.PI * 2);
    expect(clip).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 100, 300, 300, 0, 0, 300, 300);
    expect(toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('degrades to the unmasked square when the runtime has no real canvas', async () => {
    const { maskAvatarToCircle } = await freshModule();

    // jsdom 的 getContext 返回 null。这里必须直接返回原图：jsdom 的 Image 对 data URL
    // 既不触发 onload 也不触发 onerror，一旦进入解码就会永久挂起，整个导出都卡住。
    await expect(maskAvatarToCircle(SOURCE)).resolves.toBe(SOURCE);
  });

  it('falls back to the unmasked square when the image cannot be decoded', async () => {
    const { maskAvatarToCircle } = await freshModule();
    stubCanvasRaster();
    stubImageDecoder(256, 256, true);

    await expect(maskAvatarToCircle(SOURCE)).resolves.toBe(SOURCE);
  });
});

describe('PDF avatar box', () => {
  function headerImage(definition: TDocumentDefinitions): { image?: string; fit?: number[] } {
    const content = definition.content as unknown as Array<{ columns?: Array<{ image?: string; fit?: number[] }> }> | undefined;
    return content?.[0]?.columns?.find((column) => column.image) ?? {};
  }

  it('uses a 1:1 slot so the square resource is never letterboxed', () => {
    const data = createDefaultResumeData();
    data.basic.name = '张三';

    expect(headerImage(createResumePdfDefinition(data, MASKED))).toMatchObject({ image: MASKED, fit: [58, 58] });
    expect(headerImage(createResumePdfDefinition(data, undefined))).toEqual({});
  });
});
