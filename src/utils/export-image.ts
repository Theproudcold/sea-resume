import { zipSync } from 'fflate';
import { prepareResumeCapture } from './capture-colors';
import { A4_HEIGHT_MM, A4_WIDTH_MM, measureA4PageHeight, measurePageBreaks } from './pageBreaks';

export interface A4ImagePageSlice {
  sourceY: number;
  sourceHeight: number;
  outputHeight: number;
}

/**
 * 归一化分页切点：升序、去重、落在 (0, canvasHeight]，并保证最后一页结束于内容末尾。
 * 缺省切点时按 A4 页高机械分页（纯几何，仅作为调用方没给内容切点时的兜底）。
 */
function normalizePageEnds(
  cuts: readonly number[] | undefined,
  canvasHeight: number,
  pageHeight: number,
): number[] {
  const ends: number[] = [];
  const push = (end: number): void => {
    const clamped = Math.min(canvasHeight, Math.round(end));
    const previous = ends.length ? ends[ends.length - 1]! : 0;
    if (clamped - previous <= 0) return;
    // 单个切点跨度超过一页时不裁内容，补足中间页。
    for (let filler = previous + pageHeight; filler < clamped; filler += pageHeight) ends.push(filler);
    ends.push(clamped);
  };
  if (cuts?.length) {
    for (const cut of cuts) if (Number.isFinite(cut)) push(cut);
  } else {
    for (let end = pageHeight; end < canvasHeight; end += pageHeight) push(end);
  }
  push(canvasHeight);
  return ends;
}

/**
 * Calculate A4-sized vertical slices for a rendered resume canvas.
 *
 * `cuts` 是内容坐标（CSS px）下的每页结束偏移，由 `measurePageBreaks` 按内容空隙算出；
 * 传入它才能保证文字行不被页缝切成两半。
 */
export function getA4ImagePageSlices(
  canvasWidth: number,
  canvasHeight: number,
  cuts?: readonly number[],
): A4ImagePageSlice[] {
  if (!Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight) || canvasWidth <= 0 || canvasHeight <= 0) {
    return [];
  }

  const pageHeight = Math.round((canvasWidth * A4_HEIGHT_MM) / A4_WIDTH_MM);
  if (pageHeight <= 0) return [];

  return normalizePageEnds(cuts, canvasHeight, pageHeight).map((end, index, ends) => {
    const sourceY = index === 0 ? 0 : ends[index - 1]!;
    return {
      sourceY,
      sourceHeight: Math.min(pageHeight, end - sourceY),
      outputHeight: pageHeight,
    };
  });
}

/**
 * 把刚渲染出来的画布切成 A4 页：切点来自实时 DOM 的内容测量，与预览破页线同源。
 * `captureWidth` 是 html2canvas 使用的元素宽度（CSS px），用来把内容坐标换算成设备像素。
 */
export function getCapturedPageSlices(
  element: HTMLElement,
  canvas: HTMLCanvasElement,
  captureWidth: number,
): A4ImagePageSlice[] {
  if (!(canvas.width > 0) || !(canvas.height > 0)) return [];
  // 没有布局盒（隐藏节点、测试环境）时退化为 1:1，切点仍然按内容测量。
  const layoutWidth = captureWidth > 0 ? captureWidth : canvas.width;
  const scale = canvas.width / layoutWidth;
  assertCaptureCoversContent(element, canvas.height / scale);
  const cuts = measurePageBreaks(element, canvas.height / scale, measureA4PageHeight())
    .map((offset) => offset * scale);
  return getA4ImagePageSlices(canvas.width, canvas.height, cuts);
}

/**
 * 截图结果比当前内容矮，说明渲染期间布局变了（字体替换、图片迟到、容器还没展开），
 * 再切页就会静默少一段内容。宁可报错让用户重试，也不导出缺内容的 PDF / 图片。
 */
function assertCaptureCoversContent(element: HTMLElement, capturedHeight: number): void {
  const expectedHeight = Math.max(element.scrollHeight, Math.ceil(element.getBoundingClientRect().height));
  if (expectedHeight > 0 && capturedHeight < expectedHeight - 1) {
    throw new Error(
      `预览内容在导出过程中发生了变化（渲染高度 ${Math.round(capturedHeight)}px < 页面高度 ${Math.round(expectedHeight)}px），`
      + '为避免导出缺少内容已中止，请重试。',
    );
  }
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

    const { default: html2canvas } = await import('html2canvas');
    if ('fonts' in document) await document.fonts.ready;
    await Promise.all(Array.from(element.querySelectorAll('img')).map((image) =>
      image.decode?.().catch(() => undefined),
    ));
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: format === 'jpeg' ? '#ffffff' : null,
      ignoreElements: (candidate) => candidate.classList.contains('no-print'),
      onclone: (clonedDocument, clonedElement) => {
        // html2canvas cannot parse oklch()/oklab()/color() and throws on them.
        prepareResumeCapture(clonedDocument, clonedElement);
      },
    });

    const pages = getCapturedPageSlices(element, canvas, Math.ceil(element.getBoundingClientRect().width));
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
