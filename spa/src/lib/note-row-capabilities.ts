import { canOrganizeSharedSpaceNote, canPinSharedSpaceItem } from './shared-space-capabilities';

/**
 * What the viewer may do to one note row.
 *
 * Extracted from `PrototypeSidebarNoteRow`, which computed these inline, so the row's ⋯
 * menu and the multi-select bulk bar resolve permissions from one place. Two surfaces
 * deriving the same rules separately is how they drift — and here a drift means either an
 * action that 403s on press or one that is silently withheld.
 *
 * Deliberately synchronous and prop-only: it runs per row in a list. Ownership comes from
 * `row.isOwnNote` (see `isConfirmedForeignNote`), never from `useForeignSharedNote`, which
 * pulls four queries and belongs to note detail.
 */
export type NoteRowCapabilityInput = {
  /** `false` means confirmed foreign; `undefined` is treated as own (fails toward mine). */
  isOwnNote?: boolean;
  /** The list is scoped to a shared space, rather than My Home. */
  isScopedSharedSpace: boolean;
  viewerIsSpaceOwner: boolean;
};

export type NoteRowCapabilities = {
  /** Folder and Thread placement. */
  mayOrganize: boolean;
  mayPin: boolean;
  /** Delete everywhere. */
  mayDelete: boolean;
  /** Detach from / dissolve a Thread cluster. */
  mayManageThread: boolean;
  /** Drop the note's association with the space currently in scope. */
  mayRemoveFromSpace: boolean;
  /** Associate into another space. Shared contexts never offer this. */
  mayShareToSpace: boolean;
};

export function resolveNoteRowCapabilities(input: NoteRowCapabilityInput): NoteRowCapabilities {
  const isOwnNote = input.isOwnNote !== false;
  const { isScopedSharedSpace, viewerIsSpaceOwner } = input;

  return {
    mayOrganize:
      !isScopedSharedSpace || canOrganizeSharedSpaceNote({ isOwnNote, isSpaceOwner: viewerIsSpaceOwner }),
    mayPin: !isScopedSharedSpace || canPinSharedSpaceItem({ isSpaceOwner: viewerIsSpaceOwner }),
    /**
     * Delete means delete everywhere, so it is offered only from My Home — matching
     * `resolveInspectorNoteAction`, which returns `remove-from-space` inside a space and
     * never `delete-everywhere`. The server is looser (it would delete your own note from
     * anywhere); the product rule is the tighter one.
     */
    mayDelete: !isScopedSharedSpace && isOwnNote,
    mayManageThread: !isScopedSharedSpace || viewerIsSpaceOwner,
    /** Only meaningful in a space, and only for your own note or a space you own. */
    mayRemoveFromSpace: isScopedSharedSpace && (isOwnNote || viewerIsSpaceOwner),
    /** `canShare` is false in any shared context (see resolveNativeToolbarContextCapabilities). */
    mayShareToSpace: !isScopedSharedSpace && isOwnNote,
  };
}

/** Bulk enablement: an action lights up only when it applies to every selected note. */
export function everyRowAllows(
  rows: readonly NoteRowCapabilityInput[],
  capability: keyof NoteRowCapabilities,
): boolean {
  if (rows.length === 0) return false;
  return rows.every((row) => resolveNoteRowCapabilities(row)[capability]);
}
