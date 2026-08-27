/**
 * Fire-and-forget note-visit logging. The note pane must never wait on, or fail because of,
 * its own analytics — every failure path here is silent on purpose.
 */

import { api } from '../../lib/api';
import type { NoteVisitDwellBucket } from '@/utils/note-visit-kinds';

export function recordNoteVisitEvent(input: {
  noteId: string;
  dwellBucket: NoteVisitDwellBucket;
  /** Fires once the server has the visit, so Home can refresh what it ranks with. */
  onSynced?: () => void;
}): void {
  const { noteId, dwellBucket, onSynced } = input;
  if (!noteId || !dwellBucket) return;

  void api
    .post<{ success?: boolean; recorded?: boolean }>('/api/notes/visit-event', {
      noteId,
      dwellBucket,
    })
    .then(() => onSynced?.())
    .catch(() => {
      // offline, rate limited, signed out, or table not pushed yet — reading continues
    });
}
