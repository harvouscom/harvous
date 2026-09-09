import { landAgain, readerRouteForReference } from '../../utils/reader-nav';

/**
 * Route for an Activity scripture-highlight row.
 *
 * Used to put the verse in `?ref=`, which opened Easton's on a title with no
 * dictionary entry ("Ecclesiastes 4:3"). The reader route focuses the verse
 * instead and never treats the reference as a headword.
 */
export function highlightPassageRoute(reference: string, translation = 'NET') {
  const route = readerRouteForReference(reference, translation);
  return route ? landAgain(route) : null;
}
