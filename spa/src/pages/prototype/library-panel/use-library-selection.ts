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
 * Four kinds, and the verbs each offers differ. Notes take all six; folders, Threads and
 * highlights take pin and their own destructive, which is what their bars have always had —
 * the command registry already knew this (`organize.delete` never restricted itself to
 * notes, and pin's own comment names these three lists), so the bar asks it rather than
 * carrying a second opinion.
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
import { singleKindCommandParts } from '../../../lib/prototype-commands';
import type { LibraryTab } from '../sidebar-search-types';
import type { LibraryDrill } from './library-panel-view';
import type { SelectableRow } from './use-library-tab-rows';

/**
 * Which tabs can be selected in, and what a selection there means.
 *
 * `all` is deliberately absent. It lists notes beside folders, Threads and passages, so
 * "select these" has no single answer — and a checkbox that appears on some rows of a list
 * and not others reads as a bug rather than as a rule. Scripture is absent for the reason
 * the sidebar gives: its rows are cards, not list rows, and it has never been selectable
 * anywhere. Resources have no bulk actions to offer yet.
 */
export function librarySelectionKindForTab(tab: LibraryTab): LibrarySelectionKind | null {
  switch (tab) {
    /* Everything interleaves the kinds, so its selection is whatever you happen to pick. */
    case 'all':
      return 'mixed';
    case 'notes':
      return 'note';
    case 'folders':
      return 'folder';
    case 'threads':
      return 'thread';
    case 'highlights':
      return 'highlight';
    default:
      return null;
  }
}

/**
 * What a selection is made of *here*, which the tab alone cannot answer.
 *
 * A drill changes the answer completely: the Folders tab lists folders, but one folder opened
 * lists the notes inside it, and a Thread opened lists the notes it joins. Deriving the kind
 * from the tab alone meant selecting inside either drill built a selection of *folder* ids
 * while the reader was looking at notes — the bar would then offer a folder's verbs and act on
 * ids that name nothing.
 *
 * Scripture drills select nothing: their rows are passages and books, which are places rather
 * than things any of the six verbs can act on.
 */
export function librarySelectionKindForView(
  tab: LibraryTab,
  drill: LibraryDrill | null,
): LibrarySelectionKind | null {
  if (!drill) return librarySelectionKindForTab(tab);
  switch (drill.kind) {
    case 'folder':
    case 'thread':
      return 'note';
    case 'scripture':
      return null;
  }
}

export type LibrarySelectionKind = 'note' | 'folder' | 'thread' | 'highlight' | 'mixed';

/**
 * "Everything" selects by composite id — `${kind}:${sourceId}`, the key its rows already use.
 *
 * That is what lets one selection hold a note and a folder without the shell learning a second
 * state shape: the kind travels with each id instead of one kind standing for all of them.
 * These two are the only places that knowledge lives.
 */
export function packMixedId(kind: LibrarySelectionKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

export function unpackMixedId(id: string): { kind: LibrarySelectionKind; sourceId: string } | null {
  const at = id.indexOf(':');
  if (at <= 0) return null;
  const kind = id.slice(0, at) as LibrarySelectionKind;
  if (kind === 'mixed') return null;
  if (!['note', 'folder', 'thread', 'highlight'].includes(kind)) return null;
  return { kind, sourceId: id.slice(at + 1) };
}

export type LibrarySelection = {
  /** Whether this tab offers selection at all — gates the header's toggle. */
  available: boolean;
  /** What a selection here is made of, so the bar knows which verbs to offer. */
  kind: LibrarySelectionKind | null;
  active: boolean;
  selectedIds: string[];
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  setActive: (on: boolean) => void;
  /**
   * Start selecting *with this one already picked*.
   *
   * Not `setActive(true)` followed by `toggle(id)`: entering deliberately clears the
   * selection, so the two calls in that order would land on an empty list. This is the one
   * gesture a reader actually makes — pointing at a thing and saying "this one, and I am
   * about to say more" — and it has to be one operation to survive that clear.
   */
  beginWith: (id: string) => void;
  /** Every selectable row on the tab, for the "select all" control. */
  allSelected: boolean;
  toggleAll: () => void;
  /** Run one of the six against the current selection. Null while the host is not up. */
  run: ((id: PrototypeCommandId, options?: OrganizeRunOptions) => void) | null;
  context: CommandContext | null;
};

export function useLibrarySelection(input: {
  tab: LibraryTab;
  /** The drill on top of the tab, which decides what the rows actually are. */
  drill?: LibraryDrill | null;
  rows: SelectableRow[];
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

  const kind = librarySelectionKindForView(input.tab, input.drill ?? null);
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

  const beginWith = useCallback(
    (id: string) => {
      if (!kind || !id) return;
      setSidebarSelection(kind, [id]);
      setSidebarSelectMode(true);
    },
    [kind, setSidebarSelection, setSidebarSelectMode],
  );

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
    if (!kind || !active || selectedIds.length === 0) return null;
    const rows = input.rows.filter((r) => selectedSet.has(r.id));
    if (rows.length !== selectedIds.length) return null;

    /*
     * A mixed selection unpacks its ids back into kinds and source ids.
     *
     * `ids` stays the *source* ids, because that is what every verb ultimately acts on — the
     * composite form exists to keep the selection addressable while it is being made, not to
     * be handed to a delete call. `items` carries the pairing so the runner can tell which is
     * which. An id that does not unpack means the row and the selection have got out of step,
     * and the whole context is withheld rather than acting on the half that parsed.
     */
    if (kind === 'mixed') {
      const unpacked = selectedIds.map((id) => unpackMixedId(id));
      if (unpacked.some((entry) => entry === null)) return null;
      const items = unpacked
        .filter((entry): entry is { kind: LibrarySelectionKind; sourceId: string } => entry !== null)
        .map((entry) => ({ kind: entry.kind as CommandContext['kind'], id: entry.sourceId }));
      const kinds = [...new Set(items.map((item) => item.kind))];
      return {
        /* Wording only — every gate reads `kinds`. The commonest kind is the one a sentence
           about this pile would naturally be built around. */
        kind: kinds.length === 1 ? kinds[0] : 'mixed',
        kinds,
        ids: items.map((item) => item.id),
        items,
        rows: rows.map((r) => ({
          isOwnNote: r.isOwnNote,
          isScopedSharedSpace: input.isScopedSharedSpace,
          viewerIsSpaceOwner: input.viewerIsSpaceOwner,
        })),
        fromSelection: true,
        isScopedSharedSpace: input.isScopedSharedSpace,
      };
    }

    return {
      kind,
      ...singleKindCommandParts(kind, selectedIds),
      ids: selectedIds,
      rows: rows.map((r) => ({
        isOwnNote: r.isOwnNote,
        isScopedSharedSpace: input.isScopedSharedSpace,
        viewerIsSpaceOwner: input.viewerIsSpaceOwner,
      })),
      fromSelection: true,
      isScopedSharedSpace: input.isScopedSharedSpace,
    };
  }, [
    kind,
    active,
    selectedIds,
    selectedSet,
    input.rows,
    input.isScopedSharedSpace,
    input.viewerIsSpaceOwner,
  ]);

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
    kind,
    active,
    selectedIds,
    isSelected: (id: string) => selectedSet.has(id),
    toggle,
    setActive,
    beginWith,
    allSelected,
    toggleAll,
    run,
    context,
  };
}
