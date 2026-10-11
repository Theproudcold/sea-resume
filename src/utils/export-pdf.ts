import type { ResumeData } from '@/types/resume';
import notoSansScRegularUrl from '@/assets/fonts/noto-sans-sc/NotoSansSC-Regular.otf?url';
import notoSansScBoldUrl from '@/assets/fonts/noto-sans-sc/NotoSansSC-Bold.otf?url';
import { createResumePdfDefinition } from './pdf/createResumePdfDefinition';
import { resolveResumeAvatar } from './pdf/resolveAvatar';
import { getA4ImagePageSlices } from './export-image';
import type { TDocumentDefinitions, TFontDictionary, TVirtualFileSystem } from 'pdfmake/interfaces';

interface PdfMakeRuntime {
  addVirtualFileSystem(vfs: TVirtualFileSystem): void;
  addFonts(fonts: TFontDictionary): void;
  createPdf(definition: TDocumentDefinitions): { getBlob(): Promise<Blob> };
}

let runtimePromise: Promise<PdfMakeRuntime> | undefined;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function fetchFont(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`中文字体加载失败（HTTP ${response.status}），请检查网络或稍后重试。`);
  return toBase64(new Uint8Array(await response.arrayBuffer()));
}

async function loadPdfMake(): Promise<PdfMakeRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const [module, regularFont, boldFont] = await Promise.all([
        import('pdfmake/build/pdfmake'),
        fetchFont(notoSansScRegularUrl),
        fetchFont(notoSansScBoldUrl),
      ]);
      const loaded = module as unknown as { default?: PdfMakeRuntime } & PdfMakeRuntime;
      const pdfMake = loaded.default ?? loaded;
      const regularFile = 'NotoSansSC-Regular.otf';
      const boldFile = 'NotoSansSC-Bold.otf';
      pdfMake.addVirtualFileSystem({ [regularFile]: regularFont, [boldFile]: boldFont });
      pdfMake.addFonts({
        NotoSansSC: {
          normal: regularFile,
          bold: boldFile,
          italics: regularFile,
          bolditalics: boldFile,
        },
      });
      return pdfMake;
    })().catch((error) => {
      runtimePromise = undefined;
      throw error;
    });
  }
  return runtimePromise;
}

export function sanitizePdfFilename(filename: string): string {
  const safeName = filename
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[_ .]+$/g, '')
    .slice(0, 100);
  return safeName || 'resume';
}

export function downloadPdfBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${sanitizePdfFilename(filename)}.pdf`;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

async function waitForImages(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll('img')).filter((image) => !image.complete);
  await Promise.all(images.map((image) => new Promise<void>((resolve) => {
    let timeout = 0;
    const finish = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    timeout = window.setTimeout(finish, 3000);
    image.addEventListener('load', finish, { once: true });
    image.addEventListener('error', finish, { once: true });
  })));
}

/** Capture the actual Vue preview DOM so visual PDF output follows the template preview. */
export async function exportPreviewToPDF(selector = '.resume-canvas', filename = 'resume'): Promise<number> {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`未找到简历预览：${selector}`);
  await document.fonts?.ready;
  await waitForImages(element);

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const renderWidth = Math.max(element.scrollWidth, Math.ceil(element.getBoundingClientRect().width), 794);
  const renderHeight = Math.max(element.scrollHeight, Math.ceil(element.getBoundingClientRect().height));
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    width: renderWidth,
    height: renderHeight,
    windowWidth: document.documentElement.clientWidth || renderWidth,
    windowHeight: document.documentElement.clientHeight || renderHeight,
    ignoreElements: (candidate) => candidate.classList.contains('no-print'),
    onclone: (clonedDocument, clonedElement) => {
      clonedElement.style.setProperty('box-shadow', 'none', 'important');
      clonedElement.style.setProperty('transform', 'none', 'important');
      clonedElement.style.margin = '0';
      let ancestor = clonedElement.parentElement;
      while (ancestor) {
        const style = clonedDocument.defaultView?.getComputedStyle(ancestor);
        const clipsContent = [style?.overflow, style?.overflowX, style?.overflowY]
          .some((value) => value === 'hidden' || value === 'auto' || value === 'scroll' || value === 'clip');
        if (clipsContent) {
          ancestor.style.setProperty('overflow', 'visible', 'important');
          ancestor.style.setProperty('height', 'auto', 'important');
          ancestor.style.setProperty('max-height', 'none', 'important');
        }
        ancestor = ancestor.parentElement;
      }
    },
  });

  const pages = getA4ImagePageSlices(canvas.width, canvas.height);
  if (pages.length === 0) throw new Error('预览内容为空，无法生成 PDF。');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  for (const [index, page] of pages.entries()) {
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = page.outputHeight;
    const context = pageCanvas.getContext('2d');
    if (!context) throw new Error('PDF 页面渲染失败，请重试。');

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
      page.sourceHeight,
    );

    if (index > 0) pdf.addPage();
    pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  }

  downloadPdfBlob(pdf.output('blob'), filename);
  return pages.length;
}

/** Generate a searchable PDF from resume data. Its typography/layout is independent of the Vue DOM preview. */
export async function createResumePdfBlob(data: ResumeData): Promise<Blob> {
  const [pdfMake, avatar] = await Promise.all([loadPdfMake(), resolveResumeAvatar(data.basic.avatar)]);
  const definition = createResumePdfDefinition(data, avatar);
  return pdfMake.createPdf(definition).getBlob();
}

export async function exportToPDF(data: ResumeData, filename = 'resume'): Promise<void> {
  const blob = await createResumePdfBlob(data);
  downloadPdfBlob(blob, filename);
}
