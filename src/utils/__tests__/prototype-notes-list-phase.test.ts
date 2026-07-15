import { describe, expect, it } from 'vitest';
import { computePrototypeNotesListPhase } from '../prototype-notes-list-phase';

const base = {
  homeSpaceId: 'space_home',
  authReady: true,
  isPending: false,
  isFetching: false,
  isFetched: true,
  noteCount: 0,
  isError: false,
};

describe('computePrototypeNotesListPhase', () => {
  it('returns error when query failed', () => {
    expect(computePrototypeNotesListPhase({ ...base, isError: true })).toBe('error');
  });

  it('returns loading when homeSpaceId is unknown', () => {
    expect(computePrototypeNotesListPhase({ ...base, homeSpaceId: null })).toBe('loading');
  });

  it('returns loading when auth is not ready', () => {
    expect(computePrototypeNotesListPhase({ ...base, authReady: false })).toBe('loading');
  });

  it('returns loading when query is pending (disabled or no data yet)', () => {
    expect(computePrototypeNotesListPhase({ ...base, isPending: true, isFetched: false })).toBe(
      'loading',
    );
  });

  it('returns loading when fetching first page with no rows yet', () => {
    expect(
      computePrototypeNotesListPhase({
        ...base,
        isFetching: true,
        noteCount: 0,
        isFetched: false,
      }),
    ).toBe('loading');
  });

  it('returns empty while refetching after an empty success (does not stuck-load)', () => {
    // Regression: isFetching && noteCount === 0 used to force 'loading' forever
    // during background refetch, leaving Home on ProtoHomeLoading dots.
    expect(
      computePrototypeNotesListPhase({
        ...base,
        isFetching: true,
        noteCount: 0,
        isFetched: true,
      }),
    ).toBe('empty');
  });

  it('returns list while fetching when rows are already visible', () => {
    expect(
      computePrototypeNotesListPhase({ ...base, isFetching: true, noteCount: 3 }),
    ).toBe('list');
  });

  it('returns empty only after settled fetch with zero rows', () => {
    expect(computePrototypeNotesListPhase({ ...base })).toBe('empty');
  });

  it('returns list when notes are present', () => {
    expect(computePrototypeNotesListPhase({ ...base, noteCount: 2 })).toBe('list');
  });
});
