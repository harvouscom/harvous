import { describe, expect, it } from 'vitest';
import {
  isPrototypeHomeContentReady,
  isPrototypeHomePresentationReady,
  isQuerySettled,
} from '../prototype-home-ready';

describe('isPrototypeHomeContentReady', () => {
  it('returns false while notes are loading', () => {
    expect(isPrototypeHomeContentReady('loading')).toBe(false);
  });

  it('returns false on notes error', () => {
    expect(isPrototypeHomeContentReady('error')).toBe(false);
  });

  it('returns true for list when notes are ready', () => {
    expect(isPrototypeHomeContentReady('list')).toBe(true);
  });

  it('returns true for empty when notes are ready', () => {
    expect(isPrototypeHomeContentReady('empty')).toBe(true);
  });
});

describe('isQuerySettled', () => {
  it('returns true when not pending', () => {
    expect(isQuerySettled(false, false)).toBe(true);
  });

  it('returns true when pending but cached data exists', () => {
    expect(isQuerySettled(true, true)).toBe(true);
  });

  it('returns false when pending with no data', () => {
    expect(isQuerySettled(true, false)).toBe(false);
  });
});

describe('isPrototypeHomePresentationReady', () => {
  const readyBase = {
    notesReady: true,
    clerkLoaded: true,
    fingerprintsSettled: true,
    tagsSettled: true,
    threadsSettled: true,
    scriptureSettled: true,
    connectionsSettled: true,
    highlightsSettled: true,
    votdSettled: true,
    crossRefGapsSettled: true,
    connectSuggestionsSettled: true,
    recallHistorySettled: true,
    churchSermonsSettled: true,
    churchFeedSettled: true,
  };

  it('returns true when all presentation deps are settled', () => {
    expect(isPrototypeHomePresentationReady(readyBase)).toBe(true);
  });

  it('returns false while fingerprints are still loading', () => {
    expect(isPrototypeHomePresentationReady({ ...readyBase, fingerprintsSettled: false })).toBe(false);
  });

  it('returns false while scripture index is still loading', () => {
    expect(isPrototypeHomePresentationReady({ ...readyBase, scriptureSettled: false })).toBe(false);
  });

  it('returns false while VOTD is still loading', () => {
    expect(isPrototypeHomePresentationReady({ ...readyBase, votdSettled: false })).toBe(false);
  });

  it('returns false while highlights are still loading', () => {
    expect(isPrototypeHomePresentationReady({ ...readyBase, highlightsSettled: false })).toBe(false);
  });

  /**
   * These five used to sit outside the gate, and each one landing after first paint moved
   * Home under the reader: cross-ref gaps and connect suggestions *add* a recall card, recall
   * history supplies the snooze set that *removes* cards, and the two church sections return
   * null until their own query resolves — with "This Sunday" above the daily passage, so its
   * arrival pushes the whole rest of the view down.
   */
  it.each([
    ['crossRefGapsSettled'],
    ['connectSuggestionsSettled'],
    ['recallHistorySettled'],
    ['churchSermonsSettled'],
    ['churchFeedSettled'],
  ] as const)('returns false while %s is still loading', (flag) => {
    expect(isPrototypeHomePresentationReady({ ...readyBase, [flag]: false })).toBe(false);
  });
});

describe('home readiness composition', () => {
  const ready = {
    notesReady: true,
    clerkLoaded: true,
    fingerprintsSettled: true,
    tagsSettled: true,
    threadsSettled: true,
    scriptureSettled: true,
    connectionsSettled: true,
    highlightsSettled: true,
    votdSettled: true,
    crossRefGapsSettled: true,
    connectSuggestionsSettled: true,
    recallHistorySettled: true,
    churchSermonsSettled: true,
    churchFeedSettled: true,
  };

  it('is not ready on notes alone', () => {
    // The regression this guards: Home painted as soon as notes resolved, then jumped
    // as each of the remaining queries landed and inserted its own section.
    expect(isPrototypeHomePresentationReady({ ...ready, tagsSettled: false })).toBe(false);
    expect(isPrototypeHomePresentationReady({ ...ready, connectionsSettled: false })).toBe(false);
    expect(isPrototypeHomePresentationReady({ ...ready, clerkLoaded: false })).toBe(false);
  });

  it('is ready when every input has settled', () => {
    expect(isPrototypeHomePresentationReady(ready)).toBe(true);
  });

  it('takes the notes phase as a bare argument, so extra flags cannot be passed', () => {
    // The old object parameter silently swallowed five sibling flags the call site
    // passed alongside notesListPhase.
    expect(isPrototypeHomeContentReady('list')).toBe(true);
    expect(isPrototypeHomeContentReady('loading')).toBe(false);
  });
});
