export type NoteOwnershipFields = {
  isOwnNote?: boolean;
  userId?: string | null;
};

/** True when the note is confirmed to belong to someone other than the viewer. */
export function isConfirmedForeignNote(
  note: NoteOwnershipFields | null | undefined,
  authUserId: string | null | undefined,
): boolean {
  if (!note) return false;
  if (note.isOwnNote === true) return false;
  if (note.isOwnNote === false) return true;
  if (authUserId && note.userId) return note.userId !== authUserId;
  return false;
}
