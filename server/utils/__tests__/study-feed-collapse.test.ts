import { describe, expect, it } from 'vitest';
import {
  buildHighlightItems,
  buildNoteCreatedItems,
  buildNoteUpdatedItems,
  buildReadingItems,
  buildRevisitItems,
  studyFeedSnippet,
} from '../study-feed-collapse';

/** UTC, so row timestamps read the same wherever the suite runs. */
function ts(hour: number, minute = 0): string {
  return new Date(Date.UTC(2026, 7, 27, hour, minute, 0)).toISOString();
}

describe('studyFeedSnippet', () => {
  it('reduces note HTML to plain text', () => {
    expect(studyFeedSnippet('<p>No condemnation</p>')).toBe('No condemnation');
    expect(studyFeedSnippet(null)).toBe('');
  });

  const pill = (ref: string, translation = 'NLT') =>
    `<span data-scripture-reference="${ref}" data-note-id="n1" data-scripture-translation="${translation}" class="scripture-pill">${ref}</span>`;

  it('keeps a pill and the next paragraph apart', () => {
    // The row Derek saw: "Exodus 32:1-35 NLTPs JaredWhat is w…"
    const html = `<p>${pill('Exodus 32:1-35')}</p><p>Ps Jared</p><p>What is worship?</p>`;
    expect(studyFeedSnippet(html)).toBe('Exodus 32:1-35 NLT Ps Jared What is worship?');
  });

  it('keeps a pill and the words straight after it apart', () => {
    expect(studyFeedSnippet(`<p>${pill('John 3:16')}For God so loved</p>`)).toBe(
      'John 3:16 NLT For God so loved',
    );
  });

  it('does not push a space before punctuation after a pill', () => {
    expect(studyFeedSnippet(`<p>Read ${pill('John 3:16')}, then pray</p>`)).toBe(
      'Read John 3:16 NLT, then pray',
    );
  });

  it('treats a hard break as a space', () => {
    expect(studyFeedSnippet('<p>First line<br>Second line</p>')).toBe('First line Second line');
  });
});

describe('buildNoteCreatedItems', () => {
  it('emits one moment per note and skips rows with no usable timestamp', () => {
    const items = buildNoteCreatedItems([
      { id: 'n1', title: 'Romans 8', content: '<p>Free</p>', createdAt: ts(9) },
      { id: 'n2', title: null, content: null, createdAt: null },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'note-created:n1', kind: 'note-created', noteId: 'n1' });
  });
});

describe('buildNoteUpdatedItems', () => {
  it('collapses a burst of saves into one moment carrying the newest text', () => {
    const items = buildNoteUpdatedItems(
      [
        { noteId: 'n1', createdAt: ts(9, 40), title: 'Final', content: '<p>Final</p>' },
        { noteId: 'n1', createdAt: ts(9, 20), title: 'Middle', content: '<p>Middle</p>' },
        { noteId: 'n1', createdAt: ts(9, 0), title: 'First', content: '<p>First</p>' },
      ],
      new Map(),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'note-updated',
      at: ts(9, 40),
      startAt: ts(9, 0),
      title: 'Final',
      saveCount: 3,
    });
  });

  it('splits bursts separated by more than the burst gap', () => {
    const items = buildNoteUpdatedItems(
      [
        { noteId: 'n1', createdAt: ts(20), title: 'Evening', content: '' },
        { noteId: 'n1', createdAt: ts(9), title: 'Morning', content: '' },
      ],
      new Map(),
    );
    expect(items).toHaveLength(2);
  });

  it('suppresses the burst that is the note being written', () => {
    const items = buildNoteUpdatedItems(
      [
        { noteId: 'n1', createdAt: ts(9, 30), title: 'Draft', content: '' },
        { noteId: 'n1', createdAt: ts(9, 2), title: 'Draft', content: '' },
      ],
      new Map([['n1', ts(9, 0)]]),
    );
    expect(items).toEqual([]);
  });

  it('still reports a later edit of a note created earlier', () => {
    const items = buildNoteUpdatedItems(
      [{ noteId: 'n1', createdAt: ts(20), title: 'Revised', content: '' }],
      new Map([['n1', ts(9)]]),
    );
    expect(items).toHaveLength(1);
    expect(items[0].saveCount).toBe(1);
  });
});

describe('buildHighlightItems', () => {
  const base = {
    highlightAccentRaw: 'warmAmber',
    sourceSnippet: '',
    anchorQuote: null,
    scriptureReference: null,
    scripturePassageTranslation: null,
    scripturePassageExcerpt: null,
    createdAt: ts(9),
  };

  it('splits reader highlights from note highlights', () => {
    const items = buildHighlightItems(
      [
        {
          ...base,
          id: 'h1',
          parentNoteId: null,
          scriptureReference: 'John 15:5',
          scripturePassageTranslation: 'ESV',
          scripturePassageExcerpt: 'I am the vine',
        },
        { ...base, id: 'h2', parentNoteId: 'n1', anchorQuote: 'abiding is ordinary' },
      ],
      new Map([['n1', 'On abiding']]),
    );
    expect(items.map((i) => i.kind)).toEqual(['highlight-scripture', 'highlight-note']);
    expect(items[0]).toMatchObject({ reference: 'John 15:5', excerpt: 'I am the vine' });
    expect(items[1]).toMatchObject({ noteId: 'n1', noteTitle: 'On abiding' });
  });

  it('takes the curly quote marks off a stored quote', () => {
    const [item] = buildHighlightItems(
      [{ ...base, id: 'h4', parentNoteId: 'n1', anchorQuote: '“abiding is ordinary”', anchorStatus: 'resolved' }],
      new Map(),
    );
    expect(item.excerpt).toBe('abiding is ordinary');
  });

  it('falls back to the snippet when the quote cleans down to a scrap', () => {
    // The row Derek saw: `“ship? “”`.
    const [item] = buildHighlightItems(
      [
        {
          ...base,
          id: 'h5',
          parentNoteId: 'n1',
          anchorQuote: 'ship? “',
          anchorStatus: 'resolved',
          sourceSnippet: 'Who is steering this ship? Not me.',
        },
      ],
      new Map(),
    );
    expect(item.excerpt).toBe('Who is steering this ship? Not me.');
  });

  it('falls back to the snippet when the anchor is detached', () => {
    const [item] = buildHighlightItems(
      [
        {
          ...base,
          id: 'h6',
          parentNoteId: 'n1',
          anchorQuote: 'words that were since rewritten',
          anchorStatus: 'detached',
          sourceSnippet: 'what the note said when it was kept',
        },
      ],
      new Map(),
    );
    expect(item.excerpt).toBe('what the note said when it was kept');
  });

  it('keeps a short quote when there is no snippet to fall back to', () => {
    const [item] = buildHighlightItems(
      [{ ...base, id: 'h7', parentNoteId: 'n1', anchorQuote: '“Selah”', anchorStatus: 'resolved' }],
      new Map(),
    );
    expect(item.excerpt).toBe('Selah');
  });

  it('drops a highlight with nothing to quote', () => {
    expect(buildHighlightItems([{ ...base, id: 'h3', parentNoteId: 'n1' }], new Map())).toEqual([]);
  });
});

describe('buildReadingItems', () => {
  const row = (chapter: number, when: string, dwellBucket = 'read', bookOrder = 42) => ({
    book: 'John',
    bookOrder,
    chapter,
    translation: 'ESV',
    dwellBucket,
    createdAt: when,
  });

  it('collapses a run through one book into a single session in reading order', () => {
    const items = buildReadingItems([row(17, ts(9, 40)), row(16, ts(9, 20)), row(15, ts(9, 0))]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ book: 'John', chapters: [15, 16, 17], at: ts(9, 40) });
  });

  it('collapses a sitting that moved between books, however the rows interleave', () => {
    // The failure this guards: grouping by book before cutting sittings leaves no two rows
    // of one book adjacent, so nothing collapses and an hour of study arrives as six lines.
    const items = buildReadingItems([
      row(5, ts(21, 50), 'study', 1),
      row(103, ts(21, 20), 'read', 18),
      row(5, ts(21, 10), 'read', 1),
      row(104, ts(20, 45), 'read', 18),
      row(17, ts(20, 25), 'read', 1),
      row(103, ts(20, 5), 'read', 18),
    ]);
    expect(items).toHaveLength(2);
    const exodus = items.find((i) => i.bookOrder === 1)!;
    const psalms = items.find((i) => i.bookOrder === 18)!;
    expect(exodus.chapters).toEqual([5, 17]);
    expect(exodus.dwellBucket).toBe('study');
    expect(psalms.chapters).toEqual([103, 104]);
  });

  it('keeps the strongest dwell bucket seen in the session', () => {
    const items = buildReadingItems([row(16, ts(9, 20)), row(15, ts(9, 0), 'study')]);
    expect(items[0].dwellBucket).toBe('study');
  });

  it('drops glances and splits on book change or a long gap', () => {
    expect(buildReadingItems([row(1, ts(9), 'glance')])).toEqual([]);
    expect(buildReadingItems([row(1, ts(9, 20), 'read', 18), row(15, ts(9, 0))])).toHaveLength(2);
    expect(buildReadingItems([row(16, ts(14)), row(15, ts(9))])).toHaveLength(2);
  });
});

describe('buildRevisitItems', () => {
  const visit = (when: string, dwellBucket = 'study', noteId = 'n1') => ({
    noteId,
    dwellBucket,
    createdAt: when,
  });

  it('collapses returns within the gap and counts them', () => {
    const items = buildRevisitItems([visit(ts(9, 30)), visit(ts(9, 10))], []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ noteId: 'n1', visitCount: 2, at: ts(9, 30) });
  });

  it('admits only a real sit — glances and passing reads are navigation', () => {
    expect(buildRevisitItems([visit(ts(9), 'glance')], [])).toEqual([]);
    expect(buildRevisitItems([visit(ts(9), 'read')], [])).toEqual([]);
  });

  it('drops a visit that overlaps a writing session on the same note', () => {
    const items = buildRevisitItems([visit(ts(9, 30))], [
      { noteId: 'n1', startMs: Date.parse(ts(9)), endMs: Date.parse(ts(10)) },
    ]);
    expect(items).toEqual([]);
  });

  it('keeps a visit outside the writing session', () => {
    const items = buildRevisitItems([visit(ts(20))], [
      { noteId: 'n1', startMs: Date.parse(ts(9)), endMs: Date.parse(ts(10)) },
    ]);
    expect(items).toHaveLength(1);
  });
});
