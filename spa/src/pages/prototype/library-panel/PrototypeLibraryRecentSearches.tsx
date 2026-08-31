/**
 * The terms you searched before, behind a control instead of in front of the library.
 *
 * These used to live in `PrototypeLibrarySearchEmpty`, which *replaced* the browse body the
 * moment the field took focus. That answered "I was looking for something earlier" by taking
 * away the thing you were looking at — click into the field to search and the library
 * vanished before you had typed a character, which read as the panel resetting rather than
 * as an offer.
 *
 * So they moved into the header, beside the field they fill. The list stays up, and past
 * queries are a thing you go and get rather than a thing that arrives whether or not you
 * wanted it.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLibraryPanelData } from './library-panel-data';
import {
  readRecentSearchTerms,
  subscribeRecentSearches,
  type RecentSearchEntry,
  type RecentSearchStorageScope,
} from '@/utils/recent-search-storage';

/** Enough to be useful, few enough to stay a hint rather than a second list. */
const MAX_TERMS = 6;
const NONE: never[] = [];

/**
 * The remembered terms for whichever library this panel is showing.
 *
 * The scope is built from primitives rather than passed as an object, because a fresh object
 * each render would resubscribe on every keystroke in the field above.
 */
export function useRecentSearchTerms(): RecentSearchEntry[] {
  const data = useLibraryPanelData();
  const spaceId = data.spaceId;
  const isShared = data.isScopedSharedSpace;
  const scope = useMemo<RecentSearchStorageScope>(
    () => (isShared && spaceId ? { type: 'space', id: spaceId } : null),
    [isShared, spaceId],
  );

  const [terms, setTerms] = useState<RecentSearchEntry[]>(NONE);
  useEffect(() => {
    const read = () => setTerms(readRecentSearchTerms(scope, MAX_TERMS));
    read();
    return subscribeRecentSearches(scope, read);
  }, [scope]);
  return terms;
}

export default function PrototypeLibraryRecentSearches({
  terms,
  onPickRecent,
}: {
  terms: RecentSearchEntry[];
  /** Runs the term without waiting for the debounce — nobody typed it. */
  onPickRecent: (term: string) => void;
}) {
  return (
    <div className="proto-library-recents">
      <p className="proto-caption proto-library-recents__label">Recent searches</p>
      {/*
        Not `ProtoChipBar`, and not its classes. That component is a `role="tablist"` needing
        a `selectedId`, which is a lie about a list of past queries: none is current, and
        picking one is not switching views. Its classes carried the same claim — a pill track
        whose children are `flex: 1 0 auto`, so a single remembered term stretched the whole
        width and looked like one selected segment.
      */}
      <div className="proto-recent-queries">
        {terms.map((entry) => (
          <button
            key={entry.term}
            type="button"
            className="proto-recent-query"
            onClick={() => onPickRecent(entry.term)}
          >
            {entry.term}
          </button>
        ))}
      </div>
    </div>
  );
}
