import { useMemo, useState } from 'react';
import { useSearch } from '@/hooks/useSearch';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { PrototypeHighlightStudyThreadRow } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import type { StudyThreadCluster } from '../../hooks/queries/usePrototypeStudyThreads';
import ProtoChipBar, { type ProtoChipOption } from './components/ProtoChipBar';
import { PrototypeListNoMatchEmptyState } from './PrototypeListEmptyState';
import PrototypeSidebarSearchResultItem from './PrototypeSidebarSearchResultItem';
import { SIDEBAR_NO_MATCH_COPY } from './sidebar-no-match-copy';
import {
  SIDEBAR_ELSEWHERE_TYPE_OPTIONS,
  type HighlightKindFilter,
  type SidebarElsewhereTypeFilter,
  type SidebarSearchResult,
  type SidebarSearchScope,
} from './sidebar-search-types';
import {
  activeSearchSectionHeader,
  buildActiveViewResults,
  buildElsewhereResults,
  elsewhereEmptyStateTitle,
  myHomeEmptyStateTitle,
  type ActiveSearchContext,
  type ScriptureDrillState,
  type UniversalSearchData,
} from './sidebar-universal-search';

const HIGHLIGHT_KIND_OPTIONS: ProtoChipOption<HighlightKindFilter>[] = [
  { id: 'all', label: 'All' },
  { id: 'notes', label: 'Notes', iconName: 'note-sticky' },
  { id: 'connected', label: 'Connected', iconName: 'arrow-right-arrow-left' },
  { id: 'scripture', label: 'Scripture', iconName: 'book-open' },
  { id: 'references', label: 'References', iconName: 'lines-leaning' },
];

export type PrototypeSidebarSearchResultsProps = {
  query: string;
  homeSpaceId: string;
  activeNoteFullId: string | undefined;
  activeSearchContext: ActiveSearchContext;
  data: Omit<UniversalSearchData, 'ftsNotes'>;
  notesById: Map<string, SpaceNoteRow>;
  highlightsById: Map<string, PrototypeHighlightStudyThreadRow>;
  resolveClusterTitle: (cluster: StudyThreadCluster) => string;
  highlightKindFilter: HighlightKindFilter;
  onHighlightKindFilterChange: (filter: HighlightKindFilter) => void;
  onActivateResult: (result: SidebarSearchResult) => void;
  isResultActive: (result: SidebarSearchResult) => boolean;
  /** When true, adds a My Home tab that searches personal notes without switching spaces. */
  shellIsSharedSpace?: boolean;
  personalHomeSpaceId?: string | null;
  myHomeData?: Omit<UniversalSearchData, 'ftsNotes'>;
  myHomeNotesById?: Map<string, SpaceNoteRow>;
  myHomeHighlightsById?: Map<string, PrototypeHighlightStudyThreadRow>;
};

function SearchResultSection({
  results,
  notesById,
  highlightsById,
  isResultActive,
  onActivateResult,
}: {
  results: SidebarSearchResult[];
  notesById: Map<string, SpaceNoteRow>;
  highlightsById: Map<string, PrototypeHighlightStudyThreadRow>;
  isResultActive: (result: SidebarSearchResult) => boolean;
  onActivateResult: (result: SidebarSearchResult) => void;
}) {
  return (
    <ul className="proto-note-list">
      {results.map((result) => (
        <PrototypeSidebarSearchResultItem
          key={result.id}
          result={result}
          active={isResultActive(result)}
          onActivate={() => onActivateResult(result)}
          notesById={notesById}
          highlightsById={highlightsById}
        />
      ))}
    </ul>
  );
}

export default function PrototypeSidebarSearchResults({
  query,
  homeSpaceId,
  activeSearchContext,
  data,
  notesById,
  highlightsById,
  resolveClusterTitle,
  highlightKindFilter,
  onHighlightKindFilterChange,
  onActivateResult,
  isResultActive,
  shellIsSharedSpace = false,
  personalHomeSpaceId,
  myHomeData,
  myHomeNotesById,
  myHomeHighlightsById,
}: PrototypeSidebarSearchResultsProps) {
  const [searchScope, setSearchScope] = useState<SidebarSearchScope>('active');
  const [elsewhereTypeFilter, setElsewhereTypeFilter] = useState<SidebarElsewhereTypeFilter>('all');
  const trimmed = query.trim();
  const debouncedFtsQuery = trimmed.length >= MIN_SEARCH_QUERY_LENGTH ? trimmed : '';

  const showMyHomeTab = Boolean(shellIsSharedSpace && personalHomeSpaceId);

  const ftsQuery = useSearch(
    debouncedFtsQuery,
    { spaceId: homeSpaceId, excludeLegacyScriptureNotes: true },
    'notes',
  );

  const myHomeFtsQuery = useSearch(
    showMyHomeTab && searchScope === 'my-home' ? debouncedFtsQuery : '',
    { spaceId: personalHomeSpaceId ?? '', excludeLegacyScriptureNotes: true },
    'notes',
  );

  const searchData: UniversalSearchData = useMemo(
    () => ({
      ...data,
      ftsNotes: ftsQuery.data?.results,
    }),
    [data, ftsQuery.data?.results],
  );

  const myHomeSearchData: UniversalSearchData | null = useMemo(() => {
    if (!showMyHomeTab || !myHomeData) return null;
    return {
      ...myHomeData,
      ftsNotes: myHomeFtsQuery.data?.results,
    };
  }, [showMyHomeTab, myHomeData, myHomeFtsQuery.data?.results]);

  const activeResults = useMemo(
    () => buildActiveViewResults(activeSearchContext, trimmed, searchData, resolveClusterTitle),
    [activeSearchContext, trimmed, searchData, resolveClusterTitle],
  );

  const excludeIds = useMemo(() => new Set(activeResults.map((r) => r.id)), [activeResults]);

  const elsewhereResults = useMemo(
    () =>
      buildElsewhereResults(trimmed, searchData, excludeIds, elsewhereTypeFilter, resolveClusterTitle),
    [trimmed, searchData, excludeIds, elsewhereTypeFilter, resolveClusterTitle],
  );

  const myHomeResults = useMemo(() => {
    if (!myHomeSearchData) return [];
    return buildElsewhereResults(
      trimmed,
      myHomeSearchData,
      new Set(),
      elsewhereTypeFilter,
      resolveClusterTitle,
    );
  }, [trimmed, myHomeSearchData, elsewhereTypeFilter, resolveClusterTitle]);

  const activeViewLabel = activeSearchSectionHeader(activeSearchContext);
  const scopeOptions = useMemo(() => {
    const opts: { id: SidebarSearchScope; label: string; iconName?: string }[] = [
      { id: 'active', label: activeViewLabel },
      { id: 'elsewhere', label: 'Elsewhere' },
    ];
    if (showMyHomeTab) {
      opts.push({ id: 'my-home', label: 'My Home', iconName: 'house' });
    }
    return opts;
  }, [activeViewLabel, showMyHomeTab]);

  const showHighlightKindBar =
    searchScope === 'active' && activeSearchContext.mode === 'highlights';
  const showElsewhereTypeBar = searchScope === 'elsewhere' || searchScope === 'my-home';

  const visibleResults =
    searchScope === 'active'
      ? activeResults
      : searchScope === 'my-home'
        ? myHomeResults
        : elsewhereResults;
  const visibleNotesById =
    searchScope === 'my-home' && myHomeNotesById ? myHomeNotesById : notesById;
  const visibleHighlightsById =
    searchScope === 'my-home' && myHomeHighlightsById ? myHomeHighlightsById : highlightsById;

  const myHomeLoading = searchScope === 'my-home' && myHomeFtsQuery.isLoading && debouncedFtsQuery;
  const allScopesEmpty =
    activeResults.length === 0 &&
    elsewhereResults.length === 0 &&
    myHomeResults.length === 0 &&
    !ftsQuery.isLoading &&
    !myHomeLoading;

  if (!trimmed) return null;

  return (
    <div className="proto-sidebar-search-results">
      <div className="proto-sidebar-search-scope">
        <ProtoChipBar
          ariaLabel="Search scope"
          options={scopeOptions}
          selectedId={searchScope}
          onSelect={setSearchScope}
        />
      </div>

      {showHighlightKindBar ? (
        <ProtoChipBar
          ariaLabel="Highlight kind"
          options={HIGHLIGHT_KIND_OPTIONS}
          selectedId={highlightKindFilter}
          onSelect={onHighlightKindFilterChange}
        />
      ) : null}

      {showElsewhereTypeBar ? (
        <ProtoChipBar
          ariaLabel="Elsewhere result type"
          options={SIDEBAR_ELSEWHERE_TYPE_OPTIONS}
          selectedId={elsewhereTypeFilter}
          onSelect={setElsewhereTypeFilter}
        />
      ) : null}

      <div className="proto-sidebar-search-results__body">
        {allScopesEmpty ? (
          <PrototypeListNoMatchEmptyState title={SIDEBAR_NO_MATCH_COPY.noResultsInSpace} />
        ) : searchScope === 'active' && activeResults.length === 0 ? (
          <PrototypeListNoMatchEmptyState title={SIDEBAR_NO_MATCH_COPY.noMatchesInView} />
        ) : searchScope === 'elsewhere' && ftsQuery.isLoading && debouncedFtsQuery ? (
          <p className="proto-caption proto-sidebar-search-section__empty">Searching notes…</p>
        ) : searchScope === 'elsewhere' && elsewhereResults.length === 0 ? (
          <PrototypeListNoMatchEmptyState
            title={elsewhereEmptyStateTitle(activeSearchContext, elsewhereTypeFilter)}
          />
        ) : searchScope === 'my-home' && myHomeLoading ? (
          <p className="proto-caption proto-sidebar-search-section__empty">Searching My Home…</p>
        ) : searchScope === 'my-home' && myHomeResults.length === 0 ? (
          <PrototypeListNoMatchEmptyState title={myHomeEmptyStateTitle(elsewhereTypeFilter)} />
        ) : (
          <SearchResultSection
            results={visibleResults}
            notesById={visibleNotesById}
            highlightsById={visibleHighlightsById}
            isResultActive={isResultActive}
            onActivateResult={onActivateResult}
          />
        )}
      </div>
    </div>
  );
}

export type { ActiveSearchContext, ScriptureDrillState };
