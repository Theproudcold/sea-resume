import type { AvatarShape } from '@/types/resume';
import { normalizeAvatarShape } from '@/utils/avatarShape';

const DATA_IMAGE_PATTERN = /^data:image\/(?:png|jpe?g);base64,[a-z\d+/]+=*$/i;

let canvasRasterSupport = false;

/**
 * 探测真实 canvas 实现。jsdom / SSR 下 `getContext` 返回 null，必须在解码前退出：
 * 那里的 `Image` 对 data URL 既不触发 onload 也不触发 onerror，等待解码会永久挂起。
 * 只缓存成功结果：失败环境（测试替身、无 canvas 的运行时）每次重探，避免一次失败污染后续判断。
 */
function supportsCanvasRaster(): boolean {
  if (canvasRasterSupport) return true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    canvasRasterSupport = !!canvas.getContext('2d') && typeof canvas.toDataURL('image/png') === 'string';
  } catch {
    canvasRasterSupport = false;
  }
  return canvasRasterSupport;
}

function decodeDataImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('头像无法解码'));
    image.src = source;
  });
}

/**
 * 按方形居中取景裁成正圆，输出透明角的 PNG。
 * pdfmake 没有图片圆角能力，只能在嵌入前把圆做进像素。
 * 环境不支持或解码失败时退回原图：圆形外观可以降级，导出不能因此失败。
 */
export async function maskAvatarToCircle(source: string): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !supportsCanvasRaster()) return source;
  try {
    const image = await decodeDataImage(source);
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    if (!size) return source;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return source;
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    context.clip();
    context.drawImage(
      image,
      (image.naturalWidth - size) / 2,
      (image.naturalHeight - size) / 2,
      size,
      size,
      0,
      0,
      size,
      size,
    );
    const masked = canvas.toDataURL('image/png');
    return DATA_IMAGE_PATTERN.test(masked) ? masked : source;
  } catch {
    return source;
  }
}

/** 按头像外观准备最终嵌入 PDF 的图片；方形沿用原始方形照片。 */
export async function resolveResumeAvatarForShape(
  source: string | undefined,
  shape: AvatarShape | undefined,
): Promise<string | undefined> {
  if (!source) return undefined;
  return normalizeAvatarShape(shape) === 'circle' ? maskAvatarToCircle(source) : source;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('头像读取失败'));
    reader.readAsDataURL(blob);
  });
}

/** Only embeds raster data URLs or same-origin images; remote resume images are never requested. */
export async function resolveResumeAvatar(source: string | undefined): Promise<string | undefined> {
  if (!source) return undefined;
  if (DATA_IMAGE_PATTERN.test(source)) return source;
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return undefined;

  try {
    const url = new URL(source, window.location.href);
    if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol)) return undefined;
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok || !/^image\/(?:png|jpeg)$/i.test(response.headers.get('content-type') ?? '')) return undefined;
    const blob = await response.blob();
    if (blob.size > 5 * 1024 * 1024) return undefined;
    const dataUrl = await blobToDataUrl(blob);
    return DATA_IMAGE_PATTERN.test(dataUrl) ? dataUrl : undefined;
  } catch {
    return undefined;
  }
}
