/**
 * 纯本地 STAR 写作拼装与量化指标加粗工具。
 * 不调用模型、不编造数字，只辅助用户把真实经历写清楚、突出重点。
 */

export interface StarParts {
  situation: string;
  task: string;
  action: string;
  result: string;
}

/** 匹配常见的量化指标（百分比、倍数、量级、时长、计数、金额），排除技术型号如 P99 / H800 / Vue3。 */
const METRIC_HIGHLIGHT_RE = /(?<![A-Za-z0-9_])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?:%|％|\+|倍|万\+?|亿\+?|千\+?|k\+?|K\+?|w\+?|W\+?|ms|毫秒|秒|分钟|小时|天|周|个月|年|人|名|家|款|项|次|个|件|条|单|笔|台|核|节点|QPS|TPS|RPS|MB|GB|TB|元|万元|美元|USD|RMB)(?![A-Za-z0-9_])/gu;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trimSentenceEnd(text: string): string {
  return text.trim().replace(/[，,；;。.\s]+$/u, '');
}

/** 把文本片段中的量化指标包上 `<strong>`，输入应为已转义的纯文本段。 */
function boldMetricsInEscapedSegment(segment: string): string {
  return segment.replace(METRIC_HIGHLIGHT_RE, (match) => `<strong>${match}</strong>`);
}

/**
 * 安全地为富文本 HTML 中的量化数字加上 `<strong>`。
 * 跳过已有 `<strong>` / `<b>` 标签内部、HTML 标签属性以及 URL 文本，避免重复嵌套或破坏结构。
 */
export function boldResumeMetricsHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  const tokens = html.split(/(<[^>]+>)/g);
  let boldDepth = 0;
  let anchorDepth = 0;

  return tokens.map((token) => {
    if (!token) return '';
    if (token.startsWith('<') && token.endsWith('>')) {
      const lower = token.toLowerCase();
      if (/^<(?:strong|b)(?:\s|>)/i.test(lower)) boldDepth += 1;
      else if (/^<\/(?:strong|b)\s*>/i.test(lower)) boldDepth = Math.max(0, boldDepth - 1);
      else if (/^<a(?:\s|>)/i.test(lower)) anchorDepth += 1;
      else if (/^<\/a\s*>/i.test(lower)) anchorDepth = Math.max(0, anchorDepth - 1);
      return token;
    }
    if (boldDepth > 0 || anchorDepth > 0 || /https?:\/\//i.test(token)) return token;
    return boldMetricsInEscapedSegment(token);
  }).join('');
}

/**
 * 将 S/T/A/R 四要素拼装成一条简洁无套话的中文经历要点（纯文本）。
 * 未填写的要素自然跳过，不硬塞过渡套话。
 */
export function composeStarPlainText(parts: StarParts): string {
  const segments = [
    trimSentenceEnd(parts.situation),
    trimSentenceEnd(parts.task),
    trimSentenceEnd(parts.action),
    trimSentenceEnd(parts.result),
  ].filter(Boolean);
  if (!segments.length) return '';
  return `${segments.join('，')}。`;
}

/** 将 S/T/A/R 拼装成可插入富文本编辑器的 HTML 列表项，可选自动加粗量化指标。 */
export function composeStarListItemHtml(parts: StarParts, options: { boldMetrics?: boolean } = {}): string {
  const plain = composeStarPlainText(parts);
  if (!plain) return '';
  const escaped = escapeHtml(plain);
  const body = options.boldMetrics === false ? escaped : boldMetricsInEscapedSegment(escaped);
  return `<li>${body}</li>`;
}

/** 把一条 `<li>...</li>` 追加到已有富文本末尾；若末尾已是 `</ul>`，则自然并入同一列表。 */
export function appendStarBulletToHtml(currentHtml: string, listItemHtml: string): string {
  if (!listItemHtml) return currentHtml;
  const trimmed = (currentHtml || '').trim();
  if (!trimmed || trimmed === '<p><br></p>') return `<ul>${listItemHtml}</ul>`;
  if (/<\/ul>\s*$/i.test(trimmed)) return trimmed.replace(/<\/ul>\s*$/i, `${listItemHtml}</ul>`);
  return `${trimmed}<ul>${listItemHtml}</ul>`;
}
