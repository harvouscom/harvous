/** Whether the note-details orb/shortcut should be available (matches other note orbs). */
export function prototypeToolbarNoteDetailsAvailable(options: {
  isOnNotePage: boolean;
  toolbarNoteId: string | null;
  toolbarNoteLoading: boolean;
  hasToolbarNote: boolean;
  isDraftNoteRoute: boolean;
}): boolean {
  return (
    options.isOnNotePage &&
    !!options.toolbarNoteId &&
    !options.toolbarNoteLoading &&
    options.hasToolbarNote &&
    !options.isDraftNoteRoute
  );
}
