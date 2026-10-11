// @vitest-environment node
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { clear() {} } });
}
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { templateDemoData } from '@/data/template-demo';
import { createResumePdfBlob, downloadPdfBlob, sanitizePdfFilename } from '@/utils/export-pdf';
import type { ResumeData } from '@/types/resume';

async function fontResponse(fileName: string): Promise<Response> {
  const file = resolve(process.cwd(), 'src/assets/fonts/noto-sans-sc', fileName);
  return new Response(await readFile(file), { status: 200, headers: { 'content-type': 'font/otf' } });
}

async function readPdf(blob: Blob) {
  const loadingTask = getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
  });
  const document = await loadingTask.promise;
  const pages = [];
  let text = '';
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    pages.push(page);
    const content = await page.getTextContent();
    text += content.items.map((item) => 'str' in item ? item.str : '').join(' ');
  }
  return { loadingTask, document, pages, text };
}

describe('browser PDF export', () => {
  it('sanitizes cross-platform filenames and provides a fallback', () => {
    expect(sanitizePdfFilename('简历: 李晨阳/前端?')).toBe('简历__李晨阳_前端');
    expect(sanitizePdfFilename('...  ')).toBe('resume');
    expect(sanitizePdfFilename('x'.repeat(120))).toHaveLength(100);
  });

  it('downloads the blob and revokes the temporary object URL after the browser starts the download', async () => {
    const createObjectURL = vi.fn(() => 'blob:resume-test');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('window', { setTimeout: (callback: () => void) => callback() });
    const click = vi.fn();
    vi.stubGlobal('document', {
      body: { appendChild: vi.fn() },
      createElement: () => ({
        href: '', download: '', rel: '', style: {}, click, remove: vi.fn(),
      }),
    });

    downloadPdfBlob(new Blob(['%PDF-test']), 'resume:one');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:resume-test');
    vi.unstubAllGlobals();
  });

  it('generates a searchable multi-page Chinese PDF with live text and project links', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('NotoSansSC-Regular')) return fontResponse('NotoSansSC-Regular.otf');
      if (url.includes('NotoSansSC-Bold')) return fontResponse('NotoSansSC-Bold.otf');
      throw new Error(`Unexpected PDF asset request: ${url}`);
    });

    const data: ResumeData = structuredClone(templateDemoData);
    data.basic.avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPQSDnxHwAEYAJUCzaSjAAAAABJRU5ErkJggg==';
    data.experiences = Array.from({ length: 26 }, (_, index) => ({
      id: `long-${index}`,
      company: `示例公司 ${index + 1}`,
      position: '高级工程师',
      startDate: '2020-01',
      endDate: 'present',
      description: '<p>负责平台架构升级与稳定性建设，优化服务性能并持续交付业务能力。English searchable content.</p>',
      highlights: ['交付核心功能并提升用户体验', '构建可靠的自动化测试流程'],
    }));
    data.projects = [data.projects[0]!];

    const blob = await createResumePdfBlob(data);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(1000);
    const { loadingTask, document, pages, text } = await readPdf(blob);
    expect(new TextDecoder().decode(await blob.arrayBuffer()).startsWith('%PDF-')).toBe(true);
    expect(document.numPages).toBeGreaterThan(1);
    expect(text).toContain('李晨阳');
    expect(text).toContain('高级工程师');
    expect(text).toContain('English searchable content');
    expect(text).toContain('示例公司 26');
    expect(text).not.toContain('data:image');
    const annotations = await Promise.all(pages.map((page) => page.getAnnotations()));
    expect(annotations.flat().some((annotation) => annotation.url === 'https://demo.example.com/dashboard')).toBe(true);
    const operatorLists = await Promise.all(pages.map((page) => page.getOperatorList()));
    expect(operatorLists.flatMap((operators) => operators.fnArray)).toContain(OPS.paintImageXObject);
    await loadingTask.destroy();
    for (const templateId of ['modern', 'professional', 'creative', 'minimal', 'tech', 'ai-agent']) {
      const templateData: ResumeData = structuredClone(templateDemoData);
      templateData.templateId = templateId;
      const templateBlob = await createResumePdfBlob(templateData);
      const rendered = await readPdf(templateBlob);
      expect(rendered.document.numPages).toBeGreaterThan(0);
      expect(rendered.text).toContain('李晨阳');
      await rendered.loadingTask.destroy();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });
});
