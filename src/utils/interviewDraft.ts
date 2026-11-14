const DRAFT_PREFIX = 'sea-resume:interview-draft:';
const DRAFT_MAX = 10000;

/** Drafts live in localStorage, not in the AI record, and only while the user keeps this interview on this device. */
function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function draftKey(sessionId: string, turnId: string): string {
  return `${DRAFT_PREFIX}${sessionId}:${turnId}`;
}

export function readInterviewDraft(sessionId: string, turnId: string): string {
  const store = storage();
  if (!store) return '';
  try { return store.getItem(draftKey(sessionId, turnId))?.slice(0, DRAFT_MAX) ?? ''; } catch { return ''; }
}

export function writeInterviewDraft(sessionId: string, turnId: string, text: string, enabled: boolean): void {
  const store = storage();
  if (!store) return;
  try {
    if (enabled && text.trim()) store.setItem(draftKey(sessionId, turnId), text.slice(0, DRAFT_MAX));
    else store.removeItem(draftKey(sessionId, turnId));
  } catch { /* a draft is best-effort; storage limits must never block answering */ }
}

export function clearInterviewTurnDraft(sessionId: string, turnId: string): void {
  writeInterviewDraft(sessionId, turnId, '', false);
}

/** Removes every draft of one session; used when a session completes or is deleted. */
export function clearInterviewDraft(sessionId: string): void {
  const store = storage();
  if (!store) return;
  try {
    const prefix = `${DRAFT_PREFIX}${sessionId}:`;
    const keys: string[] = [];
    for (let index = 0; index < store.length; index++) {
      const key = store.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach(key => store.removeItem(key));
  } catch { /* ignore */ }
}
