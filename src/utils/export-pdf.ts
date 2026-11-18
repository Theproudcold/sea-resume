import type { ResumeData } from '@/types/resume';
import notoSansScRegularUrl from '@/assets/fonts/noto-sans-sc/NotoSansSC-Regular.otf?url';
import notoSansScBoldUrl from '@/assets/fonts/noto-sans-sc/NotoSansSC-Bold.otf?url';
import { createResumePdfDefinition } from './pdf/createResumePdfDefinition';
import { collectResumeCharacters, subsetOpenTypeFont } from './pdf/subsetFont';
import { resolveResumeAvatar, resolveResumeAvatarForShape } from './pdf/resolveAvatar';
import { getA4ImagePageSlices } from './export-image';
import { prepareResumeCapture } from './capture-colors';
import type { TDocumentDefinitions, TFontDictionary, TVirtualFileSystem } from 'pdfmake/interfaces';

interface PdfMakeRuntime {
  addVirtualFileSystem(vfs: TVirtualFileSystem): void;
  addFonts(fonts: TFontDictionary): void;
  setFonts(fonts: TFontDictionary): void;
  createPdf(definition: TDocumentDefinitions): { getBlob(): Promise<Blob> };
  virtualfs?: { storage?: Record<string, unknown> };
}

let runtimePromise: Promise<PdfMakeRuntime> | undefined;
let fontInstall: Promise<void> = Promise.resolve();
const sourceFonts = new Map<string, Promise<Uint8Array>>();

/**
 * Subsetting a full CJK face costs roughly a second, and re-exporting an unchanged
 * resume repeats it. Cache by source URL plus the exact character set; the limit
 * keeps a few recently exported resumes so memory stays bounded.
 */
const SUBSET_CACHE_LIMIT = 4;
const subsetFonts = new Map<string, Promise<Uint8Array>>();

function subsetFont(url: string, characters: string): Promise<Uint8Array> {
  const key = `${url}\u0000${characters}`;
  const cached = subsetFonts.get(key);
  if (cached) {
    // Refresh recency so the bounded cache evicts the least recently used subset.
    subsetFonts.delete(key);
    subsetFonts.set(key, cached);
    return cached;
  }
  const pending = fetchFontBytes(url)
    .then((bytes) => subsetOpenTypeFont(bytes, characters))
    .catch((error) => {
      subsetFonts.delete(key);
      throw error;
    });
  subsetFonts.set(key, pending);
  if (subsetFonts.size > SUBSET_CACHE_LIMIT) {
    const oldest = subsetFonts.keys().next().value;
    if (oldest !== undefined) subsetFonts.delete(oldest);
  }
  return pending;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function fetchFontBytes(url: string): Promise<Uint8Array> {
  const cached = sourceFonts.get(url);
  if (cached) return cached;
  const pending = fetch(url).then(async (response) => {
    if (!response.ok) throw new Error(`中文字体加载失败（HTTP ${response.status}），请检查网络或稍后重试。`);
    return new Uint8Array(await response.arrayBuffer());
  }).catch((error) => {
    sourceFonts.delete(url);
    throw error;
  });
  sourceFonts.set(url, pending);
  return pending;
}

async function loadPdfMake(): Promise<PdfMakeRuntime> {
  if (!runtimePromise) {
    runtimePromise = import('pdfmake/build/pdfmake').then((module) => {
      const loaded = module as unknown as { default?: PdfMakeRuntime } & PdfMakeRuntime;
      return loaded.default ?? loaded;
    }).catch((error) => {
      runtimePromise = undefined;
      throw error;
    });
  }
  return runtimePromise;
}

async function withSubsetFonts(pdfMake: PdfMakeRuntime, data: ResumeData, create: () => Promise<Blob>): Promise<Blob> {
  const previous = fontInstall;
  let release!: () => void;
  fontInstall = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const regularFile = 'NotoSansSC-Regular.subset.otf';
  const boldFile = 'NotoSansSC-Bold.subset.otf';
  try {
    const characters = collectResumeCharacters(data);
    const [regular, bold] = await Promise.all([
      subsetFont(notoSansScRegularUrl, characters),
      subsetFont(notoSansScBoldUrl, characters),
    ]);
    pdfMake.addVirtualFileSystem({
      [regularFile]: toBase64(regular),
      [boldFile]: toBase64(bold),
    });
    pdfMake.setFonts({
      NotoSansSC: { normal: regularFile, bold: boldFile, italics: regularFile, bolditalics: boldFile },
    });
    return await create();
  } finally {
    pdfMake.setFonts({});
    const storage = pdfMake.virtualfs?.storage;
    if (storage) {
      delete storage[regularFile];
      delete storage[boldFile];
    }
    release();
  }
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
      // html2canvas cannot parse oklch()/oklab()/color() and throws on them.
      prepareResumeCapture(clonedDocument, clonedElement);
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
  const [pdfMake, avatarSource] = await Promise.all([loadPdfMake(), resolveResumeAvatar(data.basic.avatar)]);
  const avatar = await resolveResumeAvatarForShape(avatarSource, data.basic.avatarShape);
  const definition = createResumePdfDefinition(data, avatar);
  return withSubsetFonts(pdfMake, data, () => pdfMake.createPdf(definition).getBlob());
}

export async function exportToPDF(data: ResumeData, filename = 'resume'): Promise<void> {
  const blob = await createResumePdfBlob(data);
  downloadPdfBlob(blob, filename);
}
