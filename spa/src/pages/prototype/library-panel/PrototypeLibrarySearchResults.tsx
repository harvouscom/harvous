/**
 * The Library panel's results — what the browse body becomes once you type.
 *
 * Not `PrototypeSidebarSearchResults` with different props. That component carries its own
 * scope chips and its own type filter, and both of those are now the panel's tab row: two
 * filters for one question, stacked, with the outer one silently overriding the inner. So
 * this reuses the *pure builders* from `sidebar-universal-search` — which is where the
 * search actually lives — and lets the tab supply the filter that used to be a chip.
 *
 * The sidebar's "My Home" scope is deliberately not ported. It is a scope, not a type: it
 * asks "which space", where every tab here asks "which kind". Putting it in this row would
 * make one of the seven mean something different from the other six.
 *
 * ── Order, and the one place two rules collide ────────────────────────────────────────
 *
 * Actions, then Go to, then the passage hoist, then results.
 *
 * Actions are specified to sit above results. The hoist has a rule of its own, stated in
 * `sidebar-universal-search`: a named passage "leads every scope", because it is a
 * destination rather than a match and switching filters should not make the chapter you
 * just asked for disappear. Both cannot be first.
 *
 * They can only ever meet on a query that names a resolvable passage *and* fuzzy-matches
 * an organize verb — "John 15" against "Delete", "Move to a folder…" — which is
 * effectively the empty set, and `isResolvableScriptureReference` is strict enough to keep
 * it that way. **Actions win.** The tiebreak is written down not because it will fire but
 * because the next person to read the two rules together deserves to find the answer
 * rather than re-derive it.
 */
import { useMemo, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon, { type IconName } from '@/components/react/Icon';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { useSearch } from '@/hooks/useSearch';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { bookSlug } from '@/utils/bible-book-chapters';
import { prototypeReadRouteTo } from '@/lib/prototype-path';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import ProtoKbdChord from '../ProtoKbdChord';
import PrototypeSidebarSearchResultItem from '../PrototypeSidebarSearchResultItem';
import { PrototypeListNoMatchEmptyState } from '../PrototypeListEmptyState';
import { SIDEBAR_NO_MATCH_COPY } from '../sidebar-no-match-copy';
import { fuzzyFilter, fuzzyMatches } from '../fuzzy-search';
import {
  buildElsewhereResults,
  buildFoldersFromNotes,
  buildScriptureReferenceResult,
  mergeFoldersWithRegistry,
  type UniversalSearchData,
} from '../sidebar-universal-search';
import {
  libraryTabMatches,
  sidebarSearchResultStableId,
  type LibraryTab,
  type SidebarElsewhereTypeFilter,
  type SidebarSearchResult,
} from '../sidebar-search-types';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { usePrototypeFolderRegistry } from '../../../hooks/mutations/usePrototypeFolderRegistry';
import { usePrototypeSpaceScriptureIndex } from '../../../hooks/queries/usePrototypeSpaceScriptureIndex';
import { usePrototypeSpaceStudyThreadHighlights } from '../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import type { PrototypeHighlightStudyThreadRow } from '../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import {
  usePrototypeStudyThreads,
  type StudyThreadCluster,
} from '../../../hooks/queries/usePrototypeStudyThreads';
import { useSpaceGroupThreads } from '../../../hooks/queries/useSpaceGroupThreads';
import { useLibrary, type LibraryItem } from '../../../hooks/queries/useLibrary';
import { useLibraryPanelData } from './library-panel-data';
import { useLibraryCommandContext } from './use-library-command-context';
import { matchPrototypeCommands } from './library-command-matches';
import { LIBRARY_TAB_LABELS } from './library-panel-view';

/**
 * One shared empty array for every not-yet-loaded corpus.
 *
 * A fresh `[]` per render would be a new dependency identity every render, and the search
 * below is memoized on all of them — so with any one query still pending, an inline
 * literal would rebuild the whole result set on every keystroke.
 */
const NONE: never[] = [];

/**
 * Nothing is "here" as opposed to "elsewhere" in the panel: there is one list, and the tab
 * says which kinds are in it. Module-level so the memo below has a stable identity.
 */
const EXCLUDE_NOTHING: Set<string> = new Set();

/**
 * Same fallback chain the panel's Thread cards and All rows use, so a Thread is called one
 * thing when you browse to it and the same thing when you search for it.
 */
function resolveClusterTitle(cluster: StudyThreadCluster): string {
  return cluster.title?.trim() || cluster.suggestedTitle?.trim() || 'Untitled note';
}

/** A resource's second line, matching the All tab's. */
function resourceSubtitle(item: LibraryItem): string | undefined {
  return item.sourceSiteName || item.sourceDomain || item.fileName || undefined;
}

/** The no-match line for a tab, reusing the copy the sidebar's type filter already had. */
function emptyTitleForTab(tab: LibraryTab): string {
  switch (tab) {
    case 'notes':
      return SIDEBAR_NO_MATCH_COPY.noNotesMatch;
    case 'folders':
      return SIDEBAR_NO_MATCH_COPY.noFoldersMatch;
    case 'threads':
      return SIDEBAR_NO_MATCH_COPY.noThreadsMatch;
    case 'highlights':
      return SIDEBAR_NO_MATCH_COPY.noHighlightsMatch;
    case 'scripture':
      return SIDEBAR_NO_MATCH_COPY.noScriptureMatch;
    default:
      return SIDEBAR_NO_MATCH_COPY.noResultsInSpace;
  }
}

/** A "Go to" destination. Structurally what the palette's navigation rows were. */
export type LibraryNavigationItem = {
  id: string;
  label: string;
  icon: string;
  keys?: string;
  run: () => void;
};

export type PrototypeLibrarySearchResultsProps = {
  /** The settled query. The host renders the browse body instead when this is empty. */
  query: string;
  /** The active tab — the type filter, in place of the sidebar's chips. */
  tab: LibraryTab;
  navigationItems?: readonly LibraryNavigationItem[];
};

/**
 * A titled group of results.
 *
 * The heading is sticky and carries its own rule, because a result list can run past a
 * screen and a label that scrolls away leaves you reading rows with no idea which group
 * they belong to — the exact question two groups exist to answer.
 *
 * It took `.proto-sidebar-search-section__header` when this was first ported, which was a
 * misnomer twice over: the sidebar had stopped rendering that class, and the treatment
 * (11px uppercase, letter-spaced) was a louder voice than anything else on the surface.
 */
function ResultGroup({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="proto-library-results__group">
      <h3 className="proto-library-results__heading">
        <span className="proto-library-results__heading-text">{heading}</span>
      </h3>
      {children}
    </div>
  );
}

/** A row that runs a verb or goes somewhere, with its chord printed on the right. */
function ChordRow({
  icon,
  label,
  keys,
  onActivate,
}: {
  icon: string;
  label: string;
  keys?: string;
  onActivate: () => void;
}) {
  return (
    <li className="proto-note-row-item">
      <button type="button" className="proto-note-row__main" onClick={onActivate}>
        <div className="proto-note-row__title-line">
          <span className="proto-note-row__kind-icon" aria-hidden>
            {/* Commands and navigation items both carry their glyph as a plain string —
                `PrototypeCommand.icon` is a table entry, not a typed name. */}
            <Icon name={icon as IconName} size={11} />
          </span>
          <span className="pds-list-title proto-note-row__title-text">{label}</span>
          {keys ? <ProtoKbdChord keys={keys} compact /> : null}
        </div>
      </button>
    </li>
  );
}

export default function PrototypeLibrarySearchResults({
  query,
  tab,
  navigationItems,
}: PrototypeLibrarySearchResultsProps) {
  const trimmed = query.trim();
  const data = useLibraryPanelData();
  const { setLibraryPanelView, closeLibraryPanel } = useProtoShell();
  const navigate = useNavigate();
  const { ctx, run } = useLibraryCommandContext();

  /* The same corpora the All tab merges, scoped the same way — see `PrototypeLibraryAllView`.
     Everything reads through React Query's cache under the keys the browse views already
     warmed, so typing costs no fetches beyond the FTS call below. */
  const folderRegistryQuery = usePrototypeFolderRegistry(data.spaceId ?? undefined);
  const clustersQuery = usePrototypeStudyThreads(
    data.isScopedSharedSpace ? undefined : data.spaceId ?? undefined,
  );
  const groupThreadsQuery = useSpaceGroupThreads(
    data.isScopedSharedSpace ? data.spaceId ?? undefined : undefined,
  );
  const highlightsQuery = usePrototypeSpaceStudyThreadHighlights(data.spaceId ?? undefined);
  const scriptureQuery = usePrototypeSpaceScriptureIndex(data.spaceId ?? undefined);
  const libraryQuery = useLibrary();

  const clusters = clustersQuery.data ?? NONE;
  const sharedThreads = groupThreadsQuery.data ?? NONE;
  const highlights = highlightsQuery.data ?? NONE;
  const scriptureBooks = scriptureQuery.data ?? NONE;
  /*
   * Resources are personal even while a shared space is open — `useLibrary` fetches the
   * viewer's own shelf regardless of scope. Searching them from inside a shared space
   * would answer a question about the room with rows from your private shelf, so the kind
   * is omitted there rather than filtered. Same bargain the All tab strikes.
   */
  const resources = data.isScopedSharedSpace ? NONE : libraryQuery.data?.items ?? NONE;

  const highlightsById = useMemo(() => {
    const map = new Map<string, PrototypeHighlightStudyThreadRow>();
    for (const row of highlights) map.set(row.id, row);
    return map;
  }, [highlights]);

  const resourcesById = useMemo(() => {
    const map = new Map<string, LibraryItem>();
    for (const item of resources) map.set(item.id, item);
    return map;
  }, [resources]);

  /* Registry-merged, so a folder made and not yet filled is still findable by name —
     otherwise searching for one you just created says it does not exist. */
  const folders = useMemo(
    () => mergeFoldersWithRegistry(buildFoldersFromNotes(data.notes), folderRegistryQuery.data ?? []),
    [data.notes, folderRegistryQuery.data],
  );

  /* A shared space's Threads are records rather than graph clusters, so they are adapted
     into the shape the builder searches. Without this, Threads are browsable in a shared
     space and unfindable in it. */
  const threadClusters = useMemo<StudyThreadCluster[]>(() => {
    if (!data.isScopedSharedSpace) return clusters;
    return sharedThreads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      suggestedTitle: null,
      hasCustomTitle: true,
      noteCount: thread.noteCount,
      updatedAt: thread.updatedAt,
      memberIds: [],
    }));
  }, [data.isScopedSharedSpace, clusters, sharedThreads]);

  /* Mirrors the sidebar: below the FTS minimum the query key stays empty rather than
     churning one cache entry per character on the way to a real search. */
  const ftsQuery = trimmed.length >= MIN_SEARCH_QUERY_LENGTH ? trimmed : '';
  const ftsSearch = useSearch(
    ftsQuery,
    { spaceId: data.spaceId ?? '', excludeLegacyScriptureNotes: true },
    'notes',
  );

  const searchData: UniversalSearchData = useMemo(
    () => ({
      notes: data.notes,
      folders,
      highlights,
      scriptureBooks,
      threadClusters,
      /* Only `buildActiveViewResults` reads these, and the panel has no active view to
         drill — the tab row replaced the sidebar's mode-plus-drilldown context. */
      threadDrillNodes: NONE,
      ftsNotes: ftsSearch.data?.results,
    }),
    [data.notes, folders, highlights, scriptureBooks, threadClusters, ftsSearch.data?.results],
  );

  /*
   * `resources` is not a search type. `SidebarElsewhereTypeFilter` has never carried the
   * kind (the sidebar has no Resources scope), so on that tab the builder is asked for
   * nothing and the rows come from the resource pass below instead.
   */
  const builderTypeFilter: SidebarElsewhereTypeFilter | null = tab === 'resources' ? null : tab;

  const elsewhereResults = useMemo(
    () =>
      builderTypeFilter
        ? buildElsewhereResults(
            trimmed,
            searchData,
            EXCLUDE_NOTHING,
            builderTypeFilter,
            resolveClusterTitle,
          )
        : [],
    [trimmed, searchData, builderTypeFilter],
  );

  /* Appended rather than interleaved: the builder ranks its own kinds by title affinity
     and there is no way into that ordering from outside it. */
  const resourceResults = useMemo<SidebarSearchResult[]>(() => {
    if (!trimmed || !libraryTabMatches(tab, 'resource')) return [];
    const searchable = resources.map((item) => ({
      item,
      title: item.title,
      subtitle: resourceSubtitle(item) ?? '',
    }));
    return fuzzyFilter(searchable, ['title', 'subtitle'], trimmed).map((entry) => ({
      id: sidebarSearchResultStableId('resource', entry.item.id),
      kind: 'resource' as const,
      title: entry.item.title,
      subtitle: resourceSubtitle(entry.item),
    }));
  }, [trimmed, tab, resources]);

  /**
   * A named passage is a destination, not a match inside one space, so it leads every
   * scope rather than belonging to one — switching tabs should not make the passage you
   * just asked for disappear. It respects the Elsewhere type chips like any other row.
   *
   * (Ported from the sidebar, where the chips are what the tab row is here — so "respects
   * the type chips" reads as `libraryTabMatches`.)
   */
  const scriptureReferenceResult = useMemo(() => buildScriptureReferenceResult(trimmed), [trimmed]);
  const leadingResults = useMemo(() => {
    if (!scriptureReferenceResult) return [];
    if (!libraryTabMatches(tab, 'scriptureReference')) return [];
    return [scriptureReferenceResult];
  }, [scriptureReferenceResult, tab]);

  const commands = useMemo(() => matchPrototypeCommands(ctx, trimmed), [ctx, trimmed]);

  const navMatches = useMemo(
    () => (navigationItems ?? []).filter((item) => fuzzyMatches(trimmed, item.label)),
    [navigationItems, trimmed],
  );

  const tabResults = useMemo(
    () => [...elsewhereResults, ...resourceResults],
    [elsewhereResults, resourceResults],
  );

  /**
   * A leading result belongs to no scope, so a scope with no matches of its own still
   * has something to render. Without this the per-scope empty state paints over the
   * passage row in exactly the case the row exists for — a passage no note has cited
   * yet — which is the whole reason the row was added.
   *
   * (Ported from the sidebar, where the same exemption is a `hasLeadingResult` guard on
   * each scope's empty branch. Concatenating here does the same job structurally: the
   * empty state is chosen from *this* list, so the passage row can never be painted over.)
   */
  const visibleResults = useMemo(
    () => [...leadingResults, ...tabResults],
    [leadingResults, tabResults],
  );

  /**
   * Everything the chosen kind excludes, as a second group below it.
   *
   * Searching inside a kind should not hide the rest of the answer. The sidebar solved
   * this with scope tabs — the list you are in, then Elsewhere — and the shape is right
   * even though the control is not: a tab makes you *notice* you are missing something
   * before you can go get it, where a group below simply hands it to you.
   *
   * Empty on the All kind, where there is no "else" to show.
   */
  const elsewhereRest = useMemo(() => {
    if (!trimmed || tab === 'all') return [];
    /* Every id already shown, so nothing appears twice — this is exactly what the
       builder's exclude set is for. */
    const shown = new Set(visibleResults.map((r) => r.id));
    const rest = buildElsewhereResults(
      trimmed,
      searchData,
      shown,
      'all',
      resolveClusterTitle,
    );
    /* Resources are not a kind the builder knows, so they are added the same way they
       are on the Resources kind — appended rather than interleaved. */
    const restResources = libraryTabMatches(tab, 'resource')
      ? []
      : resources
          .filter((item) => !shown.has(sidebarSearchResultStableId('resource', item.id)))
          .map((item) => ({
            item,
            title: item.title,
            subtitle: resourceSubtitle(item) ?? '',
          }))
          .filter((entry) => fuzzyMatches(trimmed, entry.title, entry.subtitle))
          .map<SidebarSearchResult>((entry) => ({
            id: sidebarSearchResultStableId('resource', entry.item.id),
            kind: 'resource' as const,
            title: entry.item.title,
            subtitle: resourceSubtitle(entry.item),
          }));
    return [...rest, ...restResources];
  }, [trimmed, tab, searchData, visibleResults, resources]);

  const ftsLoading = ftsSearch.isLoading && Boolean(ftsQuery);

  const activate = (result: SidebarSearchResult) => {
    switch (result.kind) {
      case 'note': {
        if (!result.noteId) return;
        data.openNote(
          data.resolveDrillNoteRow({ id: result.noteId, title: result.title }),
        );
        return;
      }
      case 'highlight': {
        const row = result.highlightId ? highlightsById.get(result.highlightId) : undefined;
        if (row) data.openHighlight(row);
        return;
      }
      case 'resource': {
        const item = result.id.startsWith('resource:')
          ? resourcesById.get(result.id.slice('resource:'.length))
          : undefined;
        if (item) data.openResource(item);
        return;
      }
      /*
       * Drills stay on the tab you searched from, they do not jump to the kind's own tab —
       * the tab is where Back returns to, and being returned somewhere you never visited
       * is the confusion carrying the tab explicitly was meant to remove. Same rule the
       * All tab follows.
       */
      case 'folder':
        setLibraryPanelView({ tab, drill: { kind: 'folder', folderKey: result.folderKey ?? null } });
        return;
      case 'threadCluster': {
        if (!result.threadClusterId) return;
        /* The drill wants the slug, not the representative note id the cluster is keyed by. */
        setLibraryPanelView({
          tab,
          drill: { kind: 'thread', threadId: threadClusterDrillSlug(result.threadClusterId) },
        });
        return;
      }
      case 'scriptureBook':
        if (result.scriptureBookOrder == null) return;
        setLibraryPanelView({
          tab,
          drill: {
            kind: 'scripture',
            drill: {
              level: 'passages',
              bookOrder: result.scriptureBookOrder,
              bookTitle: result.title,
            },
          },
        });
        return;
      case 'scripturePassage':
        if (result.scriptureBookOrder == null || !result.scripturePassageKey) return;
        setLibraryPanelView({
          tab,
          drill: {
            kind: 'scripture',
            drill: {
              level: 'notes',
              bookOrder: result.scriptureBookOrder,
              passageKey: result.scripturePassageKey,
              passageTitle: result.title,
            },
          },
        });
        return;
      case 'scriptureReference': {
        /* A row that names a passage has to show the passage — so this one leaves the
           panel for the reader rather than drilling to a list of notes about it. */
        if (!result.scriptureReference) return;
        const parsed = parseScriptureReference(result.scriptureReference);
        if (!parsed) return;
        void navigate({
          to: prototypeReadRouteTo(),
          params: { book: bookSlug(parsed.book), chapter: String(parsed.chapter) },
          search: {
            /* Set only when the query named a verse, so "John 15" opens at the top of the
               chapter instead of scrolled to verse 1. */
            v: result.scriptureFocusVerse ? String(result.scriptureFocusVerse) : undefined,
            t: undefined,
            req: String(Date.now()),
          },
        });
        /* `preserveHistory` because we just navigated — a plain close pops the panel's own
           entry and lands back on the route we left. */
        closeLibraryPanel({ preserveHistory: true });
        return;
      }
      default:
        return;
    }
  };

  if (!trimmed) return null;

  return (
    <div className="proto-sidebar-search-results">
      <div className="proto-sidebar-search-results__body">
        {commands.length > 0 ? (
          <ResultGroup heading="Actions">
            <ul className="proto-note-list">
              {commands.map((command) => (
                <ChordRow
                  key={command.id}
                  icon={command.icon}
                  label={ctx ? command.label(ctx) : command.referenceLabel}
                  keys={command.keys}
                  onActivate={() => {
                    run?.(command.id);
                    /* Running a verb is the end of browsing, and most of them raise a
                       sheet or a confirm that the panel would sit on top of. */
                    closeLibraryPanel();
                  }}
                />
              ))}
            </ul>
          </ResultGroup>
        ) : null}

        {navMatches.length > 0 ? (
          <ResultGroup heading="Go to">
            <ul className="proto-note-list">
              {navMatches.map((item) => (
                <ChordRow
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  keys={item.keys}
                  onActivate={() => {
                    item.run();
                    /* These navigate, so the panel's history entry has already been left
                       behind — popping it here would undo the destination. */
                    closeLibraryPanel({ preserveHistory: true });
                  }}
                />
              ))}
            </ul>
          </ResultGroup>
        ) : null}

        {/* Named by the kind you are searching inside, so the heading says what the list
            is rather than repeating "Results" above two different lists. */}
        <ResultGroup heading={tab === 'all' ? 'Results' : LIBRARY_TAB_LABELS[tab]}>
          {visibleResults.length > 0 ? (
            <ul className="proto-note-list">
              {visibleResults.map((result) => (
                <PrototypeSidebarSearchResultItem
                  key={result.id}
                  result={result}
                  active={result.kind === 'note' && result.noteId === data.activeNoteFullId}
                  onActivate={() => activate(result)}
                  notesById={data.notesById}
                  highlightsById={highlightsById}
                />
              ))}
            </ul>
          ) : ftsLoading ? (
            <p className="proto-caption proto-sidebar-search-section__empty">Searching notes…</p>
          ) : (
            /* Unreachable while a leading result exists — see `visibleResults`. */
            <PrototypeListNoMatchEmptyState title={emptyTitleForTab(tab)} />
          )}
        </ResultGroup>

        {elsewhereRest.length > 0 ? (
          <ResultGroup heading="Everywhere else">
            <ul className="proto-note-list">
              {elsewhereRest.map((result) => (
                <PrototypeSidebarSearchResultItem
                  key={result.id}
                  result={result}
                  active={result.kind === 'note' && result.noteId === data.activeNoteFullId}
                  onActivate={() => activate(result)}
                  notesById={data.notesById}
                  highlightsById={highlightsById}
                />
              ))}
            </ul>
          </ResultGroup>
        ) : null}
      </div>
    </div>
  );
}
