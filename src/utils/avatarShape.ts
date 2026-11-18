import type { AvatarShape } from '@/types/resume';

/** 历史简历没有 avatarShape 字段，统一按圆形渲染，老数据外观不变。 */
export const DEFAULT_AVATAR_SHAPE: AvatarShape = 'circle';

export const AVATAR_SHAPE_OPTIONS: ReadonlyArray<{ value: AvatarShape; label: string }> = [
  { value: 'circle', label: '圆形' },
  { value: 'square', label: '方形' },
];

/**
 * 只接受白名单值，未知输入返回 undefined。
 * 存储与导入用这个：旧简历和脏数据都保持「没有设置」，不写回一个伪造的选择。
 */
export function parseAvatarShape(value: unknown): AvatarShape | undefined {
  return value === 'square' || value === 'circle' ? value : undefined;
}

/**
 * 渲染层用这个：缺失、旧数据、被改坏的 JSON 一律回落到默认形态，
 * 保证模板永远拿到两个已知值之一。
 */
export function normalizeAvatarShape(value: unknown): AvatarShape {
  return parseAvatarShape(value) ?? DEFAULT_AVATAR_SHAPE;
}

/**
 * 头像容器的 border-radius。
 * CSS 只从这里取值，未知输入无法进入样式；方形保留 2px 圆角，
 * 与 AI Agent 模板原有的 2px 一致，避免缩放到 68px 时边缘发毛。
 */
export function avatarBorderRadius(shape: AvatarShape | undefined): string {
  return normalizeAvatarShape(shape) === 'square' ? '2px' : '999px';
}
