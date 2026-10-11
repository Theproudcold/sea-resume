// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportPreviewToPDF } from '@/utils/export-pdf';

const mocks = vi.hoisted(() => ({
  html2canvas: vi.fn(),
  addPage: vi.fn(),
  addImage: vi.fn(),
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
    mocks.click.mockReset();
    mocks.createObjectURL.mockClear();
    mocks.revokeObjectURL.mockClear();
    mocks.output.mockReturnValue(new Blob(['%PDF-preview'], { type: 'application/pdf' }));

    const renderingContext = {
      fillStyle: '#fff',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
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
    clippingWrapper.appendChild(clonedPreview);
    const options = mocks.html2canvas.mock.calls[0]?.[1] as {
      onclone: (clonedDocument: Document, clonedElement: HTMLElement) => void;
    };
    options.onclone(document, clonedPreview);
    expect(clippingWrapper.style.overflow).toBe('visible');
    expect(clippingWrapper.style.height).toBe('auto');
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

  it('fails clearly if the preview canvas is missing', async () => {
    await expect(exportPreviewToPDF('.missing-preview')).rejects.toThrow('未找到简历预览');
  });
});
