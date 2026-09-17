/**
 * Every write Activity reads has to refresh it.
 *
 * Activity is one query with a minute of `staleTime`, and the server builds it from six sources.
 * Four of them — notes, note versions, highlights and review answers — had mutations that wrote
 * the row and invalidated everything *except* this key, so the trail sat a day behind until the
 * reader reloaded. Deleting a note refreshed it and writing one did not.
 *
 * A source assertion rather than a render test, for the same reason `check:auth-gated-queries` is
 * one: the failure is a line that was never written, and no amount of exercising the hook shows
 * you a missing invalidation. This reads the files and insists the verb appears in them, so the
 * next mutation over a feed source fails the build rather than the surface.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { QueryClient } from '@tanstack/react-query';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { invalidateStudyFeed, STUDY_FEED_QUERY_KEY } from '@/utils/study-feed-invalidation';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

function source(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

/**
 * A mutation over one of the feed's sources, and how it is allowed to say so.
 *
 * `invalidatePrototypeStudyThreadListQueries` counts because it calls the helper itself — that is
 * the whole reason the highlight hooks should use it instead of hand-copying its key list, which
 * is how they came to miss this key in the first place.
 */
const WRITERS: { path: string; source: string }[] = [
  { path: 'spa/src/hooks/mutations/useCreateSimpleNote.ts', source: 'a note is written' },
  { path: 'spa/src/hooks/mutations/useUpdateNote.ts', source: 'a note is saved' },
  { path: 'spa/src/hooks/mutations/useDeleteNote.ts', source: 'a note is deleted' },
  { path: 'spa/src/hooks/mutations/useDeleteNotesBatch.ts', source: 'notes are deleted' },
  { path: 'spa/src/hooks/mutations/useCreateHighlight.ts', source: 'a highlight is made' },
  { path: 'spa/src/hooks/mutations/useUpdateHighlight.ts', source: 'a highlight is changed' },
  { path: 'spa/src/hooks/mutations/useDeleteHighlight.ts', source: 'a highlight is erased' },
  { path: 'spa/src/hooks/mutations/useReviewMutations.ts', source: 'a review is answered' },
  { path: 'spa/src/hooks/useReadingSession.ts', source: 'a chapter is read' },
];

const ALLOWED = /invalidateStudyFeed|invalidateReadingSurfaces|invalidatePrototypeStudyThreadListQueries/;

describe('invalidateStudyFeed', () => {
  it('invalidates every scope of the feed by prefix', async () => {
    const queryClient = new QueryClient();
    const seen: unknown[] = [];
    queryClient.invalidateQueries = ((filters: { queryKey?: unknown }) => {
      seen.push(filters.queryKey);
      return Promise.resolve();
    }) as typeof queryClient.invalidateQueries;

    invalidateStudyFeed(queryClient);

    expect(seen).toEqual([STUDY_FEED_QUERY_KEY]);
    // The scope is deliberately absent: a write does not know which feed is on screen.
    expect(STUDY_FEED_QUERY_KEY).toHaveLength(1);
  });
});

describe('mutations over a study-feed source', () => {
  it.each(WRITERS)('refreshes Activity when $source ($path)', ({ path }) => {
    expect(source(path)).toMatch(ALLOWED);
  });

  /*
   * The inverse, and the reason this file is not just a list: the hand-copied key lists in the
   * two highlight hooks were indistinguishable from correct code until you compared them with
   * the helper they had been copied from. Nothing outside the helper should name the key.
   */
  it('spells the key in one place only', () => {
    const offenders = WRITERS.map((writer) => writer.path).filter((path) =>
      /['"]study-feed['"]/.test(source(path)),
    );
    expect(offenders).toEqual([]);
  });
});
