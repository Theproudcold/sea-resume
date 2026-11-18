// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportPreviewToPDF } from '@/utils/export-pdf';

const mocks = vi.hoisted(() => ({
  html2canvas: vi.fn(),
  addPage: vi.fn(),
  addImage: vi.fn(),
  drawImage: vi.fn(),
  output: vi.fn(),
  click: vi.fn(),
  revokeObjectURL: vi.fn(),
  createObjectURL: vi.fn(() => 'blob:preview-pdf'),
}));

vi.mock('html2canvas', () => ({ default: mocks.html2canvas }));
vi.mock('jspdf', () => ({
  jsPDF: vi.fn(() => ({ addPage: mocks.addPage, addImage: mocks.addImage, output: mocks.output })),
}));

describe('preview-faithful PDF export', () => {
  beforeEach(() => {
    mocks.html2canvas.mockReset();
    mocks.addPage.mockReset();
    mocks.addImage.mockReset();
    mocks.drawImage.mockReset();
    mocks.click.mockReset();
    mocks.createObjectURL.mockClear();
    mocks.revokeObjectURL.mockClear();
    mocks.output.mockReturnValue(new Blob(['%PDF-preview'], { type: 'application/pdf' }));

    const renderingContext = {
      fillStyle: '#fff',
      fillRect: vi.fn(),
      drawImage: mocks.drawImage,
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(renderingContext);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,preview');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(mocks.click);
    vi.stubGlobal('URL', { createObjectURL: mocks.createObjectURL, revokeObjectURL: mocks.revokeObjectURL });
    vi.spyOn(window, 'setTimeout').mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === 'function') callback();
      return 1;
    }) as typeof window.setTimeout);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('captures the live resume canvas and writes each A4 slice into the PDF', async () => {
    const preview = document.createElement('div');
    preview.className = 'resume-canvas';
    Object.defineProperties(preview, {
      scrollWidth: { configurable: true, value: 794 },
      scrollHeight: { configurable: true, value: 2500 },
    });
    document.body.appendChild(preview);
    const captureCanvas = { width: 794, height: 2500 } as HTMLCanvasElement;
    mocks.html2canvas.mockResolvedValue(captureCanvas);

    const pageCount = await exportPreviewToPDF('.resume-canvas', 'matching-preview');

    const clippingWrapper = document.createElement('div');
    clippingWrapper.style.overflow = 'auto';
    clippingWrapper.style.height = '500px';
    const clonedPreview = preview.cloneNode(true) as HTMLElement;
    clonedPreview.style.setProperty('color', 'oklch(0.5 0 0)');
    clippingWrapper.appendChild(clonedPreview);
    const options = mocks.html2canvas.mock.calls[0]?.[1] as {
      onclone: (clonedDocument: Document, clonedElement: HTMLElement) => void;
    };
    options.onclone(document, clonedPreview);
    expect(clippingWrapper.style.overflow).toBe('visible');
    expect(clippingWrapper.style.height).toBe('auto');
    // html2canvas cannot parse oklch(), so onclone must leave only rgb()/rgba() colors.
    expect(clonedPreview.style.getPropertyValue('color')).toBe('rgb(99, 99, 99)');
    expect(preview.parentElement).toBe(document.body);
    expect(mocks.html2canvas).toHaveBeenCalledOnce();
    expect(mocks.html2canvas.mock.calls[0]?.[0]).toBe(preview);
    expect(mocks.html2canvas.mock.calls[0]?.[1]).toMatchObject({ scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    expect(pageCount).toBe(3);
    expect(mocks.addImage).toHaveBeenCalledTimes(3);
    expect(mocks.addPage).toHaveBeenCalledTimes(2);
    expect(mocks.click).toHaveBeenCalledOnce();
    expect(mocks.createObjectURL).toHaveBeenCalledOnce();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:preview-pdf');
  });

  it('keeps a text line whole by moving the page break to the gap above it', async () => {
    const preview = document.createElement('div');
    preview.className = 'resume-canvas';
    const paragraph = document.createElement('p');
    paragraph.textContent = '这一行正好压在页缝上';
    preview.appendChild(paragraph);
    document.body.appendChild(preview);
    Object.defineProperties(preview, {
      scrollWidth: { configurable: true, value: 794 },
      scrollHeight: { configurable: true, value: 2500 },
    });
    const rect = (top: number, height: number): DOMRect => ({
      x: 0, y: top, top, bottom: top + height, left: 0, right: 794, width: 794, height,
      toJSON: () => ({}),
    }) as DOMRect;
    const a4Height = (297 * 96) / 25.4;
    const lineTop = Math.round(a4Height) - 24;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === preview) return rect(0, 2500);
      if (this === paragraph) return rect(lineTop, 40);
      return rect(0, 0);
    });
    mocks.html2canvas.mockResolvedValue({ width: 794, height: 2500 } as HTMLCanvasElement);

    const pageCount = await exportPreviewToPDF('.resume-canvas', 'content-aware');

    expect(pageCount).toBe(3);
    const cuts = mocks.drawImage.mock.calls.map((call) => Number(call[2]) + Number(call[4]));
    expect(cuts.length).toBe(3);
    // 切点可以落在行盒的上边缘，但绝不能落在行盒内部，否则这一行会被印成两半。
    for (const cut of cuts) {
      expect(cut > lineTop && cut < lineTop + 40).toBe(false);
    }
    expect(cuts[0]).toBe(lineTop);
  });

  it('fails clearly if the preview canvas is missing', async () => {
    await expect(exportPreviewToPDF('.missing-preview')).rejects.toThrow('未找到简历预览');
  });
});
