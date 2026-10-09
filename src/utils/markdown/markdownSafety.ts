const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function sanitizeMarkdownUrl(value: string): string | null {
  const candidate = value.trim().replace(/[\u0000-\u0020]/g, '');
  if (/^(https?:|mailto:)/i.test(candidate)) return candidate;
  return null;
}

function renderInline(source: string): string {
  const links: string[] = [];
  const withLinks = source.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, rawUrl: string) => {
    const url = sanitizeMarkdownUrl(rawUrl);
    if (!url) return escapeHtml(label);
    const token = `\u0000LINK${links.length}\u0000`;
    links.push(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
    return token;
  });

  let html = escapeHtml(withLinks)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1<em>$2</em>');
  links.forEach((link, index) => { html = html.replace(`\u0000LINK${index}\u0000`, link); });
  return html;
}

/** Render the supported Markdown subset to safe Quill-compatible HTML. Raw HTML is escaped. */
export function markdownToSafeHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let paragraph: string[] = [];
  let list: 'ul' | 'ol' | null = null;

  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) output.push(`</${list}>`);
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const item = trimmed.match(/^([-*+] |\d+[.)] )(.*)$/);
    if (item) {
      flushParagraph();
      const nextList = /^\d/.test(item[1] ?? '') ? 'ol' : 'ul';
      if (list !== nextList) {
        closeList();
        list = nextList;
        output.push(`<${list}>`);
      }
      output.push(`<li>${renderInline(item[2] ?? '')}</li>`);
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      closeList();
      output.push(`<blockquote>${renderInline(trimmed.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }
    closeList();
    paragraph.push(trimmed.replace(/^#{1,6}\s+/, '').replace(/^---+$/, ''));
  }
  flushParagraph();
  closeList();
  return output.join('');
}

/** Sanitize rich-text HTML imported from JSON before it reaches template v-html bindings. */
export function sanitizeRichTextHtml(value: string): string {
  if (typeof DOMParser === 'undefined') return markdownToSafeHtml(value);
  const documentFragment = new DOMParser().parseFromString(value, 'text/html');
  const allowed = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'a']);
  const blocked = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'img', 'video', 'audio']);
  const render = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (blocked.has(tag)) return '';
    const children = [...element.childNodes].map(render).join('');
    if (!allowed.has(tag)) return children;
    if (tag === 'br') return '<br>';
    if (tag === 'a') {
      const href = sanitizeMarkdownUrl(element.getAttribute('href') ?? '');
      return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${children}</a>` : children;
    }
    return `<${tag}>${children}</${tag}>`;
  };
  return [...documentFragment.body.childNodes].map(render).join('');
}
