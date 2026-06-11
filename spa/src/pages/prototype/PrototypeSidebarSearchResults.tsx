import { useMemo, useState } from 'react';
import Icon from '@/components/react/Icon';
import { useSearch } from '@/hooks/useSearch';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { PrototypeHighlightStudyThreadRow } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import type { StudyThreadCluster } from '../../hooks/queries/usePrototypeStudyThreads';
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
  type ActiveSearchContext,
  type ScriptureDrillState,
  type UniversalSearchData,
} from './sidebar-universal-search';

const HIGHLIGHT_KIND_OPTIONS: { id: HighlightKindFilter; label: string; iconName?: string }[] = [
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
};

function SearchFilterChipBar<T extends string>({
  ariaLabel,
  options,
  selectedId,
  onSelect,
}: {
  ariaLabel: string;
  options: { id: T; label: string; iconName?: string }[];
  selectedId: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="proto-chip-bar" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = selectedId === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`proto-chip${selected ? ' proto-chip--selected' : ''}`}
            onClick={() => onSelect(opt.id)}
          >
            {opt.iconName ? <Icon name={opt.iconName} size={11} aria-hidden /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

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
}: PrototypeSidebarSearchResultsProps) {
  const [searchScope, setSearchScope] = useState<SidebarSearchScope>('active');
  const [elsewhereTypeFilter, setElsewhereTypeFilter] = useState<SidebarElsewhereTypeFilter>('all');
  const trimmed = query.trim();
  const debouncedFtsQuery = trimmed.length >= MIN_SEARCH_QUERY_LENGTH ? trimmed : '';

  const ftsQuery = useSearch(
    debouncedFtsQuery,
    { spaceId: homeSpaceId, excludeLegacyScriptureNotes: true },
    'notes',
  );

  const searchData: UniversalSearchData = useMemo(
    () => ({
      ...data,
      ftsNotes: ftsQuery.data?.results,
    }),
    [data, ftsQuery.data?.results],
  );

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

  const activeViewLabel = activeSearchSectionHeader(activeSearchContext);
  const scopeOptions = useMemo(
    () => [
      { id: 'active' as const, label: activeViewLabel },
      { id: 'elsewhere' as const, label: 'Elsewhere' },
    ],
    [activeViewLabel],
  );

  const showHighlightKindBar =
    searchScope === 'active' && activeSearchContext.mode === 'highlights';
  const showElsewhereTypeBar = searchScope === 'elsewhere';

  const visibleResults = searchScope === 'active' ? activeResults : elsewhereResults;
  const bothScopesEmpty =
    activeResults.length === 0 && elsewhereResults.length === 0 && !ftsQuery.isLoading;

  if (!trimmed) return null;

  return (
    <div className="proto-sidebar-search-results">
      <div className="proto-sidebar-search-scope">
        <SearchFilterChipBar
          ariaLabel="Search scope"
          options={scopeOptions}
          selectedId={searchScope}
          onSelect={setSearchScope}
        />
      </div>

      {showHighlightKindBar ? (
        <SearchFilterChipBar
          ariaLabel="Highlight kind"
          options={HIGHLIGHT_KIND_OPTIONS}
          selectedId={highlightKindFilter}
          onSelect={onHighlightKindFilterChange}
        />
      ) : null}

      {showElsewhereTypeBar ? (
        <SearchFilterChipBar
          ariaLabel="Elsewhere result type"
          options={SIDEBAR_ELSEWHERE_TYPE_OPTIONS}
          selectedId={elsewhereTypeFilter}
          onSelect={setElsewhereTypeFilter}
        />
      ) : null}

      {bothScopesEmpty ? (
        <PrototypeListNoMatchEmptyState title={SIDEBAR_NO_MATCH_COPY.noResultsInSpace} />
      ) : searchScope === 'active' && activeResults.length === 0 ? (
        <PrototypeListNoMatchEmptyState title={SIDEBAR_NO_MATCH_COPY.noMatchesInView} />
      ) : searchScope === 'elsewhere' && ftsQuery.isLoading && debouncedFtsQuery ? (
        <p className="proto-caption proto-sidebar-search-section__empty">Searching notes…</p>
      ) : searchScope === 'elsewhere' && elsewhereResults.length === 0 ? (
        <PrototypeListNoMatchEmptyState title={SIDEBAR_NO_MATCH_COPY.noOtherMatches} />
      ) : (
        <SearchResultSection
          results={visibleResults}
          notesById={notesById}
          highlightsById={highlightsById}
          isResultActive={isResultActive}
          onActivateResult={onActivateResult}
        />
      )}
    </div>
  );
}

export type { ActiveSearchContext, ScriptureDrillState };
