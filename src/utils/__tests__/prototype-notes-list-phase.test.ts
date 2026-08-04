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

describe('the INVARIANT, pinned at the shape call sites actually pass', () => {
  /**
   * PrototypeSidebar called this helper without `isFetched` at all. TypeScript flagged it
   * as a missing required property, but nothing ran tsc — so `input.isFetched` was
   * `undefined`, `!input.isFetched` was permanently true, and a settled-empty Home fell
   * back to loading dots on every background refetch. Exactly the regression the
   * INVARIANT comment on computePrototypeNotesListPhase documents as already fixed.
   */
  const settledEmpty = {
    homeSpaceId: 'space_home',
    authReady: true,
    isPending: false,
    isFetching: true,
    isFetched: true,
    noteCount: 0,
    isError: false,
  };

  it('stays empty during a background refetch of an empty list', () => {
    expect(computePrototypeNotesListPhase(settledEmpty)).toBe('empty');
  });

  it('is loading only while the first fetch has not landed', () => {
    expect(computePrototypeNotesListPhase({ ...settledEmpty, isFetched: false })).toBe('loading');
  });

  it('regresses to loading if isFetched is omitted — which is why it is required', () => {
    const { isFetched: _omitted, ...withoutIsFetched } = settledEmpty;
    expect(
      computePrototypeNotesListPhase(withoutIsFetched as typeof settledEmpty),
    ).toBe('loading');
  });
});
