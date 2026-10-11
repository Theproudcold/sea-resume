import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createImageArchive, getA4ImagePageSlices, sanitizeImageFilename } from '@/utils/export-image';

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
