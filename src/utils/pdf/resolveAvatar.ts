const DATA_IMAGE_PATTERN = /^data:image\/(?:png|jpe?g);base64,[a-z\d+/]+=*$/i;

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
