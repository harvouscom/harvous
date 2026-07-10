/** Minimal row fields needed to decide sidebar highlight active state. */
export type SidebarHighlightRowRef = {
  id: string;
};

export type SidebarHighlightActiveContext = {
  /** From note route search: `?highlight=` (prose / mini / linked highlights). */
  highlightSearchId?: string | null;
  /** From note route search: `?studyThread=` (reference + scripture-via-note flows). */
  studyThreadSearchId?: string | null;
  /** Standalone scripture passage pane focus (passage highlight rows). */
  standaloneFocusedHighlightThreadId?: string | null;
};

/** Resolve the single study-thread id that should drive sidebar row selection. */
export function resolveSidebarFocusedHighlightThreadId(
  ctx: SidebarHighlightActiveContext,
): string | null {
  const fromSearch = ctx.highlightSearchId?.trim() || ctx.studyThreadSearchId?.trim();
  if (fromSearch) return fromSearch;
  const standalone = ctx.standaloneFocusedHighlightThreadId?.trim();
  return standalone || null;
}

/** True only when this row was explicitly opened (native `sidebarSelectedThreadId` parity). */
export function isSidebarHighlightRowActive(
  row: SidebarHighlightRowRef,
  ctx: SidebarHighlightActiveContext,
): boolean {
  const focusedId = resolveSidebarFocusedHighlightThreadId(ctx);
  if (!focusedId) return false;
  return row.id === focusedId;
}

/** Search params to pass when opening a note from the Notes list (clears highlight deep-link state). */
export const PROTOTYPE_NOTE_LIST_NAV_SEARCH: {
  studyThread: string | undefined;
  reference: string | undefined;
  scriptureRef: string | undefined;
  scriptureTranslation: string | undefined;
  highlight: string | undefined;
  dockReq: string | undefined;
  crossRefTarget: string | undefined;
  space: string | undefined;
} = {
  studyThread: undefined,
  reference: undefined,
  scriptureRef: undefined,
  scriptureTranslation: undefined,
  highlight: undefined,
  dockReq: undefined,
  crossRefTarget: undefined,
  space: undefined,
};

/** Keep note detail reads scoped to the list the row came from. */
export function prototypeNoteListNavigationSearch(options: {
  isScopedSharedSpace: boolean;
  spaceId?: string | null;
}): typeof PROTOTYPE_NOTE_LIST_NAV_SEARCH {
  const trimmed = options.spaceId?.trim();
  return {
    ...PROTOTYPE_NOTE_LIST_NAV_SEARCH,
    space:
      options.isScopedSharedSpace && trimmed
        ? trimmed.startsWith('space_')
          ? trimmed
          : `space_${trimmed}`
        : undefined,
  };
}

/** Parse highlight deep-link ids from TanStack Router search (object or query string). */
export function parsePrototypeNoteHighlightSearch(search: unknown): {
  highlightSearchId?: string;
  studyThreadSearchId?: string;
  dockReq?: string;
} {
  if (search && typeof search === 'object' && !Array.isArray(search)) {
    const s = search as Record<string, unknown>;
    return {
      highlightSearchId: typeof s.highlight === 'string' ? s.highlight : undefined,
      studyThreadSearchId: typeof s.studyThread === 'string' ? s.studyThread : undefined,
      dockReq: typeof s.dockReq === 'string' ? s.dockReq : undefined,
    };
  }
  const raw =
    typeof search === 'string'
      ? search.startsWith('?')
        ? search.slice(1)
        : search
      : typeof window !== 'undefined'
        ? window.location.search.replace(/^\?/, '')
        : '';
  if (!raw) return {};
  const params = new URLSearchParams(raw);
  const highlight = params.get('highlight');
  const studyThread = params.get('studyThread');
  const dockReq = params.get('dockReq');
  return {
    highlightSearchId: highlight ?? undefined,
    studyThreadSearchId: studyThread ?? undefined,
    dockReq: dockReq ?? undefined,
  };
}
