/**
 * The release-notes link for a version, upgraded in place once the site answers.
 *
 * Starts on the index, which is where these links have always pointed and is never wrong. If
 * `/release-notes/published.json` confirms this version has a page of its own, the href swaps
 * to it. A link that begins correct and becomes more specific is the right shape here: the
 * alternative is rendering nothing until a cross-origin request settles, on a row whose only
 * job is to be a way out.
 */
import { useEffect, useState } from 'react';
import { RELEASE_NOTES_INDEX_URL, resolveReleaseNotesUrl } from '@/utils/release-notes-url';

export function useReleaseNotesUrl(version: string | undefined | null): string {
  const [url, setUrl] = useState(RELEASE_NOTES_INDEX_URL);

  useEffect(() => {
    let cancelled = false;
    void resolveReleaseNotesUrl(version).then((next) => {
      if (!cancelled) setUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return url;
}
