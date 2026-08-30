/**
 * Posting a search to the server log, fire-and-forget.
 *
 * The twin of `proto-recall-events.ts` and `proto-note-visit-events.ts`, and deliberately as
 * small as both. Nothing waits on this and nothing reads the response: the recent-searches
 * list the reader actually sees is served from `localStorage`, so the network half can fail,
 * be offline, or hit a database where the table does not exist yet, and the feature is
 * unaffected.
 */
import { api } from '../../lib/api';
import {
  normalizeSearchQuery,
  shouldLogSearchQuery,
  type SearchEventAction,
  type SearchEventSurface,
} from '@/utils/search-event-kinds';

export function recordSearchEvent(input: {
  query: string;
  action: SearchEventAction;
  resultCount?: number;
  surface: SearchEventSurface;
}): void {
  const query = normalizeSearchQuery(input.query);
  /* Checked here as well as on the server so a query this table has chosen not to keep never
     leaves the device at all. The server repeats it because a client is not a trust boundary;
     the client does it because not sending is better than sending and being refused. */
  if (!shouldLogSearchQuery(query)) return;

  void api
    .post<{ success?: boolean }>('/api/search/event', {
      query,
      action: input.action,
      resultCount: input.resultCount ?? 0,
      surface: input.surface,
    })
    .catch(() => {
      // offline, rate-limited, or table missing — the local history is the one that matters
    });
}

/** Forget the server-side history. Pairs with `clearAllRecentSearches` for the local half. */
export function clearServerSearchHistory(): Promise<void> {
  return api.delete('/api/search/history').then(
    () => undefined,
    () => undefined,
  );
}
