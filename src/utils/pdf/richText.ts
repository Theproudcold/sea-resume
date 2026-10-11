import type { Content, ContentText } from 'pdfmake/interfaces';

type InlineStyle = {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  decoration?: 'lineThrough';
};

const BLOCK_TAGS = new Set(['P', 'DIV', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'IMG', 'VIDEO', 'AUDIO']);

function safeLink(href: string | null): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, typeof document === 'undefined' ? 'https://resume.invalid' : document.baseURI);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? href : undefined;
  } catch {
    return undefined;
  }
}

function styleRun(run: Content, style: InlineStyle, link?: string): Content {
  if (typeof run === 'string') return { text: run, ...style, ...(link ? { link, color: '#2563eb', decoration: 'underline' } : {}) };
  if (run && typeof run === 'object' && !Array.isArray(run) && 'text' in run) {
    return { ...(run as ContentText), ...style, ...(link ? { link, color: '#2563eb', decoration: 'underline' } : {}) };
  }
  return run;
}

function inlineRuns(node: Node, inherited: InlineStyle = {}): Content[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    return text ? [text] : [];
  }
  if (!(node instanceof Element) || IGNORED_TAGS.has(node.tagName)) return [];

  const style: InlineStyle = { ...inherited };
  switch (node.tagName) {
    case 'B':
    case 'STRONG': style.bold = true; break;
    case 'I':
    case 'EM': style.italics = true; break;
    case 'U': style.underline = true; break;
    case 'S':
    case 'DEL': style.decoration = 'lineThrough'; break;
  }

  if (node.tagName === 'BR') return ['\n'];
  const children = Array.from(node.childNodes).flatMap((child) => inlineRuns(child, style));
  if (node.tagName === 'A') {
    const link = safeLink(node.getAttribute('href'));
    return link ? children.map((child) => styleRun(child, style, link)) : children;
  }
  return Object.keys(style).length ? children.map((child) => styleRun(child, style)) : children;
}

function hasText(content: Content[]): boolean {
  return content.some((item) => typeof item === 'string' ? item.trim().length > 0 : true);
}

/** Converts resume rich-text HTML to a small safe pdfmake content tree; arbitrary HTML and remote images are discarded. */
export function richTextToPdfContent(html: string | undefined): Content[] {
  if (!html?.trim()) return [];
  if (typeof DOMParser === 'undefined') {
    return [html.replace(/<\/?(?:script|style|iframe|object|svg|img)[^>]*>[\s\S]*?<\/?(?:script|style|iframe|object|svg|img)[^>]*>/gi, '').replace(/<[^>]*>/g, ' ')];
  }

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const output: Content[] = [];
  let inline: Content[] = [];
  const flushInline = () => {
    if (hasText(inline)) output.push({ text: inline, margin: [0, 0, 0, 3] });
    inline = [];
  };

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      inline.push(...inlineRuns(node));
      return;
    }
    if (!(node instanceof Element) || IGNORED_TAGS.has(node.tagName)) return;
    if (node.tagName === 'BR') {
      inline.push('\n');
      return;
    }

    if (node.tagName === 'UL' || node.tagName === 'OL') {
      flushInline();
      const items = Array.from(node.children)
        .filter((child) => child.tagName === 'LI')
        .map((item) => inlineRuns(item));
      if (items.length) {
        output.push(node.tagName === 'OL'
          ? { ol: items, margin: [0, 0, 0, 4], style: 'richList' }
          : { ul: items, margin: [0, 0, 0, 4], style: 'richList' });
      }
      return;
    }

    if (BLOCK_TAGS.has(node.tagName)) {
      const containsBlock = Array.from(node.children).some((child) => BLOCK_TAGS.has(child.tagName) || child.tagName === 'UL' || child.tagName === 'OL');
      if (containsBlock) {
        flushInline();
        Array.from(node.childNodes).forEach(visit);
      } else {
        flushInline();
        const runs = inlineRuns(node);
        if (hasText(runs)) output.push({ text: runs, margin: [0, 0, 0, 3] });
      }
      return;
    }

    inline.push(...inlineRuns(node));
  };

  Array.from(parsed.body.childNodes).forEach(visit);
  flushInline();
  return output;
}
