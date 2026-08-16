import { describe, expect, it } from 'vitest';
import {
  activeSearchSectionHeader,
  buildActiveViewResults,
  buildElsewhereResults,
  buildFoldersFromNotes,
  elsewhereEmptyStateTitle,
  myHomeEmptyStateTitle,
  type ActiveSearchContext,
  type UniversalSearchData,
} from '../sidebar-universal-search';

const baseCtx: ActiveSearchContext = {
  mode: 'notes',
  folderDrill: undefined,
  threadDrillId: undefined,
  scriptureDrill: { level: 'books' },
  highlightKindFilter: 'all',
};

const sampleNotes = [
  {
    id: 'note_1',
    title: 'Romans study',
    content: '<p>Grace and faith</p>',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-02',
    primaryCollection: 'Work',
    secondaryCollections: [],
  },
  {
    id: 'note_2',
    title: 'Prayer list',
    content: '<p>Daily prayers</p>',
    createdAt: '2024-01-03',
    updatedAt: '2024-01-04',
    primaryCollection: null,
    secondaryCollections: [],
  },
] as UniversalSearchData['notes'];

const sampleData: UniversalSearchData = {
  notes: sampleNotes,
  folders: buildFoldersFromNotes(sampleNotes),
  highlights: [
    {
      id: 'hl_1',
      entryKind: 'miniNote',
      focusTitle: 'Grace',
      anchorTextSnapshot: 'saved grace',
      parentNoteId: 'note_1',
      parentNoteTitle: 'Romans study',
      miniNoteBody: '',
      sourceSnippet: '',
    },
  ] as UniversalSearchData['highlights'],
  scriptureBooks: [
    {
      bookOrder: 42,
      title: 'Romans',
      referenceCount: 2,
      noteCount: 1,
      passages: [
        {
          passageKey: 'Romans-8',
          displayRef: 'Romans 8',
          bookOrder: 42,
          chapter: 8,
          verseStart: 1,
          verseEnd: 39,
          referenceCount: 1,
          noteCount: 1,
          notes: [{ id: 'note_1', title: 'Romans study', updatedAt: null, createdAt: '2024-01-01' }],
        },
      ],
    },
  ],
  threadClusters: [
    {
      id: 'note_1',
      title: 'Romans cluster',
      suggestedTitle: null,
      hasCustomTitle: false,
      noteCount: 2,
      updatedAt: null,
      memberIds: ['note_1', 'note_2'],
    },
  ],
  threadDrillNodes: [],
};

describe('sidebar-universal-search', () => {
  it('buildActiveViewResults filters notes in notes mode', () => {
    const results = buildActiveViewResults(baseCtx, 'romans', sampleData, (c) => c.title ?? '');
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe('note');
    expect(results[0].noteId).toBe('note_1');
  });

  it('buildActiveViewResults fuzzy-matches note titles with typos', () => {
    const results = buildActiveViewResults(baseCtx, 'romns', sampleData, (c) => c.title ?? '');
    expect(results).toHaveLength(1);
    expect(results[0].noteId).toBe('note_1');
  });

  it('buildActiveViewResults returns empty for unrelated queries', () => {
    const results = buildActiveViewResults(baseCtx, 'zzzzxyzzy', sampleData, (c) => c.title ?? '');
    expect(results).toHaveLength(0);
  });

  it('activeSearchSectionHeader reflects folder drill', () => {
    const header = activeSearchSectionHeader({
      ...baseCtx,
      mode: 'folders',
      folderDrill: 'Work',
    });
    expect(header).toBe('In “Work”');
  });

  describe('elsewhereEmptyStateTitle', () => {
    it('uses tab context when Elsewhere type filter is All', () => {
      expect(
        elsewhereEmptyStateTitle(
          { ...baseCtx, mode: 'folders', folderDrill: undefined },
          'all',
        ),
      ).toBe('Nothing outside Folders');
    });

    it('uses per-type copy when Elsewhere type filter is specific', () => {
      expect(
        elsewhereEmptyStateTitle(
          { ...baseCtx, mode: 'folders', folderDrill: undefined },
          'notes',
        ),
      ).toBe('No notes found');
    });

    it('reflects folder drill when type filter is All', () => {
      expect(
        elsewhereEmptyStateTitle(
          { ...baseCtx, mode: 'folders', folderDrill: 'Work' },
          'all',
        ),
      ).toBe('Nothing outside “Work”');
    });

    it('uses threads copy when Elsewhere type filter is threads', () => {
      expect(
        elsewhereEmptyStateTitle(
          { ...baseCtx, mode: 'threads', threadDrillId: undefined },
          'threads',
        ),
      ).toBe('No threads found');
    });
  });

  describe('myHomeEmptyStateTitle', () => {
    it('uses generic copy when type filter is All', () => {
      expect(myHomeEmptyStateTitle('all')).toBe('Nothing in My Home');
    });

    it('uses per-type copy when type filter is specific', () => {
      expect(myHomeEmptyStateTitle('notes')).toBe('No notes found');
      expect(myHomeEmptyStateTitle('highlights')).toBe('No highlights found');
    });
  });

  it('buildElsewhereResults excludes active section ids', () => {
    const active = buildActiveViewResults(baseCtx, 'romans', sampleData, (c) => c.title ?? '');
    const exclude = new Set(active.map((r) => r.id));
    const elsewhere = buildElsewhereResults(
      'romans',
      sampleData,
      exclude,
      'all',
      (c) => c.title ?? '',
    );
    expect(elsewhere.some((r) => r.id === active[0]?.id)).toBe(false);
    expect(elsewhere.length).toBeGreaterThan(0);
  });

  it('buildActiveViewResults matches notes on tags alone', () => {
    // "In Notes" previously only saw title + body, so a tag-only hit resolved server-side
    // (Elsewhere) but never in the active view. Brings web to parity with native.
    const taggedNotes = [
      {
        id: 'note_tagged',
        title: 'Sunday gathering',
        content: '<p>No mention of the query in the body.</p>',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        primaryCollection: null,
        secondaryCollections: [],
        tags: ['discipleship', 'small group'],
      },
      {
        id: 'note_untagged',
        title: 'Grocery list',
        content: '<p>Milk and bread.</p>',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        primaryCollection: null,
        secondaryCollections: [],
      },
    ] as UniversalSearchData['notes'];

    const results = buildActiveViewResults(
      baseCtx,
      'discipleship',
      { ...sampleData, notes: taggedNotes },
      (c) => c.title ?? '',
    );
    expect(results.map((r) => r.noteId)).toEqual(['note_tagged']);
  });

  it('buildElsewhereResults keeps notes that match only on body content', () => {
    // Mirrors the real report: a note titled "Trust God every day" whose body says
    // "Ps Jeff …" showed under In Notes but vanished from Elsewhere, because the
    // final pass re-filtered candidates by title alone.
    const bodyOnlyNotes = [
      {
        id: 'note_body',
        title: 'Trust God every day',
        content: '<p>Ps Jeff — right now, what are you in your life…</p>',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        primaryCollection: null,
        secondaryCollections: [],
      },
    ] as UniversalSearchData['notes'];

    const elsewhere = buildElsewhereResults(
      'jeff',
      { ...sampleData, notes: bodyOnlyNotes, folders: [], highlights: [], scriptureBooks: [], threadClusters: [] },
      new Set(),
      'notes',
      (c) => c.title ?? '',
    );
    expect(elsewhere.map((r) => r.noteId)).toContain('note_body');
  });

  it('buildElsewhereResults surfaces FTS-only hits for already-loaded notes (tag matches)', () => {
    // A tag match resolves server-side only. The note is already in `notes`, so skipping
    // every loaded id used to drop it entirely.
    const loaded = [
      {
        id: 'note_tagged',
        title: 'Sunday gathering',
        content: '<p>No mention of the query here.</p>',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        primaryCollection: null,
        secondaryCollections: [],
      },
    ] as UniversalSearchData['notes'];

    const elsewhere = buildElsewhereResults(
      'discipleship',
      {
        ...sampleData,
        notes: loaded,
        folders: [],
        highlights: [],
        scriptureBooks: [],
        threadClusters: [],
        ftsNotes: [{ id: 'note_tagged', type: 'note', title: 'Sunday gathering' }] as UniversalSearchData['ftsNotes'],
      },
      new Set(),
      'notes',
      (c) => c.title ?? '',
    );
    expect(elsewhere.map((r) => r.noteId)).toContain('note_tagged');
  });

  it('buildElsewhereResults ranks title matches above body-only matches', () => {
    const notes = [
      {
        id: 'body_match',
        title: 'Zebra thoughts',
        content: '<p>Jeff preached on this</p>',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        primaryCollection: null,
        secondaryCollections: [],
      },
      {
        id: 'title_match',
        title: 'Jeff sermon notes',
        content: '<p>unrelated body</p>',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        primaryCollection: null,
        secondaryCollections: [],
      },
    ] as UniversalSearchData['notes'];

    const elsewhere = buildElsewhereResults(
      'jeff',
      { ...sampleData, notes, folders: [], highlights: [], scriptureBooks: [], threadClusters: [] },
      new Set(),
      'notes',
      (c) => c.title ?? '',
    );
    expect(elsewhere[0]?.noteId).toBe('title_match');
    expect(elsewhere.map((r) => r.noteId)).toContain('body_match');
  });

  it('elsewhere type filter limits kinds', () => {
    const elsewhere = buildElsewhereResults(
      'romans',
      sampleData,
      new Set(),
      'highlights',
      (c) => c.title ?? '',
    );
    expect(elsewhere.every((r) => r.kind === 'highlight')).toBe(true);
  });

  it('buildFoldersFromNotes includes unsorted bucket', () => {
    const folders = buildFoldersFromNotes(sampleNotes);
    expect(folders.some((f) => f.name === 'Work')).toBe(true);
    expect(folders.some((f) => f.name === null)).toBe(true);
  });

  it('buildFoldersFromNotes collapses apostrophe variants into one bucket', () => {
    const notes = [
      {
        id: 'n1',
        title: 'Carol one',
        content: '',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        primaryCollection: 'O’ Holy Night', // curly apostrophe
        secondaryCollections: [],
      },
      {
        id: 'n2',
        title: 'Carol two',
        content: '',
        createdAt: '2024-01-02',
        updatedAt: '2024-01-02',
        primaryCollection: "O' Holy Night", // straight apostrophe
        secondaryCollections: [],
      },
    ] as UniversalSearchData['notes'];
    const folders = buildFoldersFromNotes(notes);
    const holy = folders.filter((f) => (f.name ?? '').toLowerCase().includes('holy night'));
    expect(holy).toHaveLength(1);
    expect(holy[0].count).toBe(2);
    // Canonical display name is the first-seen original label (curly variant from n1).
    expect(holy[0].name).toBe('O’ Holy Night');
  });

  it('folder drill surfaces notes from every apostrophe variant of the folder', () => {
    const notes = [
      {
        id: 'n1',
        title: 'Carol one',
        content: '<p>x</p>',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        primaryCollection: 'O’ Holy Night', // curly
        secondaryCollections: [],
      },
      {
        id: 'n2',
        title: 'Carol two',
        content: '<p>y</p>',
        createdAt: '2024-01-02',
        updatedAt: '2024-01-02',
        primaryCollection: "O' Holy Night", // straight
        secondaryCollections: [],
      },
    ] as UniversalSearchData['notes'];
    const data: UniversalSearchData = { ...sampleData, notes, folders: buildFoldersFromNotes(notes) };
    // Drill into the straight-apostrophe variant; both notes must appear.
    const ctx: ActiveSearchContext = { ...baseCtx, mode: 'folders', folderDrill: "O' Holy Night" };
    const results = buildActiveViewResults(ctx, 'carol', data, (c) => c.title ?? '');
    expect(results.map((r) => r.noteId).sort()).toEqual(['n1', 'n2']);
  });

  it('buildFoldersFromNotes sorts named folders A–Z with Unsorted last', () => {
    const notes = [
      {
        id: 'note_a',
        title: 'Recent Z',
        content: '',
        createdAt: '2024-06-01',
        updatedAt: '2024-06-01',
        primaryCollection: 'Zeta',
        secondaryCollections: [],
      },
      {
        id: 'note_b',
        title: 'Old Alpha',
        content: '',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        primaryCollection: 'Alpha',
        secondaryCollections: [],
      },
      {
        id: 'note_c',
        title: 'Loose',
        content: '',
        createdAt: '2024-03-01',
        updatedAt: '2024-03-01',
        primaryCollection: null,
        secondaryCollections: [],
      },
    ] as UniversalSearchData['notes'];
    const folders = buildFoldersFromNotes(notes);
    expect(folders.map((f) => f.name)).toEqual(['Alpha', 'Zeta', null]);
  });
});
