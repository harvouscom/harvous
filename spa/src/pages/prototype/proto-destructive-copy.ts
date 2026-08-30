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
import { destructiveVerbFor } from '../../lib/prototype-commands';

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

/**
 * What a bulk destructive says, by the kind of thing selected.
 *
 * One table because the four confirms were four hand-written strings in three places, and
 * they disagreed about their own verb: two of them removed a *label* while calling the
 * button "Delete", which is the one word a confirm has to get right. Folders and Threads
 * take "Remove" and say what survives; only notes and highlights genuinely delete.
 *
 * `count` is folded in here rather than at the call site so the pluralisation and the noun
 * cannot drift apart from the sentence they sit in.
 */
export function bulkDestructiveCopy(
  kind: 'note' | 'highlight' | 'folder' | 'thread',
  count: number,
): { title: string; description?: string; confirmLabel: string } {
  const s = count === 1 ? '' : 's';
  /* One table for the verb, shared with the command's own label, so the button that raises
     a confirm and the confirm itself cannot end up saying different things. */
  const verb = destructiveVerbFor(kind);
  switch (kind) {
    case 'folder':
      return {
        title: `${verb} ${count} folder${s}?`,
        /* The notes are never touched — `useRemoveFolder` strips the label and nothing else,
           and a confirm that said "delete" would be promising something worse than it does. */
        description: 'The notes in them stay — only the folder goes.',
        confirmLabel: verb,
      };
    case 'thread':
      return {
        title: `${verb} ${count} Thread${s}?`,
        description: 'The notes in them stay — only the connections go.',
        confirmLabel: verb,
      };
    case 'highlight':
      return { title: `${verb} ${count} highlight${s}?`, confirmLabel: verb };
    case 'note':
      return {
        title: `${verb} ${count} note${s} everywhere?`,
        description: DELETE_NOTE_EVERYWHERE_CONFIRMATION.description,
        confirmLabel: verb,
      };
  }
}

/**
 * The confirm for a selection holding more than one kind.
 *
 * A button can only say one verb, and `destructiveVerbForKinds` makes it the stronger one so a
 * note is never described as merely "removed". That leaves the confirm owing the reader the
 * part the label could not carry: what happens to each group, in the order of how bad it is.
 *
 * Notes lead because they are the only ones that genuinely go. Folders and Threads follow with
 * the reassurance they always carry — removing them is a label or a connection coming off, and
 * every note involved is still there afterwards. Saying that here is what makes the stronger
 * button honest rather than alarming.
 */
export function mixedDestructiveCopy(
  counts: { note?: number; highlight?: number; folder?: number; thread?: number },
  total: number,
): { title: string; description?: string; confirmLabel: string } {
  const n = (value: number | undefined, one: string, many: string) =>
    value ? `${value} ${value === 1 ? one : many}` : null;

  const gone = [n(counts.note, 'note', 'notes'), n(counts.highlight, 'highlight', 'highlights')]
    .filter(Boolean)
    .join(' and ');
  const kept = [n(counts.folder, 'folder', 'folders'), n(counts.thread, 'Thread', 'Threads')]
    .filter(Boolean)
    .join(' and ');

  const sentences: string[] = [];
  if (gone) sentences.push(`${gone} will be deleted everywhere.`);
  if (kept) sentences.push(`${kept} will be removed, and the notes in them stay.`);

  return {
    title: `Delete ${total} item${total === 1 ? '' : 's'}?`,
    description: sentences.join(' ') || undefined,
    confirmLabel: 'Delete',
  };
}
