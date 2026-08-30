/**
 * What the panel offers before anything has been typed.
 *
 * Two different questions get asked of a search field, and answering only one of them is
 * what made the empty field feel like a dead end. "I was looking for something earlier" is
 * answered by the terms; "take me back to what I was doing" is answered by the things
 * themselves. A term you have to retype and a note you have to find again are both work the
 * panel already knows how to save you.
 *
 * ## Why this replaces the browse body rather than sitting above it
 *
 * The panel's arrival staggers the first five `li` of `.proto-note-list` at 40ms intervals
 * (`prototype-shell.css`). Rendering this above the All list would put two such lists in the
 * body, each staggering its own first five in parallel — one arrival read as two. Replacing
 * keeps exactly one list on screen, which is also the honest answer to "what is this panel
 * showing me".
 *
 * ## Why the chips are neither `ProtoChipBar` nor its classes
 *
 * The component is `role="tablist"` with `role="tab"` and `aria-selected`, and it requires a
 * `selectedId`. A tablist says exactly one of these is current, which is a lie about a list
 * of past queries: none is selected, and picking one is not switching views.
 *
 * Its *classes* turned out to be the same claim in CSS — a pill-shaped track whose children
 * are `flex: 1 0 auto`, so a single recent search stretched the full width of the panel and
 * looked exactly like one selected segment. Hence `.proto-recent-query`, which hugs its text
 * and wraps. Borrowing the look of a control that means something else is not reuse.
 */
import { useEffect, useMemo, useState } from 'react';
import PrototypeSidebarSearchResultItem from '../PrototypeSidebarSearchResultItem';
import { useLibraryPanelData } from './library-panel-data';
import { readRecentOpens, subscribeRecentOpens, type RecentOpenEntry } from './proto-recent-opens';
import {
  readRecentSearchTerms,
  subscribeRecentSearches,
  type RecentSearchEntry,
  type RecentSearchStorageScope,
} from '@/utils/recent-search-storage';
import { usePrototypeSpaceStudyThreadHighlights } from '../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import type { PrototypeHighlightStudyThreadRow } from '../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { useLibrary } from '../../../hooks/queries/useLibrary';
import {
  prototypeHighlightListTitle,
  prototypeHighlightSubtitlePreview,
} from '../proto-highlight-subtitle';
import type { SidebarSearchResult } from '../sidebar-search-types';

/** Enough to be useful, few enough to stay a hint rather than a second list. */
const MAX_TERMS = 6;
const MAX_ROWS = 5;

const NONE: never[] = [];

export default function PrototypeLibrarySearchEmpty({
  onPickRecent,
}: {
  /** Runs the term without waiting for the debounce — nobody typed it. */
  onPickRecent: (term: string) => void;
}) {
  const data = useLibraryPanelData();
  const highlightsQuery = usePrototypeSpaceStudyThreadHighlights(data.spaceId ?? undefined);
  const libraryQuery = useLibrary();

  const highlights = highlightsQuery.data ?? NONE;
  /* Resources are personal even inside a shared space, so the kind is omitted there rather
     than filtered — the same call `PrototypeLibraryAllView` makes, for the same reason. */
  const resources = data.isScopedSharedSpace ? NONE : libraryQuery.data?.items ?? NONE;

  const highlightsById = useMemo(() => {
    const map = new Map<string, PrototypeHighlightStudyThreadRow>();
    for (const row of highlights) map.set(row.id, row);
    return map;
  }, [highlights]);

  /* Built from primitives so the effect below has a stable dependency — a scope object
     rebuilt each render would resubscribe on every keystroke in the panel above. */
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

  const [opens, setOpens] = useState<RecentOpenEntry[]>(NONE);
  useEffect(() => {
    const read = () => setOpens(readRecentOpens(spaceId, MAX_ROWS * 3));
    read();
    return subscribeRecentOpens(read);
  }, [spaceId]);

  /*
   * Entries are resolved against what is loaded, and unresolvable ones are dropped rather
   * than shown as a stub. That is also how deletion is handled: a note that no longer exists
   * stops resolving, so it leaves the list without anything having to notice it went.
   */
  const rows = useMemo(() => {
    const out: { result: SidebarSearchResult; open: () => void }[] = [];
    for (const entry of opens) {
      if (out.length >= MAX_ROWS) break;
      if (entry.kind === 'note') {
        const row = data.notesById.get(entry.sourceId);
        if (!row) continue;
        out.push({
          result: {
            id: `note:${row.id}`,
            kind: 'note',
            title: row.title?.trim() || 'Untitled note',
            noteId: row.id,
          },
          open: () => data.openNote(row),
        });
        continue;
      }
      if (entry.kind === 'highlight') {
        const row = highlightsById.get(entry.sourceId);
        if (!row) continue;
        out.push({
          result: {
            id: `highlight:${row.id}`,
            kind: 'highlight',
            title: prototypeHighlightListTitle(row),
            subtitle: prototypeHighlightSubtitlePreview(row, row.parentNoteTitle ?? ''),
            highlightId: row.id,
            highlightEntryKind: row.entryKind,
          },
          open: () => data.openHighlight(row),
        });
        continue;
      }
      const resource = resources.find((r) => r.id === entry.sourceId);
      if (!resource) continue;
      out.push({
        result: { id: `resource:${resource.id}`, kind: 'resource', title: resource.title },
        open: () => data.openResource(resource),
      });
    }
    return out;
  }, [opens, data, highlightsById, resources]);

  /* Nothing remembered yet. The caller falls through to the browse body, so a new account
     sees the library rather than an empty promise about its own history. */
  if (terms.length === 0 && rows.length === 0) return null;

  return (
    <div className="proto-library-root">
      {terms.length > 0 ? (
        <div className="proto-library-results__group">
          <h3 className="proto-library-results__heading">
            <span className="proto-library-results__heading-text">Recent searches</span>
          </h3>
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
      ) : null}

      {rows.length > 0 ? (
        <div className="proto-library-results__group">
          <h3 className="proto-library-results__heading">
            <span className="proto-library-results__heading-text">Pick up where you left off</span>
          </h3>
          <ul className="proto-note-list" role="list">
            {rows.map((row) => (
              <PrototypeSidebarSearchResultItem
                key={row.result.id}
                result={row.result}
                onActivate={row.open}
                notesById={data.notesById}
                highlightsById={highlightsById}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
