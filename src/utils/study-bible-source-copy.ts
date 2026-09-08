/**
 * Provenance lines for the Study Bible layer — "why is this here?" in one phrase.
 *
 * These strings end up on Review rows, which is the whole reason they exist: a queue that
 * cannot say where its questions came from reads as a task list someone else wrote. "You
 * highlighted this while reading John 15" reads as your own study coming back.
 *
 * Rules the copy obeys, all of them from the strategy doc:
 * - Never a count of what is left. "3 due" is the failure mode the feature is designed against.
 * - Past tense about what the reader did, never an instruction about what they should do.
 * - "Thread" is capitalized, always (npm run check:thread-terminology enforces it).
 * - No "inbox", no "queue", no "task".
 */

/** "Read Romans 8" — the reader turned to a chapter. */
export const readChapterSource = (book: string, chapter: number) => `Read ${book} ${chapter}`;

/** "Highlighted while reading John 15:5" — the reader marked something in the reader. */
export const highlightSource = (reference: string) => `Highlighted while reading ${reference}`;

/** "Marked in a note" — a highlight anchored to their own writing rather than the reader. */
export const noteHighlightSource = (reference: string) => `Marked ${reference} in a note`;

/** "You wrote about this" — a note they made or came back to. */
export const NOTE_WRITTEN_SOURCE = 'You wrote this';
export const NOTE_OPENED_SOURCE = 'You opened this again';
export const NOTE_EXPANDED_SOURCE = 'You added to this';

/** "Cited in Covenant and kingship" — a scripture pill inside one of their notes. */
export const citedInNoteSource = (title: string | null | undefined) => {
  const trimmed = title?.trim();
  return trimmed ? `Cited in ${trimmed}` : 'Cited in a note';
};

/** The strongest signal short of writing: the reader drew the line themselves. */
export const LINKED_NOTES_SOURCE = 'You linked these notes';

/** Naming a Thread is the reader saying what the whole cluster is. */
export const THREAD_NAMED_SOURCE = 'You named this Thread';
export const THREAD_FORMING_SOURCE = 'A Thread is forming here';

/** After an answer, so the row explains itself on the way back round. */
export const REVIEWED_SOURCE = 'You reviewed this';

/** Came back through a Home suggestion rather than by searching for it. */
export const RESURFACED_SOURCE = 'You came back to this from Home';
