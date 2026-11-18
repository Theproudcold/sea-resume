import { describe, expect, it } from 'vitest';
import { defaultAvatarCrop } from '@/utils/avatarImage';
import {
  MAX_CROP_ZOOM,
  createCropView,
  cropZoomPercent,
  minCropScale,
  panCropView,
  viewToCrop,
  zoomCropView,
} from '@/utils/avatarCropGeometry';

const VIEWPORT = 260;

describe('crop view initialization', () => {
  it('starts at the legacy center crop for every aspect ratio', () => {
    for (const [width, height] of [[800, 400], [400, 800], [600, 600], [3000, 2000], [120, 4000]]) {
      const crop = viewToCrop(createCropView(VIEWPORT, width!, height!));
      expect(crop, `${width}×${height}`).toEqual(defaultAvatarCrop(width!, height!));
    }
  });

  it('never lets the photo be smaller than the viewport', () => {
    const view = createCropView(VIEWPORT, 400, 400);
    expect(minCropScale(VIEWPORT, 400, 400)).toBeCloseTo(VIEWPORT / 400);
    expect(view.scale).toBeGreaterThanOrEqual(minCropScale(VIEWPORT, 400, 400));
    expect(view.offsetX).toBeLessThanOrEqual(0);
    expect(view.offsetY).toBeLessThanOrEqual(0);
  });

  it('survives an unmeasured viewport instead of producing NaN or a 1px crop', () => {
    const view = createCropView(0, 800, 400);
    expect(view.scale).toBe(1);
    expect(Number.isFinite(view.offsetX) && Number.isFinite(view.offsetY)).toBe(true);
    expect(viewToCrop(view)).toEqual(defaultAvatarCrop(800, 400));
  });
});

describe('crop panning', () => {
  it('stops at the edges instead of dragging the photo off the viewport', () => {
    const start = createCropView(VIEWPORT, 800, 400);

    expect(viewToCrop(panCropView(start, 10_000, 0)).x).toBe(0);
    expect(viewToCrop(panCropView(start, -10_000, 0)).x).toBe(800 - 400);
    // 高度方向在初始缩放下刚好贴合，没有可移动余量。
    expect(viewToCrop(panCropView(start, 0, 500)).y).toBe(0);
    expect(panCropView(start, 0, 500).offsetY).toBe(0);
  });

  it('ignores non-finite drags', () => {
    const start = createCropView(VIEWPORT, 800, 400);
    expect(panCropView(start, Number.NaN, 0)).toEqual(start);
    expect(panCropView(start, 0, Number.POSITIVE_INFINITY)).toEqual(start);
  });
});

describe('crop zooming', () => {
  it('keeps the anchored source pixel under the anchor point', () => {
    const start = createCropView(VIEWPORT, 800, 400);
    const anchor = 130;

    const zoomed = zoomCropView(start, start.scale * 2, anchor, anchor);

    const sourceBefore = (anchor - start.offsetX) / start.scale;
    const sourceAfter = (anchor - zoomed.offsetX) / zoomed.scale;
    expect(sourceAfter).toBeCloseTo(sourceBefore);
    expect(zoomed.scale).toBeCloseTo(start.scale * 2);
  });

  it('caps zoom in and refuses to zoom out past the viewport fit', () => {
    const start = createCropView(VIEWPORT, 800, 400);

    const maxed = zoomCropView(start, 999, 0, 0);
    expect(maxed.scale).toBeCloseTo(minCropScale(VIEWPORT, 800, 400) * MAX_CROP_ZOOM);
    expect(cropZoomPercent(maxed)).toBe(MAX_CROP_ZOOM * 100);

    const minned = zoomCropView(maxed, 0.0001, 0, 0);
    expect(minned.scale).toBeCloseTo(minCropScale(VIEWPORT, 800, 400));
    expect(cropZoomPercent(minned)).toBe(100);
    expect(viewToCrop(minned)).toEqual(defaultAvatarCrop(800, 400));
  });

  it('falls back to the fit scale for a non-finite request', () => {
    const start = createCropView(VIEWPORT, 800, 400);
    expect(zoomCropView(start, Number.NaN, 0, 0).scale).toBeCloseTo(minCropScale(VIEWPORT, 800, 400));
  });
});

describe('crop region output', () => {
  it('stays inside the source after extreme pan and zoom combinations', () => {
    const sizes = [[800, 400], [400, 800], [333, 777]];
    for (const [width, height] of sizes) {
      let view = createCropView(VIEWPORT, width!, height!);
      view = panCropView(view, -9999, 9999);
      view = zoomCropView(view, minCropScale(VIEWPORT, width!, height!) * 3.3, 12, 240);
      view = panCropView(view, 9999, -9999);
      view = zoomCropView(view, minCropScale(VIEWPORT, width!, height!) * 0.2, 260, 0);

      const crop = viewToCrop(view);
      expect(Number.isInteger(crop.x) && Number.isInteger(crop.y) && Number.isInteger(crop.size), `${width}×${height}`).toBe(true);
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.size).toBeLessThanOrEqual(width!);
      expect(crop.y + crop.size).toBeLessThanOrEqual(height!);
      expect(crop.size).toBeGreaterThan(0);
    }
  });

  it('produces a different region once the user moves the photo', () => {
    const start = createCropView(VIEWPORT, 800, 400);
    const moved = viewToCrop(panCropView(start, -60, 0));
    expect(moved).not.toEqual(viewToCrop(start));
    expect(moved.size).toBe(400);
  });
});
