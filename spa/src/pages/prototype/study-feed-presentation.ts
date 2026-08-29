/**
 * How a study moment is drawn and worded.
 *
 * Split from the components so the wording can be read in one place and tested without
 * rendering anything.
 *
 * **The subject leads, not the sentence.** Moments were first written as sentences — "You
 * returned to Adoption", "You read John 3" — and a morning of them is a column that opens
 * with the same two words eleven times. The eye reads the drumbeat before it reads any of
 * the names, which makes a varied morning look like one repeated action. So a thing is named
 * by what it is, and what happened to it is said once, quietly, over the group.
 */

import type { IconName } from '@/components/react/Icon';
import { studyFeedItemWeight, type StudyFeedItem, type StudyFeedSubject } from '@/utils/study-feed-items';

const UNTITLED = 'Untitled note';

/**
 * The glyph vocabulary is the sidebar's own list modes — scripture wears the scroll it wears
 * there, a folder the folder. Somewhere to go should look the same wherever the app offers
 * to take you, and inventing a second set for the feed is how two icon languages start.
 */
const SUBJECT_ICONS: Record<StudyFeedSubject, IconName> = {
  note: 'note-sticky',
  scripture: 'scroll',
  folder: 'folder',
  highlight: 'highlighter',
  passage: 'book-open',
};

/** What a moment points at — which decides its glyph and where a tap goes. */
export function studyFeedItemSubject(item: StudyFeedItem): StudyFeedSubject {
  switch (item.kind) {
    case 'passage-read':
      return 'passage';
    case 'highlight-note':
    case 'highlight-scripture':
      return 'highlight';
    case 'note-created':
    case 'note-updated':
    case 'note-revisited':
      return item.noteType === 'scripture' ? 'scripture' : 'note';
    default:
      return 'note';
  }
}

export function studyFeedItemIcon(item: StudyFeedItem): IconName {
  return SUBJECT_ICONS[studyFeedItemSubject(item)];
}

/** "John 15–17", "John 15", "John 15, 17" — a session named the way it would be said. */
export function formatChapterRange(book: string, chapters: number[]): string {
  if (chapters.length === 0) return book;
  if (chapters.length === 1) return `${book} ${chapters[0]}`;

  const sorted = [...chapters].sort((a, b) => a - b);
  const isContiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  return isContiguous
    ? `${book} ${sorted[0]}–${sorted[sorted.length - 1]}`
    : `${book} ${sorted.join(', ')}`;
}

export function studyFeedCardTitle(item: StudyFeedItem): string {
  switch (item.kind) {
    case 'note-created':
    case 'note-updated':
    case 'space-note':
    case 'church-note':
      return item.title?.trim() || UNTITLED;
    default:
      return UNTITLED;
  }
}

/** The quiet line under a card: what happened to it, and who by when that is not you. */
export function studyFeedCardEyebrow(item: StudyFeedItem): string {
  switch (item.kind) {
    case 'note-created':
      return 'Written';
    case 'note-updated':
      return item.saveCount && item.saveCount > 1 ? 'Came back to this' : 'Edited';
    case 'space-note':
    case 'church-note':
      return `${item.actor.displayName} · ${item.space.title}`;
    default:
      return '';
  }
}

export interface StudyFeedRowCopy {
  /** The thing itself — a note's name, a passage, the words highlighted. */
  title: string;
  /** What happened to it. Dropped when the row above this one already said it. */
  verb: string;
  /** Where it lives or what it was, when there is something worth adding. */
  detail?: string;
  /** Set when the title is quoted words rather than a name. */
  quoted?: boolean;
}

export function studyFeedRowCopy(item: StudyFeedItem): StudyFeedRowCopy {
  switch (item.kind) {
    case 'highlight-scripture':
      return { title: item.excerpt, verb: 'Highlighted', detail: item.reference, quoted: true };
    case 'highlight-note':
      return {
        title: item.excerpt,
        verb: 'Highlighted',
        detail: item.noteTitle?.trim() || undefined,
        quoted: true,
      };
    case 'passage-read':
      return {
        title: formatChapterRange(item.book, item.chapters),
        verb: item.dwellBucket === 'study' ? 'Studied' : 'Read',
        detail: item.translation,
      };
    case 'note-revisited': {
      /*
       * Verb and object as one phrase, not two fields.
       *
       * The row joins its meta parts with a middot, which is right for peers — "Read · NLT"
       * is two facts about the same moment. "Returned to · Provision" is a verb cut from
       * its object, and the separator reads as a break in a sentence that has not finished.
       * Folderless notes keep the bare verb, which stands on its own.
       */
      const folder = item.folder?.trim();
      return {
        title: item.title?.trim() || UNTITLED,
        verb: folder ? `Returned to ${folder}` : 'Returned to',
        detail: undefined,
      };
    }
    default:
      return { title: studyFeedCardTitle(item), verb: '' };
  }
}

/** Clock time on the right edge of a moment — 9:14 PM, in the reader's locale. */
export function studyFeedClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Whether a moment is something made, which is what earns it the sheet's full voice. */
export function studyFeedIsSubstance(item: StudyFeedItem): boolean {
  return (
    studyFeedItemWeight(item.kind) === 'card' ||
    item.kind === 'highlight-note' ||
    item.kind === 'highlight-scripture'
  );
}

/** One measured fact about a day, ready to sit in a sentence as a chip. */
export interface StudyFeedDayStat {
  key: string;
  label: string;
}

export interface StudyFeedDaySummary {
  /** The opening words, before the first chip. */
  lead: string;
  stats: StudyFeedDayStat[];
  /** What the day was mostly about — a book, when one dominates it. */
  focus: string | null;
  /** The closing clause after the chips. */
  tail: string;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * A day, said in a sentence.
 *
 * Home's greeting does this for the account — "you keep coming back to Romans, with 27
 * notes saved" — and it is the warmest thing in the app, because a count in a sentence is a
 * fact about a person while a count in a stat block is a metric. A day deserves the same
 * treatment: what a sheet is *for* is recognising the day, and a list of rows makes you
 * reconstruct it while a sentence hands it to you.
 *
 * Tense follows distance. Today is still happening, so it reads as a progress note; a past
 * day is finished, so it is narrated. Both are assembled from the same counts — the only
 * thing that changes is the words around them.
 */
export function summarizeStudyFeedDay(
  items: StudyFeedItem[],
  options: { isToday: boolean; partsCount: number },
): StudyFeedDaySummary | null {
  if (items.length === 0) return null;

  const written = items.filter((i) => studyFeedItemWeight(i.kind) === 'card');
  const marks = items.filter(
    (i) => i.kind === 'highlight-note' || i.kind === 'highlight-scripture',
  );
  const reads = items.filter((i) => i.kind === 'passage-read');
  const returns = items.filter((i) => i.kind === 'note-revisited');

  const stats: StudyFeedDayStat[] = [];
  if (written.length > 0) {
    stats.push({ key: 'written', label: plural(written.length, 'note', 'notes') });
  }
  if (marks.length > 0) {
    stats.push({ key: 'marks', label: plural(marks.length, 'highlight', 'highlights') });
  }
  if (reads.length > 0) {
    stats.push({ key: 'reads', label: plural(reads.length, 'passage', 'passages') });
  }
  if (returns.length > 0 && stats.length < 3) {
    stats.push({ key: 'returns', label: `${plural(returns.length, 'note', 'notes')} revisited` });
  }

  /*
   * The book a day kept returning to, named only when it genuinely dominates. Two chapters
   * of Romans among six books is not what the day was about, and a summary that says so
   * every time stops being read.
   */
  const byBook = new Map<string, number>();
  for (const item of reads) {
    if (item.kind !== 'passage-read') continue;
    byBook.set(item.book, (byBook.get(item.book) ?? 0) + 1);
  }
  let focus: string | null = null;
  for (const [book, count] of byBook) {
    if (count >= 2 && count > reads.length / 2) focus = book;
  }

  /*
   * The sentence never ends on a chip. A pill carries its own padding, so a full stop set
   * against one always reads as detached — Home's greeting avoids this the same way, by
   * keeping words after its last stat.
   */
  // "Today" rather than "So far today": the tail already says "so far", and the sentence
  // was arriving with it at both ends.
  const lead = options.isToday ? 'Today' : 'You spent this day';
  const tail = options.isToday
    ? options.partsCount > 1
      ? ', across the day'
      : ' so far'
    : focus
      ? ` mostly in ${focus}`
      : options.partsCount > 2
        ? ', from morning through evening'
        : ' of study';

  return { lead, stats, focus: options.isToday ? focus : null, tail };
}
