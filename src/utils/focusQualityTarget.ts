const FIELD_SELECTOR = 'input, textarea, [contenteditable="true"]';
const ENTRY_CARD_SELECTOR = '.resume-entry-card';
/** The collapse toggles in the list editors expose their state through `aria-expanded`. */
const COLLAPSED_TOGGLE_SELECTOR = '[aria-expanded="false"]';

/** Waits one animation frame, falling back to a macrotask where rAF is unavailable. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * Resolves an element that appears after a reactive update, e.g. the editor section a jump targets.
 * Gives up after `timeoutMs` or as soon as `isCancelled` reports the caller moved on.
 */
export async function waitForElement(
  getElement: () => HTMLElement | null,
  options: { timeoutMs?: number; isCancelled?: () => boolean } = {},
): Promise<HTMLElement | null> {
  const { timeoutMs = 300, isCancelled } = options;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const element = getElement();
    if (element) return element;
    if (isCancelled?.() || Date.now() >= deadline) return null;
    await nextFrame();
  }
}

/** True when the element or one of its ancestors is not rendered, so scroll/focus would silently do nothing. */
export function isHidden(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hasAttribute('hidden')) return true;
    const style = view.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    if (node === element.ownerDocument.body) break;
  }
  return false;
}

/** Expands the entry card that owns a collapsed field by pressing its existing toggle. */
function expandEntryCard(field: HTMLElement): boolean {
  const card = field.closest<HTMLElement>(ENTRY_CARD_SELECTOR);
  const toggle = card?.querySelector<HTMLElement>(COLLAPSED_TOGGLE_SELECTOR);
  if (!toggle) return false;
  toggle.click();
  return true;
}

/**
 * Scrolls to a quality issue's field and focuses it.
 * A collapsed card is expanded first; when the field stays unreachable the section root is used instead,
 * so the jump always moves the viewport.
 *
 * @param sectionRoot the editor section element that contains the target field
 * @param target the `data-quality-id` to reveal, or null to scroll to the section root only
 */
export async function focusQualityTarget(sectionRoot: HTMLElement, target: string | null): Promise<void> {
  const scrollToRoot = () => sectionRoot.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (!target) {
    scrollToRoot();
    return;
  }

  // Compare the attribute instead of building a selector, so ids with quotes or backslashes need no escaping.
  const findField = () => {
    const candidates = sectionRoot.querySelectorAll<HTMLElement>('[data-quality-id]');
    for (const candidate of candidates) {
      if (candidate.getAttribute('data-quality-id') === target) return candidate;
    }
    return null;
  };

  let field = findField();
  if (field && isHidden(field) && expandEntryCard(field)) {
    await nextFrame();
    await nextFrame();
    field = findField();
  }

  if (!field || isHidden(field)) {
    scrollToRoot();
    return;
  }

  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  field.querySelector<HTMLElement>(FIELD_SELECTOR)?.focus();
}
