/**
 * Local crash / close / navigation backstop for unsaved note edits.
 *
 * The prototype editor autosaves on a 700ms debounce. If the tab closes, the
 * page crashes, or the user navigates within that window — and the best-effort
 * `pagehide` keepalive PUT doesn't land — the in-memory edit is lost. This
 * persists a lightweight draft to localStorage on every change so it can be
 * restored on the next open of that note.
 *
 * This is a *backstop*, not the source of truth: the network save + Supabase
 * sync remain authoritative. Restore intentionally degrades to the app's
 * existing last-write-wins model in the rare multi-device case (a restored draft
 * that is actually older simply re-applies the local edit, same as any LWW save).
 */

const PREFIX = 'harvous-note-draft-';
/** Skip pathologically large notes so a single draft can't blow the quota. */
const MAX_DRAFT_BYTES = 256 * 1024;
/** Don't resurrect ancient drafts (e.g. a tab left open for weeks). */
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface NoteDraft {
  title: string;
  content: string;
  savedAt: number;
}

function key(noteId: string): string {
  return `${PREFIX}${noteId}`;
}

export function saveNoteDraft(noteId: string, draft: Omit<NoteDraft, 'savedAt'>): void {
  if (!noteId || typeof window === 'undefined') return;
  try {
    const payload = JSON.stringify({ ...draft, savedAt: Date.now() } satisfies NoteDraft);
    if (payload.length > MAX_DRAFT_BYTES) return;
    localStorage.setItem(key(noteId), payload);
  } catch {
    /* quota / serialization — best effort */
  }
}

export function getNoteDraft(noteId: string): NoteDraft | null {
  if (!noteId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key(noteId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NoteDraft;
    if (typeof parsed?.content !== 'string' || typeof parsed?.title !== 'string') return null;
    if (typeof parsed.savedAt === 'number' && Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      clearNoteDraft(noteId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearNoteDraft(noteId: string): void {
  if (!noteId || typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key(noteId));
  } catch {
    /* ignore */
  }
}

/**
 * Whether restoring this draft deserves a toast.
 *
 * The draft writer runs on a tight debounce and saves take seconds, so refreshing while
 * typing almost always leaves a draft a few seconds newer than the server — restoring it
 * is routine continuation, not an event, and announcing it every time taught users to
 * ignore the message. A draft that has sat for minutes is different: that is a crash or
 * an abandoned tab, and silently diverging from what the user last remembers seeing is
 * worse than one toast.
 */
export const DRAFT_RESTORE_ANNOUNCE_AFTER_MS = 5 * 60_000;

export function shouldAnnounceDraftRestore(savedAt: number, now: number = Date.now()): boolean {
  if (!Number.isFinite(savedAt)) return true;
  return now - savedAt >= DRAFT_RESTORE_ANNOUNCE_AFTER_MS;
}
