import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrototypeSidebarSearchResults from '../PrototypeSidebarSearchResults';
import { SIDEBAR_NO_MATCH_COPY } from '../sidebar-no-match-copy';
import type { ActiveSearchContext, UniversalSearchData } from '../sidebar-universal-search';

vi.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({ data: undefined, isLoading: false }),
}));

/**
 * The passage row exists for the query nobody has written about yet — that is the whole
 * point of reading it out of the canon instead of the note index. But the results body
 * picks its branch from the *scope's own* results, so a scope with no matches rendered
 * "Nothing in this view" over the row and the feature vanished precisely where it was
 * needed. Building the result and rendering the row in isolation both pass while this
 * is broken, so the assertion has to go through the container.
 */
describe('scripture reference row in an empty scope', () => {
  const emptyData: Omit<UniversalSearchData, 'ftsNotes'> = {
    notes: [],
    folders: [],
    highlights: [],
    scriptureBooks: [],
    threadClusters: [],
    threadDrillNodes: [],
  };

  const activeSearchContext: ActiveSearchContext = {
    mode: 'notes',
    folderDrill: null,
    threadDrillId: undefined,
    scriptureDrill: { level: 'books' },
    highlightKindFilter: 'all',
  };

  function renderResults(query: string) {
    render(
      <PrototypeSidebarSearchResults
        query={query}
        homeSpaceId="space-1"
        activeNoteFullId={undefined}
        activeSearchContext={activeSearchContext}
        data={emptyData}
        notesById={new Map()}
        highlightsById={new Map()}
        resolveClusterTitle={() => ''}
        highlightKindFilter="all"
        onHighlightKindFilterChange={vi.fn()}
        onActivateResult={vi.fn()}
        isResultActive={() => false}
      />,
    );
  }

  it('shows the passage when no note in the view matches', () => {
    renderResults('1 cor 13');

    expect(screen.getByText('1 Corinthians 13')).toBeTruthy();
    expect(screen.getByText('Read passage')).toBeTruthy();
    expect(screen.queryByText(SIDEBAR_NO_MATCH_COPY.noMatchesInView)).toBeNull();
  });

  it('still says nothing matched when the query names no passage', () => {
    renderResults('faith');

    expect(screen.queryByText('Read passage')).toBeNull();
    expect(screen.getByText(SIDEBAR_NO_MATCH_COPY.noResultsInSpace)).toBeTruthy();
  });
});
