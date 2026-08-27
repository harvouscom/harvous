/**
 * Measure one note-reading session and log it, fire-and-forget.
 *
 * The note-side twin of `useReadingSession`, and it lives beside it rather than inside the
 * note page for the same reason: the pane that hosts it will be replaced before the signal
 * is, and whatever replaces it should call exactly this hook rather than growing its own
 * copy.
 *
 * Dwell is attention time, not wall-clock — a tab left open in the background stops
 * accumulating. See `nextNoteVisitDwellReport` for why a session can report twice.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  nextNoteVisitDwellReport,
  noteVisitIsSubstantive,
  type NoteVisitDwellBucket,
} from '@/utils/note-visit-kinds';
import { recordNoteVisitEvent } from '../pages/prototype/proto-note-visit-events';

type NoteSession = {
  noteId: string;
  /** Attention accrued in earlier visible stretches of this session. */
  accumulatedMs: number;
  /** When the current visible stretch began, or null while hidden. */
  resumedAt: number | null;
  reportedBucket: NoteVisitDwellBucket | null;
};

export function useNoteSession({
  noteId,
  enabled = true,
}: {
  noteId: string | undefined;
  /** Pass false for drafts, for a note still loading or errored, and for foreign shared notes. */
  enabled?: boolean;
}): void {
  const sessionRef = useRef<NoteSession | null>(null);
  const queryClient = useQueryClient();

  /**
   * Refresh what Home ranks with, but only when the visit was a real read.
   *
   * `['note-fingerprints']` holds for five minutes, which is long enough that a note you
   * just spent a minute in would not be the one Home offers to continue. Glances are
   * excluded deliberately: they are logged but never counted, so invalidating on one would
   * make every note open a deck-refresh for no change in the answer.
   */
  const refreshNoteRankingSignals = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['note-fingerprints'] });
  }, [queryClient]);

  useEffect(() => {
    if (!enabled || !noteId) return;

    sessionRef.current = {
      noteId,
      accumulatedMs: 0,
      resumedAt: Date.now(),
      reportedBucket: null,
    };

    const elapsedMs = (session: NoteSession): number =>
      session.accumulatedMs + (session.resumedAt === null ? 0 : Date.now() - session.resumedAt);

    const report = () => {
      const session = sessionRef.current;
      if (!session) return;
      const bucket = nextNoteVisitDwellReport(elapsedMs(session), session.reportedBucket);
      if (!bucket) return;
      session.reportedBucket = bucket;
      recordNoteVisitEvent({
        noteId: session.noteId,
        dwellBucket: bucket,
        onSynced: noteVisitIsSubstantive(bucket) ? refreshNoteRankingSignals : undefined,
      });
    };

    const onVisibilityChange = () => {
      const session = sessionRef.current;
      if (!session) return;
      if (document.visibilityState === 'hidden') {
        // Report before pausing: the tab may never come back, and an unreported session is
        // a note that was read and left no trace.
        session.accumulatedMs = elapsedMs(session);
        session.resumedAt = null;
        report();
        return;
      }
      session.resumedAt = Date.now();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      report();
      sessionRef.current = null;
    };
    /*
     * Primitives only, and this is load-bearing rather than tidiness.
     *
     * The obvious thing to depend on is the note object, and the effect right beside the
     * call site does exactly that. `useNote` hands back a new object on every background
     * refetch, which is harmless for a one-shot analytics ping and fatal here: re-running
     * this effect restarts the dwell clock from zero, so every long read would be recorded
     * as a glance and the whole signal would read as though nobody stays with anything.
     */
  }, [noteId, enabled, refreshNoteRankingSignals]);
}
