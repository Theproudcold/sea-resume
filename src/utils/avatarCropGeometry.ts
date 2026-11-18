import { defaultAvatarCrop, type AvatarCrop } from '@/utils/avatarImage';

/** 相对「刚好铺满视口」的放大上限。再大也只是把 256px 的输出糊掉。 */
export const MAX_CROP_ZOOM = 4;

/**
 * 取景框状态：正方形视口 + 缩放 + 显示图相对视口的偏移。
 * 源图尺寸一并存在这里，避免把 A 图的视图套到 B 图上。
 */
export interface AvatarCropView {
  /** 视口边长（CSS 像素）。 */
  viewport: number;
  /** 源图宽。 */
  width: number;
  /** 源图高。 */
  height: number;
  /** 1 个源像素显示成多少 CSS 像素。 */
  scale: number;
  /** 显示图左上角相对视口左上角的偏移，恒 <= 0，保证图片始终盖满视口。 */
  offsetX: number;
  offsetY: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 刚好铺满视口的缩放：短边对齐视口，即历史行为的默认取景。 */
export function minCropScale(viewport: number, width: number, height: number): number {
  if (viewport <= 0 || width <= 0 || height <= 0) return 1;
  return Math.max(viewport / width, viewport / height);
}

function clampOffsets(view: AvatarCropView, scale: number, offsetX: number, offsetY: number): AvatarCropView {
  const minX = view.viewport - view.width * scale;
  const minY = view.viewport - view.height * scale;
  return {
    ...view,
    scale,
    // 放大到盖不住视口时居中兜底，宁可露出背景也不要出现负宽度区间。
    offsetX: minX >= 0 ? minX / 2 : clamp(offsetX, minX, 0),
    offsetY: minY >= 0 ? minY / 2 : clamp(offsetY, minY, 0),
  };
}

/** 初始取景：铺满视口并居中，等价于旧实现的居中裁切。 */
export function createCropView(viewport: number, width: number, height: number): AvatarCropView {
  const base: AvatarCropView = { viewport, width, height, scale: 1, offsetX: 0, offsetY: 0 };
  const scale = minCropScale(viewport, width, height);
  return clampOffsets(base, scale, (viewport - width * scale) / 2, (viewport - height * scale) / 2);
}

/** 拖动：偏移跟随指针，超出边界即停。 */
export function panCropView(view: AvatarCropView, dx: number, dy: number): AvatarCropView {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return view;
  return clampOffsets(view, view.scale, view.offsetX + dx, view.offsetY + dy);
}

/**
 * 缩放并把 (anchorX, anchorY) 处的源图点固定在视口同一位置：
 * 滚轮缩放的锚点是光标，滑块和按钮的锚点是视口中心。
 */
export function zoomCropView(view: AvatarCropView, nextScale: number, anchorX: number, anchorY: number): AvatarCropView {
  const min = minCropScale(view.viewport, view.width, view.height);
  const scale = clamp(Number.isFinite(nextScale) ? nextScale : min, min, min * MAX_CROP_ZOOM);
  const sourceX = (anchorX - view.offsetX) / view.scale;
  const sourceY = (anchorY - view.offsetY) / view.scale;
  return clampOffsets(view, scale, anchorX - sourceX * scale, anchorY - sourceY * scale);
}

/** 当前缩放相对最小缩放的百分比，供滑块显示。 */
export function cropZoomPercent(view: AvatarCropView): number {
  const min = minCropScale(view.viewport, view.width, view.height);
  return Math.round((view.scale / min) * 100);
}

/**
 * 落到源图像素上的正方形取景区域。
 * 取整后仍保证落在源图内：取整可能让边界外溢半个像素，靠 size 与偏移的钳制吸收。
 */
export function viewToCrop(view: AvatarCropView): AvatarCrop {
  // 视口还没测量出来（宽 0）时没有任何取景信息，退回居中裁切，
  // 不能拿 0 宽度算出「图片正中 1 像素」这种结果。
  if (view.viewport <= 0) return defaultAvatarCrop(view.width, view.height);
  const size = Math.max(1, Math.min(
    Math.round(view.viewport / view.scale),
    Math.floor(view.width),
    Math.floor(view.height),
  ));
  return {
    x: clamp(Math.round(-view.offsetX / view.scale), 0, Math.floor(view.width) - size),
    y: clamp(Math.round(-view.offsetY / view.scale), 0, Math.floor(view.height) - size),
    size,
  };
}
