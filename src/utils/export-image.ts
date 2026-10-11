import { zipSync } from 'fflate';
import html2canvas from 'html2canvas';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

export interface A4ImagePageSlice {
  sourceY: number;
  sourceHeight: number;
  outputHeight: number;
}

/** Calculate A4-sized vertical slices for a rendered resume canvas. */
export function getA4ImagePageSlices(canvasWidth: number, canvasHeight: number): A4ImagePageSlice[] {
  if (!Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight) || canvasWidth <= 0 || canvasHeight <= 0) {
    return [];
  }

  const pageHeight = Math.round((canvasWidth * A4_HEIGHT_MM) / A4_WIDTH_MM);
  if (pageHeight <= 0) return [];

  const pageCount = Math.ceil(canvasHeight / pageHeight);
  return Array.from({ length: pageCount }, (_, index) => {
    const sourceY = index * pageHeight;
    return {
      sourceY,
      sourceHeight: Math.min(pageHeight, canvasHeight - sourceY),
      outputHeight: pageHeight,
    };
  });
}

/** Normalize user-supplied titles to safe file/archive basenames. */
export function sanitizeImageFilename(filename: string): string {
  const safeName = filename
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/g, '')
    .replace(/[_ .]+$/g, '')
    .slice(0, 100);
  return safeName || 'resume';
}

/** Pack rendered image pages into an uncompressed ZIP archive. */
export function createImageArchive(images: Record<string, Uint8Array>): Uint8Array {
  const safeEntries = Object.fromEntries(
    Object.entries(images).map(([filename, bytes]) => [sanitizeImageFilename(filename), bytes]),
  ) as Record<string, Uint8Array>;
  return zipSync(safeEntries, { level: 0 });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    if (link.parentNode) link.parentNode.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * 导出简历为图片，内容超过一页时按 A4 分页导出
 * @param elementId 要导出的元素ID（默认为 resume-canvas）
 * @param filename 文件名（不含扩展名）
 * @param format 图片格式（png 或 jpeg）
 */
export async function exportToImage(
  elementId: string = 'resume-canvas',
  filename: string = 'resume',
  format: 'png' | 'jpeg' = 'png'
): Promise<void> {
  try {
    const element = (elementId.startsWith('.')
      ? document.querySelector<HTMLElement>(elementId)
      : document.getElementById(elementId)) as HTMLElement | null;
    if (!element) {
      throw new Error(`未找到元素: ${elementId}`);
    }

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: format === 'jpeg' ? '#ffffff' : null,
      ignoreElements: (candidate) => candidate.classList.contains('no-print'),
    });

    const pages = getA4ImagePageSlices(canvas.width, canvas.height);
    if (pages.length === 0) {
      throw new Error('图片生成失败');
    }

    const imagesToZip: Record<string, Uint8Array> = {};

    for (const [index, page] of pages.entries()) {
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = page.outputHeight;

      const context = pageCanvas.getContext('2d');
      if (!context) {
        throw new Error('图片生成失败');
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(
        canvas,
        0,
        page.sourceY,
        canvas.width,
        page.sourceHeight,
        0,
        0,
        canvas.width,
        page.sourceHeight
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        pageCanvas.toBlob(
          (result) => {
            if (result) resolve(result);
            else reject(new Error('图片生成失败'));
          },
          `image/${format}`,
          format === 'jpeg' ? 0.95 : 1.0
        );
      });

      if (pages.length === 1) {
        downloadBlob(blob, `${sanitizeImageFilename(filename)}.${format}`);
      } else {
        imagesToZip[`${sanitizeImageFilename(filename)}-${index + 1}.${format}`] = new Uint8Array(await blob.arrayBuffer());
      }
    }

    if (pages.length > 1) {
      const archive = createImageArchive(imagesToZip);
      const archiveBuffer = new ArrayBuffer(archive.byteLength);
      new Uint8Array(archiveBuffer).set(archive);
      downloadBlob(new Blob([archiveBuffer], { type: 'application/zip' }), `${sanitizeImageFilename(filename)}.zip`);
    }
  } catch (error) {
    console.error('图片导出失败:', error);
    throw error;
  }
}
