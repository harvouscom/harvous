import { NOTE_WRITTEN_SOURCE } from '@/utils/study-bible-source-copy';

/**
 * The line under a review question that says *which* thing is being asked about.
 *
 * One implementation for all three places a review item is shown — the Review section on
 * Activity, the Review page, and the dock — because they had drifted into three different
 * answers to the same question, and one of those answers was "nothing at all".
 *
 * What went wrong, and the rule that comes out of it: a row read "What in the text itself led
 * you to write this note?" with no other identifier, because the note's title was the server's
 * auto-generated "Untitled Note 4" and display strips those. The prompt fell back to "this
 * note" and the subtitle was suppressed for being redundant with a title that did not exist.
 * The reader had a question about a note they could not name.
 *
 * So: the subtitle is only ever suppressed when the question *actually contains* the identity,
 * and there is always an identity to fall back to.
 *
 * Never a snippet of the note body. Previewing what someone wrote partly answers the question
 * being asked, which is the one thing a review row must not do.
 */

const WRITTEN_PREFIX = 'Written ';

export interface ReviewRowSubtitleInput {
  prompt: string;
  /** Title, else the first passage the note cites. Null when it has neither. */
  noteLabel?: string | null;
  noteTitle?: string | null;
  scriptureReference?: string | null;
  /** ISO date, the last resort for a note with no name and no passage. */
  noteWrittenAt?: string | null;
}

/** "9 Aug" / "9 Aug 2025" — formatted on the client, which is the only side that knows the zone. */
export function writtenAtLabel(iso: string, now: Date = new Date()): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/**
 * The identity line, or null when the question already carries it.
 *
 * `now` is injectable so the year-eliding date is testable.
 */
export function reviewRowSubtitle(
  item: ReviewRowSubtitleInput,
  now: Date = new Date(),
): string | null {
  const identity =
    item.noteLabel?.trim() || item.noteTitle?.trim() || item.scriptureReference?.trim() || null;

  if (identity) {
    // Suppressed only when the question really does name it — "what did you observe in My
    // journey?" does not need "My journey" repeated directly underneath.
    return item.prompt.includes(identity) ? null : identity;
  }

  // Nothing names this note, so place it in time rather than leaving the row anonymous.
  if (item.noteWrittenAt) {
    const written = writtenAtLabel(item.noteWrittenAt, now);
    if (written) return `${WRITTEN_PREFIX}${written}`;
  }
  return null;
}

/**
 * The "why is this here" line, dropped when the identity line already said it.
 *
 * A note with no name and no passage is placed in time — "Written 10 Jul" — and its reason for
 * being in the queue is that the reader wrote it. Printing both gives "Written 10 Jul · You
 * wrote this", which is one fact wearing two labels on a row that was meant to get shorter.
 */
export function reviewRowSource(
  item: { sourceLabel?: string | null },
  subtitle: string | null,
): string | null {
  const source = item.sourceLabel?.trim() || null;
  if (!source || !subtitle) return source;
  return subtitle.startsWith(WRITTEN_PREFIX) && source === NOTE_WRITTEN_SOURCE ? null : source;
}
