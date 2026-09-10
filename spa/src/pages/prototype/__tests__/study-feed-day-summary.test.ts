/**
 * The day sheet's sentence, assembled the way the page assembles it.
 *
 * These sheets are the surface a person reads first, and they are about to be photographed
 * for the site, so the sentence is copy now rather than debug output. It shipped as "You
 * spent this day [8 passages], from morning through evening" — the lead handed off to a
 * chip with nothing to join them — and a missing preposition is invisible in a builder that
 * returns three separate fields. So the assertion is on the assembled string, not on `lead`.
 */
import { describe, expect, it } from 'vitest';
import { summarizeStudyFeedDay } from '../study-feed-presentation';
import type { StudyFeedItem } from '@/utils/study-feed-items';

let seq = 0;

function note(): StudyFeedItem {
  return {
    id: `n${seq++}`,
    kind: 'note-created',
    at: '2026-08-30T09:00:00.000Z',
    noteId: `note-${seq}`,
    title: 'A note',
    snippet: '',
    scriptureRefs: [],
  } as StudyFeedItem;
}

function highlight(): StudyFeedItem {
  return {
    id: `h${seq++}`,
    kind: 'highlight-scripture',
    at: '2026-08-30T10:00:00.000Z',
    entryId: `e${seq}`,
    accent: 'gold',
    excerpt: 'For God so loved',
  } as StudyFeedItem;
}

function read(book: string): StudyFeedItem {
  return {
    id: `r${seq++}`,
    kind: 'passage-read',
    at: '2026-08-30T11:00:00.000Z',
    book,
    bookOrder: 45,
    chapters: [1],
    translation: 'ESV',
    dwellBucket: 'read',
  } as StudyFeedItem;
}

function revisit(): StudyFeedItem {
  return {
    id: `v${seq++}`,
    kind: 'note-revisited',
    at: '2026-08-30T12:00:00.000Z',
    noteId: `note-v${seq}`,
    title: 'Revisited',
    visitCount: 3,
  } as StudyFeedItem;
}

/** The same join `PrototypeStudyFeedPage` performs, with the chips as plain text. */
function sentence(items: StudyFeedItem[], options: { isToday: boolean; partsCount: number }) {
  const summary = summarizeStudyFeedDay(items, options);
  if (!summary) return null;
  const stats = summary.stats
    .map((stat, i) => (i === 0 ? '' : i === summary.stats.length - 1 ? ' and ' : ', ') + stat.label)
    .join('');
  const focus = summary.focus ? `, mostly in ${summary.focus}` : '';
  return `${summary.lead} ${stats}${focus}${summary.tail}.`;
}

describe('the day sheet sentence', () => {
  it('names an empty day as no sentence at all', () => {
    expect(summarizeStudyFeedDay([], { isToday: false, partsCount: 0 })).toBeNull();
  });

  it('joins the lead to the first chip on a past day', () => {
    expect(sentence([read('John'), read('Acts'), read('Luke')], { isToday: false, partsCount: 3 }))
      .toBe('You spent this day across 3 passages, from morning through evening.');
  });

  it('joins the lead to the first chip today', () => {
    expect(sentence([read('John')], { isToday: true, partsCount: 1 })).toBe(
      'Today, across 1 passage so far.',
    );
  });

  it('does not say "across" twice on a day spanning several parts', () => {
    const said = sentence([note(), highlight()], { isToday: true, partsCount: 3 })!;
    expect(said).toBe('Today, across 1 note and 1 highlight, through the day.');
    expect(said.match(/across/g)).toHaveLength(1);
  });

  it('reads as a sentence through every tail the builder can pick', () => {
    const cases = [
      // A book that dominates the day's reading, named in the tail.
      sentence([read('Romans'), read('Romans'), read('Romans')], { isToday: false, partsCount: 2 }),
      // The short past day, with neither a focus nor enough parts.
      sentence([note()], { isToday: false, partsCount: 1 }),
      // Every stat kind at once. Revisits are the fourth and only land when fewer than
      // three others did, so this day drops them — which is the builder's rule, not a slip.
      sentence([note(), highlight(), read('Mark'), revisit()], { isToday: false, partsCount: 4 }),
    ];
    expect(cases).toEqual([
      'You spent this day across 3 passages mostly in Romans.',
      'You spent this day across 1 note of study.',
      'You spent this day across 1 note, 1 highlight and 1 passage, from morning through evening.',
    ]);
  });

  it('never sets the full stop against a chip', () => {
    const said = sentence([note(), read('Mark')], { isToday: false, partsCount: 1 })!;
    expect(said.endsWith('of study.')).toBe(true);
  });
});
