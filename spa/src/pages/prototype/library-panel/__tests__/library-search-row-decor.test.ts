import { describe, expect, it } from 'vitest';
import { buildSearchRowDecor, type SearchRowDecorContext } from '../library-search-row-decor';
import type { SearchRowParts } from '../../PrototypeSidebarSearchResultItem';
import type { SpaceNoteRow } from '../../../../hooks/queries/useSpace';
import type { PrototypeHighlightStudyThreadRow } from '../../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import type { SidebarSearchResult } from '../../sidebar-search-types';

const LONG_BODY =
  '<p>Pastor Ruth opened with the vineyards outside Jerusalem and how the old wood is cut back each winter. ' +
  'Pruning is not punishment. What would it look like to abide when the week is full?</p>';

function parts(result: SidebarSearchResult, extra: Partial<SearchRowParts> = {}): SearchRowParts {
  return { result, title: result.title, pinned: false, locked: false, ...extra };
}

function ctx(extra: Partial<SearchRowDecorContext> = {}): SearchRowDecorContext {
  return { query: 'abide', notesById: new Map(), highlightsById: new Map(), ...extra };
}

describe('buildSearchRowDecor', () => {
  it('gives a note its folder, its time, and the sentence the word is in', () => {
    const note = { id: 'n1', title: 'Sunday', content: LONG_BODY, primaryCollection: 'Sermons' } as SpaceNoteRow;
    const decor = buildSearchRowDecor(
      parts({ id: 'note:n1', kind: 'note', title: 'Sunday', noteId: 'n1' }, { rel: '3d', preview: 'Pastor Ruth…' }),
      ctx({ notesById: new Map([['n1', note]]) }),
    );
    expect(decor.context).toBe('Sermons');
    expect(decor.meta).toBe('3d');
    expect(decor.excerpt).toContain('abide');
    expect(decor.excerpt!.startsWith('…')).toBe(true);
    expect(decor.place).toBe(false);
  });

  it('reads a note the list has not loaded from its full-text hit', () => {
    const decor = buildSearchRowDecor(
      parts({ id: 'note:n9', kind: 'note', title: 'Elsewhere', noteId: 'n9' }),
      ctx({
        ftsHitsById: new Map([
          ['n9', { id: 'n9', type: 'note' as const, title: 'Elsewhere', content: LONG_BODY, primaryCollection: 'Gospel of John' }],
        ]),
      }),
    );
    expect(decor.context).toBe('Gospel of John');
    expect(decor.excerpt).toContain('abide');
  });

  it('keeps the preview it was given when the word is not in the body', () => {
    const note = { id: 'n1', content: '<p>Nothing here.</p>' } as SpaceNoteRow;
    const decor = buildSearchRowDecor(
      parts({ id: 'note:n1', kind: 'note', title: 'x', noteId: 'n1' }, { preview: 'Nothing here.' }),
      ctx({ notesById: new Map([['n1', note]]) }),
    );
    expect(decor.excerpt).toBe('Nothing here.');
  });

  it('never shows a locked note’s content', () => {
    const note = { id: 'n1', content: LONG_BODY, contentEncrypted: true } as SpaceNoteRow;
    const decor = buildSearchRowDecor(
      parts({ id: 'note:n1', kind: 'note', title: 'x', noteId: 'n1' }, { locked: true }),
      ctx({ notesById: new Map([['n1', note]]) }),
    );
    expect(decor.excerpt).toBe('Locked');
  });

  it('names the author of someone else’s note in a shared space', () => {
    const note = { id: 'n1', content: '', isOwnNote: false, authorDisplayName: 'Ruth' } as SpaceNoteRow;
    const decor = buildSearchRowDecor(
      parts({ id: 'note:n1', kind: 'note', title: 'x', noteId: 'n1' }),
      ctx({ notesById: new Map([['n1', note]]) }),
    );
    expect(decor.context).toBe('Ruth');
  });

  it('places a highlight in its note and shows the annotation you wrote', () => {
    const row = {
      id: 'h1',
      entryKind: 'workspace',
      parentNoteTitle: 'Sunday',
      miniNoteBody: 'Abide first, then the doing.',
    } as PrototypeHighlightStudyThreadRow;
    const decor = buildSearchRowDecor(
      parts({ id: 'highlight:h1', kind: 'highlight', title: 'Pruning', highlightId: 'h1' }, { rel: '3d' }),
      ctx({ highlightsById: new Map([['h1', row]]) }),
    );
    expect(decor.context).toBe('Sunday');
    expect(decor.excerpt).toBe('Abide first, then the doing.');
    expect(decor.meta).toBe('3d');
  });

  it('moves a place’s count to the meta and gives it no excerpt', () => {
    for (const kind of ['folder', 'threadCluster', 'scriptureBook', 'scripturePassage', 'scriptureReference'] as const) {
      const decor = buildSearchRowDecor(parts({ id: kind, kind, title: 't' }, { preview: '12 notes' }), ctx());
      expect(decor).toEqual({ meta: '12 notes', place: true });
    }
  });

  it('treats a resource’s site as where it lives', () => {
    const decor = buildSearchRowDecor(
      parts({ id: 'resource:r1', kind: 'resource', title: 't' }, { preview: 'bibleproject.com' }),
      ctx(),
    );
    expect(decor).toEqual({ context: 'bibleproject.com', place: true });
  });
});
