/**
 * Copy for destructive confirmations in the 2.0 shell.
 *
 * These used to be duplicated verbatim between the note "more" menu and the inspector,
 * and were written in the data model's vocabulary — "the canonical note", "every shared
 * space, including its connections and responses". A confirm dialog has one job: say what
 * is about to be lost, in the reader's words, and whether it comes back. Keep them to one
 * sentence plus the reversibility clause.
 *
 * Note deletion really is unrecoverable — DELETE /api/notes/delete is a hard cascade and
 * there is no restore endpoint — so "can't be undone" stays.
 */

export const DELETE_NOTE_EVERYWHERE_CONFIRMATION = {
  title: 'Delete this note everywhere?',
  description: 'It will be removed from every space you have shared it in. This can’t be undone.',
} as const;

export const REMOVE_NOTE_FROM_SPACE_CONFIRMATION = {
  title: 'Remove this note from this space?',
  description: 'You keep it in My Home. Replies here are kept and come back if you share it again.',
} as const;

/*
  There is no re-share confirmation any more. Adding a note to a space is a tick in the
  destination row that undoes with one more tick, so a modal in front of it was friction in
  front of a reversible act. The one fact that dialog carried and the act does not — that
  reactivating an old association brings back replies but not placement — moved into the
  success toast, which is the only moment it is true.
*/
