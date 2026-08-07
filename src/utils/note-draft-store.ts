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
  /**
   * The body this draft was written from was a known-incomplete list preview.
   *
   * Restoring such a draft over a full body silently truncates the note, so the seam it
   * was cut at travels with it: `previewHtml` is the prefix that was on screen and
   * `previewLength` its offset into the stored body, which is exactly what
   * `noteListPreviewTail` needs to reattach the missing tail. Absent on drafts written
   * from a complete body — and on drafts written before this field existed.
   */
  bodyTruncated?: boolean;
  previewHtml?: string;
  previewLength?: number;
  /**
   * Which page load wrote this draft. See `isDraftFromThisPageSession`.
   *
   * Absent on drafts written before this field existed, which are therefore treated as
   * foreign — the conservative reading, since a draft that predates this code can only
   * have come from an earlier page load anyway.
   */
  pageSessionId?: string;
}

/**
 * Identifies this page load. Regenerated on every reload, never persisted.
 *
 * A draft carrying this id was written by a session that is *still running* — so whatever
 * happened to it, the tab did not crash and the page was not reloaded. That distinction is
 * what separates "recover the user's lost work" from "resurrect a note we already saved",
 * and it holds no matter which code path remounts the editor.
 */
const PAGE_SESSION_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `s${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** True when this draft was written by the page load that is still running. */
export function isDraftFromThisPageSession(draft: NoteDraft | null | undefined): boolean {
  return !!draft && draft.pageSessionId === PAGE_SESSION_ID;
}

function key(noteId: string): string {
  return `${PREFIX}${noteId}`;
}

export function saveNoteDraft(noteId: string, draft: Omit<NoteDraft, 'savedAt'>): void {
  if (!noteId || typeof window === 'undefined') return;
  try {
    const payload = JSON.stringify({
      ...draft,
      savedAt: Date.now(),
      pageSessionId: PAGE_SESSION_ID,
    } satisfies NoteDraft);
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
