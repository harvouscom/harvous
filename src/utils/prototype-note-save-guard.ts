import { canonicalizeNoteHtmlLineBreaks } from './note-html-linebreaks';
import { isTiptapBodyEmpty } from './prototype-note-empty';

export type PrototypeUnloadSaveContext = {
  contentToSave: string;
  lastSavedContent: string | null;
  serverContent: string | null;
  draftContent: string | null;
};

function normalizedBody(html: string | null | undefined): string {
  if (html == null) return '';
  return canonicalizeNoteHtmlLineBreaks(html);
}

/**
 * Skip unload/pagehide saves that would PUT an empty body while a non-empty copy
 * is known from a prior save, server props, or local draft backstop.
 */
export function shouldSkipPrototypeUnloadSave(ctx: PrototypeUnloadSaveContext): boolean {
  if (!isTiptapBodyEmpty(normalizedBody(ctx.contentToSave))) return false;

  const knownBodies = [
    ctx.lastSavedContent,
    ctx.serverContent,
    ctx.draftContent,
  ].map(normalizedBody);

  return knownBodies.some((body) => !isTiptapBodyEmpty(body));
}

/** What an unload keepalive PUT last put on the wire, and when. */
export type PrototypeUnloadSendRecord = {
  noteId: string;
  title: string;
  content: string;
  collectionKey: string;
  /** `Date.now()` at the moment the request was issued. */
  at: number;
};

/**
 * How long an unload keepalive PUT suppresses an identical one.
 *
 * Long enough to collapse a burst of app switches on an unchanged note into a single
 * write; short enough that a genuine "background, come back, edit, background again"
 * cycle is never what gets swallowed — that path changes the payload, so it misses the
 * comparison below entirely.
 */
export const UNLOAD_RESEND_SUPPRESSION_MS = 10_000;

/**
 * True when this unload write would repeat one already sent for the same note.
 *
 * The editor's `protoLastSavedRef` cannot answer this. It is deliberately left stale
 * after an unload write, because that request is unverifiable — it can 409 or be dropped
 * outright, and marking it as saved would let a later save skip its dedup check and leave
 * the local draft as the only copy. So redundancy is tracked separately, as a log of what
 * was *sent* rather than a claim about what was stored.
 *
 * This matters on a phone and barely at all on a desktop: `visibilitychange -> hidden`
 * fires on every app switch, home swipe, notification pull, and screen lock, and each one
 * used to spend a write against the same per-user budget the autosave was already using.
 */
export function isRedundantUnloadResend(
  sent: PrototypeUnloadSendRecord | null,
  next: Omit<PrototypeUnloadSendRecord, 'at'>,
  now: number = Date.now(),
): boolean {
  if (!sent) return false;
  if (now - sent.at >= UNLOAD_RESEND_SUPPRESSION_MS) return false;
  return (
    sent.noteId === next.noteId &&
    sent.title === next.title &&
    sent.content === next.content &&
    sent.collectionKey === next.collectionKey
  );
}
