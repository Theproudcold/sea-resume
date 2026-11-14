import { unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageArchive, exportToImage, getA4ImagePageSlices, sanitizeImageFilename } from '@/utils/export-image';

const mocks = vi.hoisted(() => ({ html2canvas: vi.fn() }));
vi.mock('html2canvas', () => ({ default: mocks.html2canvas }));

describe('A4 image export pagination', () => {
  it('keeps a single-page resume as one full A4 image', () => {
    expect(getA4ImagePageSlices(210, 297)).toEqual([
      { sourceY: 0, sourceHeight: 297, outputHeight: 297 },
    ]);
  });

  it('splits long content into A4 pages and pads the final page', () => {
    expect(getA4ImagePageSlices(210, 650)).toEqual([
      { sourceY: 0, sourceHeight: 297, outputHeight: 297 },
      { sourceY: 297, sourceHeight: 297, outputHeight: 297 },
      { sourceY: 594, sourceHeight: 56, outputHeight: 297 },
    ]);
  });

  it('returns no pages for invalid canvas dimensions', () => {
    expect(getA4ImagePageSlices(0, 297)).toEqual([]);
    expect(getA4ImagePageSlices(210, Number.NaN)).toEqual([]);
  });
});

describe('image page archive', () => {
  it('creates a ZIP containing every page image', () => {
    const archive = createImageArchive({
      'resume-1.png': new Uint8Array([1, 2, 3, 4]),
      'resume-2.png': new Uint8Array([5, 6, 7]),
    });
    const files = unzipSync(archive);

    expect(Object.keys(files).sort()).toEqual(['resume-1.png', 'resume-2.png']);
    expect(files['resume-1.png']).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(files['resume-2.png']).toEqual(new Uint8Array([5, 6, 7]));
  });
  it('sanitizes path traversal in archive entry names', () => {
    const archive = createImageArchive({ '../../outside.png': new Uint8Array([1, 2, 3]) });
    const files = unzipSync(archive);
    expect(Object.keys(files)).toEqual(['_.._outside.png']);
    expect(sanitizeImageFilename('..')).toBe('resume');
  });

});

describe('image capture color normalization', () => {
  beforeEach(() => {
    mocks.html2canvas.mockReset();
    const renderingContext = { fillStyle: '#fff', fillRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(renderingContext);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:image'), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('normalizes modern colors before capturing the resume canvas', async () => {
    const preview = document.createElement('div');
    preview.id = 'resume-canvas';
    document.body.appendChild(preview);
    mocks.html2canvas.mockResolvedValue({ width: 794, height: 500 } as HTMLCanvasElement);

    await exportToImage('resume-canvas', 'resume', 'png');

    const options = mocks.html2canvas.mock.calls[0]?.[1] as {
      onclone: (clonedDocument: Document, clonedElement: HTMLElement) => void;
    };
    expect(typeof options.onclone).toBe('function');
    const clonedPreview = document.createElement('div');
    clonedPreview.style.setProperty('color', 'oklch(0.5 0 0)');
    options.onclone(document, clonedPreview);
    expect(clonedPreview.style.getPropertyValue('color')).toBe('rgb(99, 99, 99)');
  });
});
