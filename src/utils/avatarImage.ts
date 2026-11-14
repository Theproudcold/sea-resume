const AVATAR_EDGE = 256;
const AVATAR_QUALITY = 0.82;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('头像图片无法读取'));
    };
    image.src = url;
  });
}

/**
 * Shrink a portrait to a square JPEG before it enters resume state.
 * The original file is never stored: history, autosave and localStorage all copy this string.
 */
export async function compressAvatar(file: Blob): Promise<string> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error('上传头像图片只能是 JPG、PNG 或 WebP 格式');
  if (file.size > 8 * 1024 * 1024) throw new Error('上传头像图片大小不能超过 8MB');
  const image = await loadImage(file);
  const source = Math.min(image.naturalWidth, image.naturalHeight);
  if (!source) throw new Error('头像图片无法读取');
  const edge = Math.min(AVATAR_EDGE, source);
  const canvas = document.createElement('canvas');
  canvas.width = edge;
  canvas.height = edge;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理头像');
  const offsetX = (image.naturalWidth - source) / 2;
  const offsetY = (image.naturalHeight - source) / 2;
  context.drawImage(image, offsetX, offsetY, source, source, 0, 0, edge, edge);
  return canvas.toDataURL('image/jpeg', AVATAR_QUALITY);
}
