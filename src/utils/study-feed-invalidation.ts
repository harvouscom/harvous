/**
 * One way to refresh Activity.
 *
 * Activity is a single infinite query, `['study-feed', scope]`, built on the server from six
 * sources: notes, note versions, highlights, reading events, visits and review answers. Its
 * `staleTime` is a minute, and it used to carry a comment claiming that "everything they do here
 * invalidates it explicitly". Nothing of the sort was true — four call sites invalidated it, and
 * answering a review, writing a note, saving a note and painting a highlight were not among them.
 * Every one of those writes a row the feed reads, so every one of them left Activity showing
 * yesterday until the reader reloaded the page.
 *
 * The reason it drifted is that the key was spelled out by hand wherever it was invalidated, and a
 * hand-copied key is one a new mutation forgets. Naming the verb gives the next one something to
 * call, and `study-feed-invalidation.test.ts` fails the build when a mutation that writes a feed
 * source does not call it.
 *
 * Invalidated by prefix, without the scope: a write belongs to a space, and the reader may be
 * looking at that space or at everything. Enumerating the scopes at the call site would mean each
 * mutation knowing which feeds could be open, which is exactly the knowledge that goes stale.
 */
import type { QueryClient } from '@tanstack/react-query';

export const STUDY_FEED_QUERY_KEY = ['study-feed'] as const;

/** Refresh Activity after a write it reads. */
export function invalidateStudyFeed(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: STUDY_FEED_QUERY_KEY });
}
