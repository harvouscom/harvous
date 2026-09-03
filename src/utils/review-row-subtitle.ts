import { NOTE_WRITTEN_SOURCE } from '@/utils/study-bible-source-copy';
import { NOTE_RECOGNIZE_STEP, VERSE_LOCATE_STEP } from '@/utils/review-prompts';

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
 * What it shows, in order:
 *
 * 1. **The note's own opening words** (`noteContext`), which is the line the scripture row has
 *    always had — the reference on top, a fragment of the verse beneath. A note deserves the
 *    same, and this is the most context per character available without opening it.
 * 2. Its title or the passage it cites, when there is no body to quote and the question has
 *    not already named it.
 * 3. The date it was written. Last resort and only that: it says when, not what, and "Written
 *    Jul 10" turned out to be no more use than saying nothing.
 */

const WRITTEN_PREFIX = 'Written ';

export interface ReviewRowSubtitleInput {
  prompt: string;
  /** Needed to know whether this row's question is one with a right answer. */
  kind?: string | null;
  ladderStep?: number | null;
  /** Server-resolved: title, else the note's opening line, else the passage it cites. */
  noteLabel?: string | null;
  /** The note's own opening words. Preferred over everything else — it is the context line. */
  noteContext?: string | null;
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
  /*
   * Nothing at all when the identity line *is* the answer — "Where is this from?" with
   * "John 15:5" underneath is not a question, and neither is "Which of your notes says this?"
   * above the note's name.
   *
   * Only those two rungs. Suppressing it for every graded rung was too much: "What did you link
   * this to?" with nothing beneath it does not say which note is being asked about, so the
   * reader cannot answer it either. A right answer is not a reason to withhold the question.
   */
  if (rungIdentityIsTheAnswer(item)) return null;

  // The note's own words win outright: the question above names the note, this shows it.
  const context = item.noteContext?.trim();
  if (context) return context;

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
 * "You wrote this" earns its place on a row that would otherwise say nothing about where the
 * question came from. Beside the note's own sentence it says nothing at all — the reader can
 * see whose words those are — and beside "Written 10 Jul" it is the same fact twice.
 *
 * Every other reason survives, because each says something the context line does not: "Marked
 * Romans 1:7 in a note", "You linked these notes", "You opened this again".
 */
export function reviewRowSource(
  item: { sourceLabel?: string | null },
  subtitle: string | null,
): string | null {
  const source = item.sourceLabel?.trim() || null;
  if (!source || !subtitle) return source;
  return source === NOTE_WRITTEN_SOURCE ? null : source;
}

/**
 * Is this row's question one the app marks?
 *
 * Every note rung is a multiple choice. Two verse rungs are: put the phrases back in order, and
 * say which passage a fragment came from. On all of them the row's usual context line would
 * give the answer away before the reader opened the card.
 */
export function rungIdentityIsTheAnswer(item: {
  kind?: string | null;
  ladderStep?: number | null;
}): boolean {
  // "Which of your notes says this?" — the note's identity is the whole answer.
  if (item.kind === 'note') return item.ladderStep === NOTE_RECOGNIZE_STEP;
  // "Where is this from?" — so is the reference.
  return item.kind === 'verse' && item.ladderStep === VERSE_LOCATE_STEP;
}
