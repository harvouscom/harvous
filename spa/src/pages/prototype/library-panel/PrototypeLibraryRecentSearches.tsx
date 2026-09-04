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
import Icon from '@/components/react/Icon';
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
  onForget,
}: {
  terms: RecentSearchEntry[];
  /** Runs the term without waiting for the debounce — nobody typed it. */
  onPickRecent: (term: string) => void;
  /** Drops one term from the stored list. */
  onForget: (term: string) => void;
}) {
  return (
    <div className="proto-library-recents">
      <p className="proto-caption proto-library-recents__label">Recent searches</p>
      {/*
        Rows, not chips.
        These began as a wrapping pill track, which reads as a set of filters — things you
        turn on, side by side, none more recent than another. A history is ordered and
        singular: you pick one. And a chip has no room beside its own label for the second
        thing each of these needs, which is a way to be forgotten. A row has both — the term
        takes the width, the dismiss sits at the end of it.

        Still not `ProtoChipBar` either, for the older reason: that is a `role="tablist"`
        needing a `selectedId`, which is a lie about past queries — none is current, and
        picking one is not switching views.

        A `<ul>` rather than a stack of divs, because that is what this is, and it is the
        difference between a screen reader announcing "list, 3 items" and announcing
        nothing at all.
      */}
      <ul className="proto-recent-queries">
        {terms.map((entry) => (
          <li key={entry.term} className="proto-recent-query">
            <button
              type="button"
              className="proto-recent-query__term"
              onClick={() => onPickRecent(entry.term)}
            >
              {entry.term}
            </button>
            {/*
              Its own button rather than a click zone inside the first one: a button inside a
              button is invalid, and the two do opposite things — one runs the search, one
              destroys it. They should not be able to be confused by a stray pixel.
            */}
            <button
              type="button"
              className="proto-recent-query__forget"
              aria-label={`Forget "${entry.term}"`}
              onClick={() => onForget(entry.term)}
            >
              <Icon name="xmark" size={11} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
