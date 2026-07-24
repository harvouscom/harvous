/** Whether the note-details orb/shortcut should be available (matches other note orbs). */
export function prototypeToolbarNoteDetailsAvailable(options: {
  isOnNotePage: boolean;
  toolbarNoteId: string | null;
  toolbarNoteLoading: boolean;
  hasToolbarNote: boolean;
  isDraftNoteRoute: boolean;
}): boolean {
  if (!options.isOnNotePage) return false;
  // Drafts: allow Note details so Templates (Start from / Save as) live in the inspector.
  if (options.isDraftNoteRoute) return true;
  return (
    !!options.toolbarNoteId &&
    !options.toolbarNoteLoading &&
    options.hasToolbarNote
  );
}
