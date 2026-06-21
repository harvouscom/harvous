import { describe, expect, it } from 'vitest';
import {
  activeSearchSectionHeader,
  buildActiveViewResults,
  buildElsewhereResults,
  buildFoldersFromNotes,
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
