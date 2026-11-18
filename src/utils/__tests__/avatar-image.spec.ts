import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AVATAR_EDGE,
  AVATAR_MAX_BYTES,
  defaultAvatarCrop,
  loadAvatarImage,
  releaseAvatar,
  renderAvatarCrop,
} from '@/utils/avatarImage';

/** 解码结果可控的 Image 替身：src 一赋值就触发对应的回调。 */
function stubImage(naturalWidth = 800, naturalHeight = 400, fail = false) {
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
  return ImageMock;
}

function stubUrls() {
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:avatar', revokeObjectURL });
  return { revokeObjectURL };
}

function stubCanvas() {  const drawImage = vi.fn();
  const toDataURL = vi.fn(() => 'data:image/jpeg;base64,c21hbGw=');
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL,
    } as unknown as HTMLCanvasElement;
  });
  return { drawImage, toDataURL };
}

/** drawImage 只要求可绘制的源，测试替身按 CanvasImageSource 传入。 */
function fakeImage(ImageMock: new () => unknown): CanvasImageSource {
  return new ImageMock() as unknown as CanvasImageSource;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('avatar decoding', () => {
  it('rejects files that are not a supported raster image or are too large', async () => {
    await expect(loadAvatarImage(new Blob(['gif'], { type: 'image/gif' }))).rejects.toThrow('JPG');
    await expect(loadAvatarImage(new Blob([new Uint8Array(AVATAR_MAX_BYTES + 1)], { type: 'image/png' }))).rejects.toThrow('8MB');
  });

  it('exposes the decoded size and a preview URL for the cropper', async () => {
    stubImage(1200, 1600);
    const { revokeObjectURL } = stubUrls();

    const source = await loadAvatarImage(new Blob(['png'], { type: 'image/png' }));

    expect(source.width).toBe(1200);
    expect(source.height).toBe(1600);
    expect(source.objectUrl).toBe('blob:avatar');
    expect(revokeObjectURL).not.toHaveBeenCalled();

    releaseAvatar(source);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:avatar');
  });

  it('revokes the preview URL when decoding fails instead of leaking it', async () => {
    stubImage(0, 0, true);
    const { revokeObjectURL } = stubUrls();

    await expect(loadAvatarImage(new Blob(['png'], { type: 'image/png' }))).rejects.toThrow('无法读取');

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:avatar');
  });
});

describe('avatar framing', () => {
  it('centers the largest square for legacy callers', () => {
    expect(defaultAvatarCrop(800, 400)).toEqual({ x: 200, y: 0, size: 400 });
    expect(defaultAvatarCrop(400, 800)).toEqual({ x: 0, y: 200, size: 400 });
    expect(defaultAvatarCrop(600, 600)).toEqual({ x: 0, y: 0, size: 600 });
  });

  it('renders the requested square region instead of the center one', () => {
    const ImageMock = stubImage();
    const { drawImage } = stubCanvas();

    renderAvatarCrop(fakeImage(ImageMock), { x: 120, y: 40, size: 200 });

    expect(drawImage).toHaveBeenCalledWith(expect.any(ImageMock), 120, 40, 200, 200, 0, 0, 200, 200);
  });

  it('caps the output edge without cropping smaller sources', () => {
    const ImageMock = stubImage();
    const { drawImage } = stubCanvas();

    renderAvatarCrop(fakeImage(ImageMock), { x: 0, y: 0, size: 4000 });
    expect(drawImage).toHaveBeenLastCalledWith(expect.any(ImageMock), 0, 0, 4000, 4000, 0, 0, AVATAR_EDGE, AVATAR_EDGE);

    renderAvatarCrop(fakeImage(ImageMock), { x: 0, y: 0, size: 120 });
    expect(drawImage).toHaveBeenLastCalledWith(expect.any(ImageMock), 0, 0, 120, 120, 0, 0, 120, 120);
  });
});

describe('avatar compression', () => {
  it('turns the legacy center framing into a square jpeg data URL instead of the original file', async () => {
    stubImage(800, 400);
    const { revokeObjectURL } = stubUrls();
    const { drawImage } = stubCanvas();

    const source = await loadAvatarImage(new Blob(['png'], { type: 'image/png' }));
    const result = renderAvatarCrop(source.image, defaultAvatarCrop(source.width, source.height));
    releaseAvatar(source);

    expect(result).toBe('data:image/jpeg;base64,c21hbGw=');
    // 历史行为：短边 400，横向居中偏移 200。
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 200, 0, 400, 400, 0, 0, 256, 256);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:avatar');
  });
});
