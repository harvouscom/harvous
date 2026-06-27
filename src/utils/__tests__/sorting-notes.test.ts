import { describe, expect, it } from 'vitest';
import {
  sortDrillNoteBriefsByLastUpdated,
  sortNotesByLastUpdated,
  sortNotesByLastVisited,
} from '../sorting';

describe('sortNotesByLastUpdated', () => {
  it('ignores visit-only bumps when a note was edited more recently', () => {
    const visitOnly = {
      id: 'a',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
      lastVisited: '2026-06-11T00:00:00Z',
    };
    const editedLater = {
      id: 'b',
      createdAt: '2026-06-05T00:00:00Z',
      updatedAt: '2026-06-08T00:00:00Z',
      lastVisited: '2026-06-06T00:00:00Z',
    };
    const sorted = sortNotesByLastUpdated([visitOnly, editedLater]);
    expect(sorted[0]).toBe(editedLater);
    expect(sorted[1]).toBe(visitOnly);
  });

  it('does not promote a note that was only visited (no newer updatedAt)', () => {
    const stale = { id: 'a', updatedAt: '2026-06-01T00:00:00Z', lastVisited: '2026-06-10T00:00:00Z' };
    const recent = { id: 'b', updatedAt: '2026-06-05T00:00:00Z', lastVisited: null };
    const sorted = sortNotesByLastUpdated([stale, recent]);
    expect(sorted[0]).toBe(recent);
  });

  it('floats pinned notes first regardless of edit time', () => {
    const pinnedStale = { id: 'a', isPinned: true, updatedAt: '2026-06-01T00:00:00Z' };
    const unpinnedRecent = { id: 'b', isPinned: false, updatedAt: '2026-06-10T00:00:00Z' };
    const sorted = sortNotesByLastUpdated([unpinnedRecent, pinnedStale]);
    expect(sorted[0]).toBe(pinnedStale);
    expect(sorted[1]).toBe(unpinnedRecent);
  });

  it('uses id as tiebreaker when edit times match', () => {
    const first = { id: 'a', updatedAt: '2026-06-10T10:00:00Z' };
    const second = { id: 'b', updatedAt: '2026-06-10T10:00:00Z' };
    const sorted = sortNotesByLastUpdated([second, first]);
    expect(sorted[0]).toBe(first);
    expect(sorted[1]).toBe(second);
  });
});

describe('sortDrillNoteBriefsByLastUpdated', () => {
  it('prefers loaded note timestamps over stale brief rows', () => {
    const briefs = [
      { id: 'old-index', title: 'Older', updatedAt: '2026-06-01T00:00:00Z', createdAt: '2026-06-01T00:00:00Z' },
      { id: 'fresh-index', title: 'Newer', updatedAt: '2026-06-02T00:00:00Z', createdAt: '2026-06-02T00:00:00Z' },
    ];
    const loaded = new Map([
      ['old-index', { updatedAt: '2026-06-10T00:00:00Z', createdAt: '2026-06-01T00:00:00Z' }],
      ['fresh-index', { updatedAt: '2026-06-03T00:00:00Z', createdAt: '2026-06-02T00:00:00Z' }],
    ]);
    const sorted = sortDrillNoteBriefsByLastUpdated(briefs, loaded);
    expect(sorted.map((row) => row.id)).toEqual(['old-index', 'fresh-index']);
  });
});

describe('sortNotesByLastUpdated vs sortNotesByLastVisited', () => {
  it('lastVisited sort promotes visit-only opens; updated sort does not', () => {
    const openedOnly = {
      id: 'opened',
      updatedAt: '2026-06-01T00:00:00Z',
      lastVisited: '2026-06-11T00:00:00Z',
    };
    const editedEarlier = {
      id: 'edited',
      updatedAt: '2026-06-05T00:00:00Z',
      lastVisited: null,
    };
    expect(sortNotesByLastVisited([openedOnly, editedEarlier])[0]).toBe(openedOnly);
    expect(sortNotesByLastUpdated([openedOnly, editedEarlier])[0]).toBe(editedEarlier);
  });
});
