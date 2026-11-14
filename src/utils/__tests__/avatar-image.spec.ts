import { describe, expect, it, vi } from 'vitest';
import { compressAvatar } from '@/utils/avatarImage';

class ImageMock {
  naturalWidth = 800;
  naturalHeight = 400;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    this.onload?.();
  }
}

describe('avatar compression', () => {
  it('rejects files that are not a supported raster image or are too large', async () => {
    await expect(compressAvatar(new Blob(['gif'], { type: 'image/gif' }))).rejects.toThrow('JPG');
    await expect(compressAvatar(new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: 'image/png' }))).rejects.toThrow('8MB');
  });

  it('stores a square jpeg data URL instead of the original file', async () => {
    vi.stubGlobal('Image', ImageMock);
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:avatar', revokeObjectURL: () => undefined });
    const drawImage = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement;
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toDataURL: () => 'data:image/jpeg;base64,c21hbGw=',
      } as unknown as HTMLCanvasElement;
    });

    const result = await compressAvatar(new Blob(['png'], { type: 'image/png' }));

    expect(result).toBe('data:image/jpeg;base64,c21hbGw=');
    expect(drawImage).toHaveBeenCalledWith(expect.any(ImageMock), 200, 0, 400, 400, 0, 0, 256, 256);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
