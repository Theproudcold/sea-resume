/**
 * html2canvas（1.4.x）的颜色解析器只认识 rgb()/rgba()/hsl()/hsla()、十六进制和具名颜色，
 * 遇到 oklch()/oklab()/color() 等现代颜色函数会直接抛出
 * `Attempting to parse an unsupported color function "oklch"`，导致 PDF/图片导出失败。
 *
 * 本模块在 html2canvas 解析前，把克隆文档里计算样式中的现代颜色函数改写成 sRGB 的
 * rgb()/rgba()，从而保留原有视觉结果。
 */

interface RgbChannels {
  r: number;
  g: number;
  b: number;
}

interface ColorFunction {
  name: string;
  body: string;
}

/** html2canvas 会读取这些可能带颜色的计算样式属性。 */
export const CAPTURE_COLOR_PROPERTIES: readonly string[] = [
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'box-shadow',
  'text-shadow',
  'text-decoration-color',
  'text-emphasis-color',
  'outline-color',
  'column-rule-color',
  'caret-color',
  'accent-color',
  'list-style-image',
  'fill',
  'stroke',
  '-webkit-text-fill-color',
  '-webkit-text-stroke-color',
];

/** 现代颜色函数：html2canvas 无法解析，需要在克隆文档里改写成 sRGB。 */
const UNSUPPORTED_FUNCTION = /(oklch|oklab|color-mix|color|lab|lch|hwb|device-cmyk)\s*\(/i;
const UNSUPPORTED_FUNCTION_SCAN = /(oklch|oklab|color-mix|color|lab|lch|hwb|device-cmyk)\s*\(/gi;

function isIdentifierCharacter(character: string | undefined): boolean {
  return character !== undefined && /[-\w]/.test(character);
}

/** 值里是否包含 html2canvas 无法解析的颜色函数。 */
export function hasUnsupportedColorFunction(value: string): boolean {
  return UNSUPPORTED_FUNCTION.test(value);
}

function parseColorFunction(value: string): ColorFunction | null {
  const match = /^\s*([a-z][a-z0-9-]*)\s*\(([\s\S]*)\)\s*$/i.exec(value);
  if (!match) return null;
  const name = match[1];
  const body = match[2];
  if (!name || body === undefined) return null;
  return { name: name.toLowerCase(), body };
}

function findFunctionEnd(value: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevel(input: string, isSeparator: (character: string) => boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of input) {
    if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && isSeparator(character)) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function splitAlpha(body: string): { components: string[]; alpha?: string } {
  const segments = splitTopLevel(body, (character) => character === '/');
  const components = splitTopLevel(segments[0] ?? '', (character) => /\s|,/.test(character));
  return { components, alpha: segments[1] };
}

/** 数字或百分比；`100%` 映射到 `percentScale`（oklch/oklab 的 L 为 1、C/a/b 为 0.4）。 */
function numberFromToken(token: string, percentScale: number): number | null {
  const value = token.trim().toLowerCase();
  if (value === 'none') return 0;
  if (value.endsWith('%')) {
    const percent = Number.parseFloat(value);
    return Number.isFinite(percent) ? (percent / 100) * percentScale : null;
  }
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
}

function angleFromToken(token: string): number | null {
  const value = token.trim().toLowerCase();
  if (value === 'none') return 0;
  if (value.endsWith('grad')) return Number.parseFloat(value) * 0.9;
  if (value.endsWith('rad')) return (Number.parseFloat(value) * 180) / Math.PI;
  if (value.endsWith('turn')) return Number.parseFloat(value) * 360;
  const degrees = Number.parseFloat(value);
  return Number.isFinite(degrees) ? degrees : null;
}

function alphaFromToken(token: string | undefined): number {
  if (token === undefined) return 1;
  const value = token.trim().toLowerCase();
  if (value === 'none') return 1;
  if (value.endsWith('%')) {
    const percent = Number.parseFloat(value);
    return Number.isFinite(percent) ? percent / 100 : 1;
  }
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 1;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function linearToSrgb(value: number): number {
  const linear = clamp01(value);
  return linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
}

/**
 * oklab → 线性 sRGB → sRGB（Björn Ottosson 的公开矩阵）。
 * 超出 sRGB 色域的分量按 CSS 规范裁剪。
 */
function oklabToRgb(lightness: number, a: number, b: number): RgbChannels {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

function formatRgb(channels: RgbChannels, alphaToken?: string): string {
  const alpha = clamp01(alphaFromToken(alphaToken));
  const r = Math.round(clamp01(channels.r) * 255);
  const g = Math.round(clamp01(channels.g) * 255);
  const b = Math.round(clamp01(channels.b) * 255);
  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(4))})`;
}

function oklchToRgb(components: string[]): RgbChannels | null {
  const [lightnessToken, chromaToken, hueToken] = components;
  if (!lightnessToken || !chromaToken || !hueToken) return null;
  const lightness = numberFromToken(lightnessToken, 1);
  const chroma = numberFromToken(chromaToken, 0.4);
  const hue = angleFromToken(hueToken);
  if (lightness === null || chroma === null || hue === null) return null;
  const radians = (hue * Math.PI) / 180;
  return oklabToRgb(lightness, chroma * Math.cos(radians), chroma * Math.sin(radians));
}

function oklabFromComponents(components: string[]): RgbChannels | null {
  const [lightnessToken, aToken, bToken] = components;
  if (!lightnessToken || !aToken || !bToken) return null;
  const lightness = numberFromToken(lightnessToken, 1);
  const a = numberFromToken(aToken, 0.4);
  const b = numberFromToken(bToken, 0.4);
  if (lightness === null || a === null || b === null) return null;
  return oklabToRgb(lightness, a, b);
}

/** color(srgb r g b) 与 color(srgb-linear r g b)。 */
function colorFunctionToRgb(body: string): RgbChannels | null {
  const match = /^\s*([a-z0-9-]+)\s+([\s\S]*)$/i.exec(body.trim());
  if (!match) return null;
  const rawSpace = match[1];
  const rawChannels = match[2];
  if (!rawSpace || rawChannels === undefined) return null;
  const space = rawSpace.toLowerCase();
  if (space !== 'srgb' && space !== 'srgb-linear') return null;
  const [rToken, gToken, bToken] = splitAlpha(rawChannels).components;
  if (!rToken || !gToken || !bToken) return null;
  const r = numberFromToken(rToken, 1);
  const g = numberFromToken(gToken, 1);
  const b = numberFromToken(bToken, 1);
  if (r === null || g === null || b === null) return null;
  if (space === 'srgb-linear') {
    return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) };
  }
  return { r, g, b };
}

const canvasResolutionCache = new Map<string, string | null>();
let canvasContext: CanvasRenderingContext2D | null | undefined;

function getCanvasContext(): CanvasRenderingContext2D | null {
  if (canvasContext !== undefined) return canvasContext;
  canvasContext = null;
  try {
    if (typeof document === 'undefined') return canvasContext;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    canvasContext = canvas.getContext('2d');
  } catch {
    canvasContext = null;
  }
  return canvasContext;
}

/** 借助浏览器把其余颜色函数（color-mix、lab 等）解析成 sRGB。 */
function resolveWithCanvas(value: string): string | null {
  if (canvasResolutionCache.has(value)) return canvasResolutionCache.get(value) ?? null;
  let resolved: string | null = null;
  const supportsColor = typeof CSS === 'undefined' || typeof CSS.supports !== 'function'
    ? true
    : CSS.supports('color', value);
  if (supportsColor) {
    const context = getCanvasContext();
    if (context) {
      try {
        // A sentinel detects values the canvas setter silently rejects.
        context.fillStyle = '#123456';
        context.fillStyle = value;
        const candidate = String(context.fillStyle);
        if (candidate && candidate !== '#123456' && !hasUnsupportedColorFunction(candidate)) {
          resolved = candidate;
        }
      } catch {
        resolved = null;
      }
    }
  }
  canvasResolutionCache.set(value, resolved);
  return resolved;
}

function resolveColorFunction(value: string): string | null {
  const parsed = parseColorFunction(value);
  if (!parsed) return null;
  const { components, alpha } = splitAlpha(parsed.body);

  if (parsed.name === 'oklch') {
    const rgb = oklchToRgb(components);
    return rgb ? formatRgb(rgb, alpha) : null;
  }
  if (parsed.name === 'oklab') {
    const rgb = oklabFromComponents(components);
    return rgb ? formatRgb(rgb, alpha) : null;
  }
  if (parsed.name === 'color') {
    const rgb = colorFunctionToRgb(parsed.body);
    return rgb ? formatRgb(rgb, alpha) : null;
  }
  return resolveWithCanvas(value);
}

/**
 * 把 CSS 值中所有现代颜色函数替换成 rgb()/rgba()。
 * 无法解析的部分原样保留，避免破坏原有取值。
 */
export function replaceUnsupportedColors(value: string): string {
  if (!hasUnsupportedColorFunction(value)) return value;

  let result = '';
  let cursor = 0;
  const scan = new RegExp(UNSUPPORTED_FUNCTION_SCAN.source, 'gi');
  let match = scan.exec(value);
  while (match !== null) {
    const start = match.index;
    // 跳过 `-oklch(`、`mycolor(` 这类更大标识符的一部分。
    if (isIdentifierCharacter(value[start - 1])) {
      match = scan.exec(value);
      continue;
    }
    const end = findFunctionEnd(value, start + match[0].length - 1);
    if (end === -1) break;
    const replacement = resolveColorFunction(value.slice(start, end + 1));
    if (replacement) {
      result += value.slice(cursor, start) + replacement;
      cursor = end + 1;
    }
    scan.lastIndex = end + 1;
    match = scan.exec(value);
  }
  return result + value.slice(cursor);
}

/**
 * 变量可能只出现在伪元素等我们不逐元素遍历的地方，先把根级自定义属性里的颜色函数
 * 归一化，继承与 var() 替换就会全部落到 sRGB。
 */
function normalizeCustomProperties(view: Window, element: Element): void {
  const inline = (element as HTMLElement).style;
  if (!inline || typeof inline.setProperty !== 'function') return;
  const computed = view.getComputedStyle(element);
  for (let index = 0; index < computed.length; index += 1) {
    const property = computed.item(index);
    if (!property || !property.startsWith('--')) continue;
    const current = computed.getPropertyValue(property);
    if (!current || !hasUnsupportedColorFunction(current)) continue;
    const normalized = replaceUnsupportedColors(current);
    if (normalized !== current) inline.setProperty(property, normalized, 'important');
  }
}

/**
 * 截图前先拿掉克隆文档的深色类，让简历纸回到白纸，再把现代颜色函数改成 sRGB。
 * 必须先去掉 dark，否则后面读到的仍是深色计算值。
 */
export function prepareResumeCapture(clonedDocument: Document, root: Element): void {
  clonedDocument.documentElement.classList.remove('dark');
  normalizeCaptureColors(clonedDocument, root);
}

/**
 * 在 html2canvas 的 onclone 回调里改写克隆文档的计算颜色，
 * 覆盖根元素、body 与目标子树（html2canvas 也会读取这三处的背景色）。
 */
export function normalizeCaptureColors(clonedDocument: Document, root: Element): void {
  const view = clonedDocument.defaultView;
  if (!view) return;

  const targets = new Set<Element>();
  if (clonedDocument.documentElement) targets.add(clonedDocument.documentElement);
  if (clonedDocument.body) targets.add(clonedDocument.body);
  targets.add(root);
  root.querySelectorAll('*').forEach((element) => targets.add(element));

  for (const element of targets) {
    const computed = view.getComputedStyle(element);
    const inline = (element as HTMLElement).style;
    if (!inline || typeof inline.setProperty !== 'function') continue;
    for (const property of CAPTURE_COLOR_PROPERTIES) {
      const current = computed.getPropertyValue(property);
      if (!current || !hasUnsupportedColorFunction(current)) continue;
      const normalized = replaceUnsupportedColors(current);
      if (normalized === current) continue;
      inline.setProperty(property, normalized, 'important');
    }
  }

  for (const element of [clonedDocument.documentElement, clonedDocument.body, root]) {
    if (element) normalizeCustomProperties(view, element);
  }
}
