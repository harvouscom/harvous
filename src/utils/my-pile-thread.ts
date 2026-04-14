/**
 * Display title and URL for the special thread id `thread_unorganized`.
 * Keep path segment in sync with `idToUrl` / `urlToId` in url-helpers.ts
 * and literals in public/scripts/navigation/history-tracker.js.
 */
export const MY_PILE_THREAD_TITLE = 'My Pile';

/** Last path segment for `/thread/mypile` (no slashes) */
export const MY_PILE_THREAD_URL_SEGMENT = 'mypile';

export function normalizeMyPileTitleForComparison(title: string | null | undefined): string {
  return (title ?? '').trim().toLowerCase();
}

/** Matches canonical My Pile plus legacy titles still in DB or cached clients */
export function isMyPileDisplayTitle(title: string | null | undefined): boolean {
  const n = normalizeMyPileTitleForComparison(title);
  return n === 'my pile' || n === 'unorganized' || n === 'sort later';
}
