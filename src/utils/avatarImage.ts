export const AVATAR_EDGE = 256;
export const AVATAR_QUALITY = 0.82;
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** 解码后的源图；`objectUrl` 供取景框预览，由持有方调用 `releaseAvatar` 释放。 */
export interface LoadedAvatar {
  image: HTMLImageElement;
  width: number;
  height: number;
  objectUrl: string;
}

/** 源图像素坐标下的正方形取景区域，始终落在源图范围内。 */
export interface AvatarCrop {
  x: number;
  y: number;
  size: number;
}

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('头像图片无法读取'));
    image.src = url;
  });
}

/** 校验格式与体积后解码，供取景框预览和后续裁切共用同一份源图。 */
export async function loadAvatarImage(file: Blob): Promise<LoadedAvatar> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error('上传头像图片只能是 JPG、PNG 或 WebP 格式');
  if (file.size > AVATAR_MAX_BYTES) throw new Error('上传头像图片大小不能超过 8MB');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await decodeImage(objectUrl);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error('头像图片无法读取');
    return { image, width, height, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/** 释放预览用的对象 URL；重复调用安全，缺少 Blob URL 支持的环境（jsdom、SSR）直接跳过。 */
export function releaseAvatar(source: LoadedAvatar | null | undefined): void {
  if (source && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(source.objectUrl);
}

/** 居中最大正方形。这是历史行为，取景框未改动时用它，保证默认结果不变。 */
export function defaultAvatarCrop(width: number, height: number): AvatarCrop {
  const size = Math.min(width, height);
  return { x: (width - size) / 2, y: (height - size) / 2, size };
}

/**
 * 把源图上的正方形区域渲染成 JPEG data URL。
 * 输出边长上限 256，源图更小时不放大，避免糊图。
 */
export function renderAvatarCrop(image: CanvasImageSource, crop: AvatarCrop): string {
  // 取整一次，源矩形与目标画布同步，避免缩放带来的一次重采样。
  const size = Math.max(1, Math.round(crop.size));
  const edge = Math.min(AVATAR_EDGE, size);
  const canvas = document.createElement('canvas');
  canvas.width = edge;
  canvas.height = edge;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理头像');
  context.drawImage(image, crop.x, crop.y, size, size, 0, 0, edge, edge);
  return canvas.toDataURL('image/jpeg', AVATAR_QUALITY);
}
