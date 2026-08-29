/**
 * Selecting rows in the search panel, and pointing the six verbs at them.
 *
 * The selection itself is the shell's, not this hook's, and that is the whole design. The
 * organize host reads `sidebarSelectedIds` to know what a sheet is about, so a panel keeping
 * its own list would have to copy it over at the moment a verb ran — and the two would
 * disagree the first time anything cleared one and not the other. One selection, whichever
 * surface is showing it.
 *
 * That also means opening the panel over a standing sidebar selection keeps it, which is the
 * behaviour the panel's Actions group already relied on.
 *
 * **Notes only, for now.** The six verbs are note verbs; the sidebar's folder, Thread and
 * highlight lists have their own bars with their own (mostly delete-only) actions, and those
 * have not moved yet.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import {
  publishPrototypeCommandContext,
} from '../../../lib/prototype-command-context-store';
import {
  useOrganizeApi,
  type OrganizeRunOptions,
} from '../../../lib/prototype-organize-runner-store';
import type { CommandContext, PrototypeCommandId } from '../../../lib/prototype-commands';
import type { LibraryTab } from '../sidebar-search-types';
import type { SpaceNoteRow } from '../../../hooks/queries/useSpace';

/**
 * Which tabs can be selected in, and what a selection there means.
 *
 * `all` is deliberately absent. It lists notes beside folders, Threads and passages, so
 * "select these" has no single answer — and a checkbox that appears on some rows of a list
 * and not others reads as a bug rather than as a rule. Scripture has never been selectable
 * anywhere, for the same reason the sidebar gives: its rows are cards, not list rows.
 */
export function librarySelectionKindForTab(tab: LibraryTab): 'note' | null {
  return tab === 'notes' ? 'note' : null;
}

export type LibrarySelection = {
  /** Whether this tab offers selection at all — gates the header's toggle. */
  available: boolean;
  active: boolean;
  selectedIds: string[];
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  setActive: (on: boolean) => void;
  /** Every selectable row on the tab, for the "select all" control. */
  allSelected: boolean;
  toggleAll: () => void;
  /** Run one of the six against the current selection. Null while the host is not up. */
  run: ((id: PrototypeCommandId, options?: OrganizeRunOptions) => void) | null;
  context: CommandContext | null;
};

export function useLibrarySelection(input: {
  tab: LibraryTab;
  rows: SpaceNoteRow[];
  isScopedSharedSpace: boolean;
  viewerIsSpaceOwner: boolean;
}): LibrarySelection {
  const {
    sidebarSelectMode,
    setSidebarSelectMode,
    sidebarSelectedIds,
    sidebarSelectionKind,
    setSidebarSelection,
  } = useProtoShell();
  const organize = useOrganizeApi();

  const kind = librarySelectionKindForTab(input.tab);
  const available = kind !== null;
  const active = available && sidebarSelectMode && sidebarSelectionKind === kind;

  /* Leaving a tab that could be selected in has to put the mode away with it, or the next
     tab renders a bar for a selection its rows cannot show. */
  useEffect(() => {
    if (!available && sidebarSelectMode) setSidebarSelectMode(false);
  }, [available, sidebarSelectMode, setSidebarSelectMode]);

  const selectedIds = active ? sidebarSelectedIds : [];
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggle = useCallback(
    (id: string) => {
      if (!kind) return;
      const next = selectedSet.has(id)
        ? selectedIds.filter((existing) => existing !== id)
        : [...selectedIds, id];
      setSidebarSelection(kind, next);
    },
    [kind, selectedIds, selectedSet, setSidebarSelection],
  );

  const allSelected = input.rows.length > 0 && input.rows.every((r) => selectedSet.has(r.id));
  const toggleAll = useCallback(() => {
    if (!kind) return;
    setSidebarSelection(kind, allSelected ? [] : input.rows.map((r) => r.id));
  }, [kind, allSelected, input.rows, setSidebarSelection]);

  const setActive = useCallback(
    (on: boolean) => {
      if (!kind) return;
      /* Entering names the kind; leaving clears it. Setting the mode without the kind is
         what let the sidebar clear a note selection from inside a folders list. */
      if (on) setSidebarSelection(kind, []);
      setSidebarSelectMode(on);
    },
    [kind, setSidebarSelection, setSidebarSelectMode],
  );

  /**
   * What a verb is pointed at.
   *
   * Null when a selected id is not among the loaded rows: a row scrolled past the page
   * boundary has no capability input, and guessing one is how a batch half-applies. The
   * sidebar's builder refuses for exactly the same reason.
   */
  const context = useMemo<CommandContext | null>(() => {
    if (!active || selectedIds.length === 0) return null;
    const rows = input.rows.filter((r) => selectedSet.has(r.id));
    if (rows.length !== selectedIds.length) return null;
    return {
      kind: 'note',
      ids: selectedIds,
      rows: rows.map((r) => ({
        isOwnNote: r.isOwnNote,
        isScopedSharedSpace: input.isScopedSharedSpace,
        viewerIsSpaceOwner: input.viewerIsSpaceOwner,
      })),
      fromSelection: true,
      isScopedSharedSpace: input.isScopedSharedSpace,
    };
  }, [active, selectedIds, selectedSet, input.rows, input.isScopedSharedSpace, input.viewerIsSpaceOwner]);

  /*
   * Publish while a selection stands, so ⇧K's Actions group and the chords act on the
   * panel's rows rather than on whatever the sidebar was last showing. Unpublishing on
   * cleanup is what hands the answer back to the sidebar when the panel closes.
   */
  useEffect(() => {
    if (!context || !organize) return undefined;
    return publishPrototypeCommandContext(
      () => context,
      (id) => organize.run(id, context),
    );
  }, [context, organize]);

  const run = useMemo(() => {
    if (!organize || !context) return null;
    return (id: PrototypeCommandId, options?: OrganizeRunOptions) =>
      organize.run(id, context, options);
  }, [organize, context]);

  return {
    available,
    active,
    selectedIds,
    isSelected: (id: string) => selectedSet.has(id),
    toggle,
    setActive,
    allSelected,
    toggleAll,
    run,
    context,
  };
}
