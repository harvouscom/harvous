/**
 * Deciding when a search is finished enough to remember.
 *
 * A debounced field settles on every pause, so "pat", "patie" and "patience" all arrive as
 * settled queries on the way to one search. Recording each would fill the list with the
 * prefixes of a single thought. The rule that fixes it already existed in Spotlight
 * (`spa/src/components/SpotlightSearch.tsx`) and is reproduced here rather than reinvented:
 * wait `RECENT_SEARCH_COMMIT_IDLE_MS` after the query settles *and* its results resolve,
 * then check the field has not moved since. Anything still being typed fails that check.
 *
 * ## Why the count comes up rather than the input going down
 *
 * The guard needs the *live* field value, not just the settled one — that is what
 * distinguishes "paused for 650ms" from "finished". The host already re-renders per
 * keystroke because it owns the input; the results tree deliberately does not. Passing the
 * live value down as a prop would re-render every row once per character, which is the exact
 * cost `use-library-panel-search.ts` was written to avoid. So the results component reports
 * its settled count upward instead, and that report is what starts the timer — no state, no
 * render, and the effect that would otherwise have to watch for the count never exists.
 *
 * ## Why closing the panel commits rather than cancels
 *
 * Searching, finding nothing and giving up is a real outcome, and it is the one most worth
 * remembering — both for the reader, who may want the term back, and as the signal that a
 * question went unanswered. Cancelling on unmount would throw away precisely that case,
 * because closing the panel is how giving up looks. So the cleanup flushes: closing is a
 * pause long enough to count. A query whose results never resolved still writes nothing,
 * since there is no honest count to record for it.
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  addRecentSearchTerm,
  RECENT_SEARCH_COMMIT_IDLE_MS,
  type RecentSearchStorageScope,
} from '@/utils/recent-search-storage';
import { recordSearchEvent } from '../proto-search-events';

/** What the results component reports once its query has fully resolved. */
export type LibrarySearchSettled = { query: string; count: number };

export function useLibrarySearchHistory(input: {
  scope: RecentSearchStorageScope;
  /** The live field value. */
  live: string;
  /** The debounced value the results were built from. */
  settled: string;
}): {
  /** Pass to `PrototypeLibrarySearchResults` as `onResultsSettled`. */
  onResultsSettled: (settled: LibrarySearchSettled) => void;
} {
  const liveRef = useRef(input.live);
  const settledRef = useRef(input.settled);
  const scopeRef = useRef(input.scope);
  liveRef.current = input.live;
  settledRef.current = input.settled;
  scopeRef.current = input.scope;

  const pendingRef = useRef<LibrarySearchSettled | null>(null);
  const timerRef = useRef<number | null>(null);

  const commit = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;

    /* Three values have to agree, and each rules out a different way of being mid-thought:
       the settled value must still be the one these results describe, and the live field must
       have caught up to it. `addRecentSearchTerm` enforces the length floor itself. */
    const query = pending.query.trim();
    if (!query) return;
    if (settledRef.current.trim() !== query) return;
    if (liveRef.current.trim() !== query) return;

    addRecentSearchTerm(scopeRef.current, query, { resultCount: pending.count });

    /*
     * The same moment, sent to the server log — one decision, two writes, so the two can
     * never disagree about what counted as a search.
     *
     * Skipped inside a shared space. A question asked in somebody else's room is about their
     * material, it has no space to be filed under (`SearchEvents` carries no `spaceId`, and
     * that is a deliberate "not yet"), and letting it shape your own suggestions would be the
     * wrong answer twice. The local list still keeps it, scoped to that space, because
     * getting a term back is useful wherever you typed it.
     */
    if (scopeRef.current === null) {
      recordSearchEvent({ query, action: 'query', resultCount: pending.count, surface: 'library' });
    }
  }, []);

  const onResultsSettled = useCallback(
    (settled: LibrarySearchSettled) => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      pendingRef.current = settled;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        commit();
      }, RECENT_SEARCH_COMMIT_IDLE_MS);
    },
    [commit],
  );

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      commit();
    },
    [commit],
  );

  return { onResultsSettled };
}
