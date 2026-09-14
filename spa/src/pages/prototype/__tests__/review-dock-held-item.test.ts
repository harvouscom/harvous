import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The dock's two cache-and-pointer contracts, asserted against the source.
 *
 * Both are timing bugs in a component that is always mounted, never unmounts, and is fed by two
 * query caches — the class of thing a render test can be made to pass without saying anything
 * true about the real sequence. The decisions themselves are pure and tested directly in
 * `src/utils/__tests__/review-dock-state.test.ts`; what is left to pin is that the component
 * actually asks, and that nobody re-spells a query key by hand.
 */
const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const dock = () => withoutComments(source('spa/src/pages/prototype/PrototypeReviewDock.tsx'));
const queries = () => withoutComments(source('spa/src/hooks/queries/useReview.ts'));
const layout = () => withoutComments(source('spa/src/layouts/SimplifiedPrototypeLayout.tsx'));

describe('the dock lets go of an answered question', () => {
  /*
   * The bug: `heldItem` pins the answered question so the result has something under it, and it
   * was cleared in exactly one place — the "Next one" button. Leave from the result card, come
   * back, tap a different row, and the card rendered the question that had already been answered
   * while the pointer named the new one. Answering it again re-POSTed an outcome for an item the
   * server had already rescheduled.
   */
  it('asks the shared rule rather than clearing the pin at one call site', () => {
    const text = dock();
    expect(text).toContain('shouldReleaseHeldItem');
    expect(text).toContain('setHeldItem(null)');
    // Every input the rule needs, so a future edit cannot quietly drop one and change the answer.
    const call = text.slice(text.indexOf('shouldReleaseHeldItem({'));
    for (const field of ['heldId', 'requestedId', 'hasResult', 'hasVerdict', 'pending', 'dockOpen']) {
      expect(call.slice(0, 400)).toContain(field);
    }
  });

  it('counts a sitting per open dock, not per tab', () => {
    expect(dock()).toMatch(/if \(!open\) setSitting\(/);
  });

  it('re-composes a sitting left open across hours or a midnight', () => {
    const text = dock();
    expect(text).toContain('sittingIsStale');
    expect(text).toContain('sessionQuery.refetch()');
    // Only on the open edge. Refetching while the dock is in use is the reshuffle the
    // `staleTime: Infinity` on the session exists to prevent.
    expect(text).toMatch(/opening && sittingIsStale/);
  });
});

describe('a reveal has one cache key', () => {
  /*
   * The prefetch and the session's `firstReveal` seeding wrote three elements; `useReviewReveal`
   * read four. Neither warm path ever hit, so every graded question paid a round trip and showed
   * its loading dots with the answer already in the cache under a neighbouring key.
   */
  it('is spelled in exactly one place', () => {
    const text = queries();
    expect(text).toContain('export const reviewRevealQueryKey');
    const literals = text.match(/\['review', 'reveal'/g) ?? [];
    expect(literals).toHaveLength(1);
  });

  it('is what the prefetch, the seeding and the query all use', () => {
    // Three call sites, one per path that touches a reveal: the session seeding a first
    // reveal, the prefetch warming the next one, and the query the card actually reads.
    const text = queries();
    expect(text.match(/reviewRevealQueryKey\(/g) ?? []).toHaveLength(3);
  });
});

describe('a lost answer is never silent', () => {
  it('tells the reader and keeps the question up', () => {
    const mutations = withoutComments(source('spa/src/hooks/mutations/useReviewMutations.ts'));
    const outcome = mutations.slice(mutations.indexOf('export function useReviewOutcome'));
    expect(outcome.slice(0, 1600)).toContain('REVIEW_OUTCOME_FAILED_TOAST');
    // The rollback stays: the queue must go back before anything is said about it.
    expect(outcome.slice(0, 1600)).toContain('setQueryData(reviewSessionQueryKey, context.previous)');
  });

  it('does not lose the item when the stack edge answer fails', () => {
    /*
     * `clearPaperStack()` runs unconditionally — it is what advances the queue — so without an
     * `onError` a failed answer left no stack, no result and no question.
     */
    const verdict = layout().slice(layout().indexOf('const handleReviewVerdict'));
    expect(verdict.slice(0, 2500)).toContain('onError: () => setReviewDockItem(review.itemId)');
  });

  it('carries the slipping offer through the stack edge', () => {
    // Notes are what the stack edge answers, so the rung that most needed "Make it easier" was
    // the one rung that could never receive it.
    const verdict = layout().slice(layout().indexOf('const handleReviewVerdict'));
    expect(verdict.slice(0, 2500)).toMatch(/leech: data\.leech === true/);
    expect(verdict.slice(0, 2500)).toMatch(/stalled: data\.stalled === true/);
  });

  it('shows a failed reveal as a failed reveal', () => {
    // Not as the free-text fallback, which offers to record an answer to a question the reader
    // was never shown.
    const text = dock();
    expect(text).toContain('isGradedRung && reveal.isError');
    expect(text.indexOf('reveal.isError')).toBeLessThan(text.indexOf('reveal.isPending'));
  });
});
