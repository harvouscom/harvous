/**
 * What kind of exercise a question is, said in one word and one glyph.
 *
 * Review asks twenty-six different things and never told the reader which it was about to ask.
 * That is fine in the moment — the prompt is a plain instruction and needs no label to be
 * followed — but it left two gaps. A shelf of rows all read as questions with no sense of which
 * would be a tap and which would be typing, so there was no way to pick the one you had a minute
 * for. And a reader who wanted more or less of something had no name to ask for it by.
 *
 * So this is a naming, not a taxonomy. The label is the word a reader would use — "Blanks",
 * "Where", "Who" — and several prompt keys share one where they are the same *act* wearing
 * different material: `verse.person` and `chapter.person` are both "Who", because being asked who
 * is in John 3 and who Romans 8:28 is about is the same thing to do.
 *
 * **It has to name the act, not the provenance.** Four of these were written as descriptions of
 * where the material came from rather than of what the reader is about to do — "Cited", "Linked",
 * "Opening", "Order". Sat in the dock's header beside the word Review, "Review · Cited" told
 * nobody anything: it is a past participle about the app's own bookkeeping. The test is whether
 * the label finishes the sentence "you are about to…" — "how it begins", "which passage", "put in
 * order" all do; "cited" does not.
 *
 * **The label must never be the answer.** Two keys prove the rule: `note.recognize` is "Which
 * note" and not the note's name, and `verse.locate` is "Where" and not the reference. A family
 * name says what you are about to do, never what the answer will turn out to be.
 *
 * Pure and client-safe. The server sends the resolved family on the item so the client never has
 * to re-derive a rung — the drift that `verseRungFor`'s docblock warns about, in a new place.
 */

import type { ReviewPromptKey } from '@/utils/review-prompts';

/** The glyph names here must exist in `@/components/react/Icon`; a test asserts it. */
export type ReviewExerciseIcon =
  | 'pen'
  | 'keyboard'
  | 'list-ol'
  | 'location-dot'
  | 'person'
  | 'quote-left'
  | 'arrows-left-right'
  | 'arrow-right-arrow-left'
  | 'note-sticky'
  | 'book-open'
  | 'magnifying-glass'
  | 'highlighter'
  | 'tag'
  | 'scroll'
  | 'link'
  | 'book'
  | 'compass';

export interface ReviewExerciseFamily {
  /** Stable across renames of the label, because preferences are stored against it. */
  id: string;
  /** The word shown to the reader. Short enough to sit in a row's meta line. */
  label: string;
  icon: ReviewExerciseIcon;
  /** One line for the settings page, saying what the reader will actually be doing. */
  description: string;
  /** True where the reader types rather than taps; the rows that take longer. */
  typed: boolean;
}

export const REVIEW_EXERCISE_FAMILIES = {
  blanks: {
    id: 'blanks',
    label: 'Blanks',
    icon: 'pen',
    description: 'Type the missing words back into a verse.',
    typed: true,
  },
  letters: {
    id: 'letters',
    label: 'First letters',
    icon: 'keyboard',
    description: 'Rebuild a verse from the first letter of every word.',
    typed: true,
  },
  memory: {
    id: 'memory',
    label: 'From memory',
    icon: 'keyboard',
    description: 'Write a verse out, or name a few of its words.',
    typed: true,
  },
  order: {
    id: 'order',
    label: 'Put in order',
    icon: 'list-ol',
    description: 'Put a verse, or three verses of a chapter, back in order.',
    typed: false,
  },
  next: {
    id: 'next',
    label: 'What follows',
    icon: 'arrows-left-right',
    description: 'Pick the verse that comes next, or which of two comes first.',
    typed: false,
  },
  opening: {
    id: 'opening',
    label: 'How it begins',
    icon: 'quote-left',
    description: 'Pick how a verse begins, or which verse is in a chapter.',
    typed: false,
  },
  where: {
    id: 'where',
    label: 'Where',
    icon: 'location-dot',
    description: 'Say which passage a line is from, or which book.',
    typed: false,
  },
  who: {
    id: 'who',
    label: 'Who',
    icon: 'person',
    description: 'Pick who a passage is about, or who appears in a chapter.',
    typed: false,
  },
  place: {
    id: 'place',
    label: 'Places',
    icon: 'compass',
    description: 'Pick a place a passage names.',
    typed: false,
  },
  theme: {
    id: 'theme',
    label: 'Theme',
    icon: 'tag',
    description: 'Pick a theme the index carries on a verse.',
    typed: false,
  },
  crossref: {
    id: 'crossref',
    label: 'Cross-reference',
    icon: 'link',
    description: 'Pick the passage a verse is cross-referenced with.',
    typed: false,
  },
  changed: {
    id: 'changed',
    label: 'Changed word',
    icon: 'magnifying-glass',
    description: 'One word has been altered. Find it.',
    typed: false,
  },
  marked: {
    id: 'marked',
    label: 'What you marked',
    icon: 'highlighter',
    description: 'Find the words, or the verse, you highlighted while reading.',
    typed: false,
  },
  note: {
    id: 'note',
    label: 'Which note',
    icon: 'note-sticky',
    description: 'Pick which of your notes a line is from.',
    typed: false,
  },
  cited: {
    id: 'cited',
    label: 'Which passage',
    icon: 'scroll',
    description: 'Pick a passage you cited in a note, or the one you wrote a highlight on.',
    typed: false,
  },
  linked: {
    id: 'linked',
    label: 'What you linked',
    icon: 'arrow-right-arrow-left',
    description: 'Pick a note you linked to this one, or the note you cited a verse in.',
    typed: false,
  },
} as const satisfies Record<string, ReviewExerciseFamily>;

export type ReviewExerciseFamilyId = keyof typeof REVIEW_EXERCISE_FAMILIES;

/**
 * Which family each rung belongs to.
 *
 * Exhaustive by type: a new prompt key will not compile until it is named here, which is the
 * point. A rung with no family would reach the shelf wearing whatever the fallback happened to
 * be, and the settings page would offer no way to ask for less of it.
 */
const FAMILY_BY_KEY: Record<ReviewPromptKey, ReviewExerciseFamilyId> = {
  'note.recognize': 'note',
  'note.passage': 'cited',
  'note.annotation': 'cited',
  'note.connect': 'linked',
  'verse.connect': 'linked',

  'verse.recognize': 'opening',
  'chapter.verse': 'opening',

  'verse.rebuild': 'blanks',
  'chapter.finish': 'blanks',
  'verse.initials': 'letters',

  'verse.recall': 'memory',
  'verse.keywords': 'memory',

  'verse.next': 'next',
  'verse.before': 'next',

  'verse.sequence': 'order',
  'chapter.order': 'order',

  'verse.locate': 'where',
  'verse.book': 'where',

  'verse.person': 'who',
  'chapter.person': 'who',
  'verse.place': 'place',
  'chapter.place': 'place',

  'verse.theme': 'theme',
  'verse.crossref': 'crossref',
  'verse.altered': 'changed',

  'verse.marked': 'marked',
  'chapter.marked': 'marked',
};

/** Where a rung has somehow arrived unnamed — an old stored key, say — this is the safe word. */
const FALLBACK: ReviewExerciseFamilyId = 'opening';

export function reviewExerciseFamilyId(key: string | null | undefined): ReviewExerciseFamilyId {
  if (!key) return FALLBACK;
  return FAMILY_BY_KEY[key as ReviewPromptKey] ?? FALLBACK;
}

export function reviewExerciseFamily(key: string | null | undefined): ReviewExerciseFamily {
  return REVIEW_EXERCISE_FAMILIES[reviewExerciseFamilyId(key)];
}

/** Every rung in a family, for the settings page and for the skip rules. */
export function reviewPromptKeysInFamily(id: ReviewExerciseFamilyId): ReviewPromptKey[] {
  return (Object.keys(FAMILY_BY_KEY) as ReviewPromptKey[]).filter(
    (key) => FAMILY_BY_KEY[key] === id,
  );
}

/**
 * The families in the order the settings page lists them: what a reader meets first, first.
 *
 * Roughly the shape of the ladder — recognise, fill in, recall, place in sequence, then the
 * context rungs — rather than alphabetical, which would put "Blanks" beside "Changed word" and
 * tell the reader nothing about how the two relate.
 */
export const REVIEW_EXERCISE_FAMILY_ORDER: ReviewExerciseFamilyId[] = [
  'opening',
  'blanks',
  'letters',
  'memory',
  'next',
  'order',
  'where',
  'changed',
  'who',
  'place',
  'theme',
  'crossref',
  'marked',
  'note',
  'cited',
  'linked',
];
