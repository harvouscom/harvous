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

  /*
   * The regression this guards is the one that made Home's whole gate inert. A disabled query
   * keeps `status: 'pending'` in React Query v5, so without the third argument a query that will
   * never run reads as forever-loading — and one of those ANDed into the presentation gate meant
   * `presentationReady` was never true for any account without a church.
   */
  it('treats a disabled query as settled — it will never answer', () => {
    expect(isQuerySettled(true, false, false)).toBe(true);
  });

  it('still waits on an enabled query that is pending', () => {
    expect(isQuerySettled(true, false, true)).toBe(false);
  });

  it('defaults to enabled, so a two-argument call is unchanged', () => {
    expect(isQuerySettled(true, false)).toBe(isQuerySettled(true, false, true));
  });

  it('prefers data over both — a disabled query holding cache is settled with its data', () => {
    expect(isQuerySettled(true, true, false)).toBe(true);
  });
});

describe('isPrototypeHomePresentationReady', () => {
  const readyBase = {
    authReady: true,
    notesReady: true,
    clerkLoaded: true,
    fingerprintsSettled: true,
    tagsSettled: true,
    threadsSettled: true,
    scriptureSettled: true,
    connectionsSettled: true,
    highlightsSettled: true,
    votdSettled: true,
    searchEventsSettled: true,
    crossRefGapsSettled: true,
    connectSuggestionsSettled: true,
    recallHistorySettled: true,
    churchSermonsSettled: true,
    churchFeedSettled: true,
    readingPositionSettled: true,
    studyBibleSettled: true,
    entitlementSettled: true,
    reviewSettled: true,
    challengesSettled: true,
    readingPlansSettled: true,
    onboardingHydrated: true,
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
    ['readingPositionSettled'],
  ] as const)('returns false while %s is still loading', (flag) => {
    expect(isPrototypeHomePresentationReady({ ...readyBase, [flag]: false })).toBe(false);
  });

  /**
   * The five that sat outside the gate until Review started arriving first.
   *
   * Review's absence was a deliberate call when it was the slowest thing on the page. Then it was
   * made to start at t=0 and became one of the fastest, so it was the only populated section on a
   * page still waiting for the rest — the same pop-in, inverted. `reviewSettled` also covers the
   * `active` list, which *removes* recall cards rather than adding a section.
   */
  it.each([
    ['entitlementSettled'],
    ['reviewSettled'],
    ['challengesSettled'],
    ['readingPlansSettled'],
    ['onboardingHydrated'],
  ] as const)('returns false while %s is still loading', (flag) => {
    expect(isPrototypeHomePresentationReady({ ...readyBase, [flag]: false })).toBe(false);
  });

  /*
   * `authReady` is what keeps the disabled-is-settled rule from eating itself. Nearly every query
   * behind these flags is `enabled: authReady && …`, so before a session JWT exists they are all
   * disabled and every flag reads settled at once. Without this precondition the gate would fire
   * on the first frames and Home would paint empty — a worse bug than the one being fixed.
   */
  it('is never ready before auth, however settled everything else looks', () => {
    expect(isPrototypeHomePresentationReady({ ...readyBase, authReady: false })).toBe(false);
  });
});

describe('home readiness composition', () => {
  const ready = {
    authReady: true,
    notesReady: true,
    clerkLoaded: true,
    fingerprintsSettled: true,
    tagsSettled: true,
    threadsSettled: true,
    scriptureSettled: true,
    connectionsSettled: true,
    highlightsSettled: true,
    votdSettled: true,
    searchEventsSettled: true,
    crossRefGapsSettled: true,
    connectSuggestionsSettled: true,
    recallHistorySettled: true,
    churchSermonsSettled: true,
    churchFeedSettled: true,
    readingPositionSettled: true,
    studyBibleSettled: true,
    entitlementSettled: true,
    reviewSettled: true,
    challengesSettled: true,
    readingPlansSettled: true,
    onboardingHydrated: true,
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
