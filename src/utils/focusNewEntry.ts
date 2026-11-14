/** Scroll the card just added into view and focus its first field. */
export function focusNewEntry(id: string) {
  const card = document.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(id)}"]`);
  if (!card) return;
  const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  card.scrollIntoView({ behavior, block: 'nearest' });
  card.querySelector<HTMLElement>('[data-entry-focus], input, textarea')?.focus();
}
