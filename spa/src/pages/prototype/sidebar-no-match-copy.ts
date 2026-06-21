/** Sidebar search/filter no-match copy — keep aligned with native `SidebarNoMatchCopy`. */
export const SIDEBAR_NO_MATCH_COPY = {
  noResultsInSpace: 'Nothing found here',
  noMatchesInView: 'Nothing in this view',
  /** Legacy fallback — prefer `elsewhereEmptyStateTitle()` for universal search Elsewhere scope. */
  noOtherMatches: 'Nothing elsewhere',
  noNotesMatch: 'No notes found',
  noFoldersMatch: 'No folders found',
  noHighlightsMatch: 'No highlights found',
  noScriptureMatch: 'No references found',
  noThreadsMatch: 'No threads found',
} as const;
