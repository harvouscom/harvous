/**
 * The All tab's merger.
 *
 * Two of these guard mistakes that would be invisible in the UI until someone noticed a
 * row missing: the thread-id collision (a cluster's id *is* a note id) and the pinned-note
 * hoist that `sortNotesByLastUpdated` would have introduced.
 */
import { describe, expect, it } from 'vitest';
import { buildLibraryAllItems, type LibraryAllInput } from '../library-all-items';

const EMPTY: LibraryAllInput = {
  notes: [],
  folders: [],
  highlights: [],
  threads: [],
  scriptureBooks: [],
  resources: [],
};

describe('recency per kind', () => {
  it('takes the newest of updatedAt and createdAt for a note', () => {
    const [item] = buildLibraryAllItems({
      ...EMPTY,
      notes: [{ id: 'n1', title: 'A', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' }],
    });
    expect(item!.recencyMs).toBe(Date.parse('2026-06-01T00:00:00Z'));
  });

  it('derives a scripture book from the newest note across its passages', () => {
    // A book carries no timestamp of its own, so it inherits one or it cannot be ranked.
    const [item] = buildLibraryAllItems({
      ...EMPTY,
      scriptureBooks: [
        {
          bookOrder: 45,
          title: 'Romans',
          passages: [
            { notes: [{ updatedAt: '2026-02-01T00:00:00Z' }] },
            { notes: [{ updatedAt: '2026-08-01T00:00:00Z' }, { updatedAt: '2026-03-01T00:00:00Z' }] },
          ],
        },
      ],
    });
    expect(item!.recencyMs).toBe(Date.parse('2026-08-01T00:00:00Z'));
    expect(item!.scriptureBookOrder).toBe(45);
  });

  it('accepts a Date as well as an ISO string for resources', () => {
    const [item] = buildLibraryAllItems({
      ...EMPTY,
      resources: [{ id: 'r1', title: 'A link', updatedAt: new Date('2026-05-01T00:00:00Z') }],
    });
    expect(item!.recencyMs).toBe(Date.parse('2026-05-01T00:00:00Z'));
  });
});

describe('items with no usable timestamp are dropped', () => {
  it('drops a thread whose updatedAt is null', () => {
    // Personal clusters really do have `updatedAt: string | null`, and a dateless row at
    // the bottom of a recency list is noise rather than information.
    const items = buildLibraryAllItems({
      ...EMPTY,
      threads: [{ id: 't1', title: 'Grace', updatedAt: null }],
    });
    expect(items).toHaveLength(0);
  });

  it('drops an unparseable timestamp rather than flooring it to zero', () => {
    const items = buildLibraryAllItems({
      ...EMPTY,
      notes: [{ id: 'n1', title: 'A', updatedAt: 'not a date' }],
    });
    expect(items).toHaveLength(0);
  });

  it('drops a scripture book nobody has written a note in', () => {
    const items = buildLibraryAllItems({
      ...EMPTY,
      scriptureBooks: [{ bookOrder: 45, title: 'Romans', passages: [{ notes: [] }] }],
    });
    expect(items).toHaveLength(0);
  });
});

describe('dedup', () => {
  it('keeps a note and a Thread that share an id', () => {
    // A personal cluster's id IS its representative note's id. Keying on the bare id
    // would have one of these silently swallow the other.
    const items = buildLibraryAllItems({
      ...EMPTY,
      notes: [{ id: 'shared', title: 'The note', updatedAt: '2026-06-01T00:00:00Z' }],
      threads: [{ id: 'shared', title: 'The Thread', updatedAt: '2026-06-02T00:00:00Z' }],
    });
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id).sort()).toEqual(['note:shared', 'thread:shared']);
  });

  it('collapses a repeated id within one kind, keeping the newer', () => {
    const items = buildLibraryAllItems({
      ...EMPTY,
      notes: [
        { id: 'n1', title: 'Older', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 'n1', title: 'Newer', updatedAt: '2026-07-01T00:00:00Z' },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Newer');
  });

  it('does not collapse a highlight into the note it annotates', () => {
    const items = buildLibraryAllItems({
      ...EMPTY,
      notes: [{ id: 'n1', title: 'A note', updatedAt: '2026-06-01T00:00:00Z' }],
      highlights: [{ id: 'n1', title: 'A highlight', recencyIso: '2026-06-01T00:00:00Z' }],
    });
    expect(items).toHaveLength(2);
  });
});

describe('ordering', () => {
  it('is newest first across kinds', () => {
    const items = buildLibraryAllItems({
      ...EMPTY,
      notes: [{ id: 'n1', title: 'note', updatedAt: '2026-03-01T00:00:00Z' }],
      highlights: [{ id: 'h1', title: 'highlight', recencyIso: '2026-08-01T00:00:00Z' }],
      resources: [{ id: 'r1', title: 'resource', updatedAt: '2026-05-01T00:00:00Z' }],
    });
    expect(items.map((i) => i.kind)).toEqual(['highlight', 'resource', 'note']);
  });

  it('does not hoist a pinned note — recency means recency', () => {
    // The trap `sortNotesByLastUpdated` would have introduced: it sorts pinned-first, and
    // a pinned note from March heading a "recent" list is the one lie this tab must avoid.
    const items = buildLibraryAllItems({
      ...EMPTY,
      notes: [
        { id: 'pinned', title: 'Pinned but old', updatedAt: '2026-03-01T00:00:00Z' },
        { id: 'fresh', title: 'Fresh', updatedAt: '2026-08-01T00:00:00Z' },
      ],
    });
    expect(items[0]!.sourceId).toBe('fresh');
  });

  it('breaks ties by kind then id, so the order is stable', () => {
    const at = '2026-06-01T00:00:00Z';
    const run = () =>
      buildLibraryAllItems({
        ...EMPTY,
        notes: [
          { id: 'b', title: 'B', updatedAt: at },
          { id: 'a', title: 'A', updatedAt: at },
        ],
        resources: [{ id: 'z', title: 'Z', updatedAt: at }],
      }).map((i) => i.id);
    expect(run()).toEqual(['note:a', 'note:b', 'resource:z']);
    expect(run()).toEqual(run());
  });
});

describe('limit', () => {
  it('applies after sorting, not before', () => {
    // Truncating first would drop the newest rows of whichever kind happened to be longest.
    const items = buildLibraryAllItems({
      ...EMPTY,
      notes: [
        { id: 'old1', title: 'old', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 'old2', title: 'old', updatedAt: '2026-01-02T00:00:00Z' },
      ],
      resources: [{ id: 'newest', title: 'newest', updatedAt: '2026-09-01T00:00:00Z' }],
      limit: 1,
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.sourceId).toBe('newest');
  });

  it('returns everything when no limit is given', () => {
    const items = buildLibraryAllItems({
      ...EMPTY,
      notes: Array.from({ length: 5 }, (_, i) => ({
        id: `n${i}`,
        title: 'n',
        updatedAt: '2026-06-01T00:00:00Z',
      })),
    });
    expect(items).toHaveLength(5);
  });
});

describe('folders in the merged list', () => {
  /*
   * Folders were missing from Everything entirely — the kind did not exist in the union, so
   * a tab called "Everything" quietly meant "everything except your folders".
   */
  const base = {
    notes: [],
    folders: [],
    highlights: [],
    threads: [],
    scriptureBooks: [],
    resources: [],
  } as const;

  it('includes a named folder, keyed apart from a note of the same name', () => {
    const items = buildLibraryAllItems({
      ...base,
      notes: [{ id: 'Assurance', title: 'Assurance', updatedAt: '2026-08-01T00:00:00Z' }],
      folders: [{ name: 'Assurance', count: 3, recencyIso: '2026-08-02T00:00:00Z' }],
    });
    expect(items.map((i) => i.id)).toEqual(['folder:Assurance', 'note:Assurance']);
  });

  it('drops Unsorted, which is a bucket rather than a thing to open', () => {
    const items = buildLibraryAllItems({
      ...base,
      folders: [{ name: null, count: 9, recencyIso: '2026-08-02T00:00:00Z' }],
    });
    expect(items).toEqual([]);
  });

  it('drops a folder with no resolvable recency rather than flooring it', () => {
    /* Same rule the other kinds follow: a dateless row at the bottom of a recency list is
       noise, not a result. */
    const items = buildLibraryAllItems({
      ...base,
      folders: [{ name: 'Orphan', count: 1 }],
    });
    expect(items).toEqual([]);
  });

  it('orders folders against everything else by recency alone', () => {
    const items = buildLibraryAllItems({
      ...base,
      notes: [{ id: 'n1', title: 'Older note', updatedAt: '2026-08-01T00:00:00Z' }],
      folders: [{ name: 'Newer folder', count: 1, recencyIso: '2026-08-05T00:00:00Z' }],
    });
    expect(items.map((i) => i.title)).toEqual(['Newer folder', 'Older note']);
  });
});
