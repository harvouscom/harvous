/**
 * Measure one chapter-reading session and log it, fire-and-forget.
 *
 * Lives apart from any one reading surface because it outlives this one: the standalone
 * passage pane is the only place to read a chapter today, and the reader that replaces it
 * should call exactly this hook rather than growing its own copy.
 *
 * Dwell is attention time, not wall-clock — a tab left open in the background stops
 * accumulating. See `nextReadingDwellReport` for why a session can report twice.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { nextReadingDwellReport, type ReadingDwellBucket } from '@/utils/reading-event-kinds';
import { recordLastReadPosition, recordReadingEvent } from '../pages/prototype/proto-reading-events';
import { readingHistoryQueryKey } from './queries/useReadingHistory';

type ReadingSession = {
  book: string;
  chapter: number;
  translation: string;
  /** Attention accrued in earlier visible stretches of this session. */
  accumulatedMs: number;
  /** When the current visible stretch began, or null while hidden. */
  resumedAt: number | null;
  reportedBucket: ReadingDwellBucket | null;
  /** Last verse sent for this chapter, so an unchanged position is not re-sent. */
  reportedVerse: number | null;
};

export function useReadingSession({
  canonicalReference,
  translationCode,
  enabled = true,
  getVerse,
}: {
  canonicalReference: string | undefined;
  translationCode: string | undefined;
  /** Pass false until the passage is actually on screen — a failed load is not a read. */
  enabled?: boolean;
  /**
   * Where in the chapter the reader has got to, asked for when the session ends. Optional
   * because chapter-level surfaces have no answer — they simply omit the verse.
   */
  getVerse?: () => number | undefined;
}): void {
  const sessionRef = useRef<ReadingSession | null>(null);
  const queryClient = useQueryClient();

  /* Held in a ref so a caller passing an inline arrow does not restart the session — and with
     it the dwell clock — on every render of the surface above. */
  const getVerseRef = useRef(getVerse);
  getVerseRef.current = getVerse;

  /**
   * Home reads this log to decide what to offer next, and its query is deliberately slow to
   * go stale. Without this, finishing a chapter would leave Home offering that same chapter
   * for another five minutes — the card would be wrong exactly when someone just acted on it.
   */
  const refreshReadingHistory = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: readingHistoryQueryKey });
  }, [queryClient]);

  useEffect(() => {
    if (!enabled || !canonicalReference || !translationCode) return;

    const parsed = parseScriptureReference(canonicalReference.trim());
    if (!parsed) return;

    sessionRef.current = {
      book: parsed.book,
      chapter: parsed.chapter,
      translation: translationCode,
      accumulatedMs: 0,
      resumedAt: Date.now(),
      reportedBucket: null,
      reportedVerse: null,
    };

    // Position is marked at the start of the session and the event is logged at the end,
    // so a read that never finishes still leaves somewhere to continue from.
    recordLastReadPosition({
      book: parsed.book,
      chapter: parsed.chapter,
      translation: translationCode,
      onSynced: refreshReadingHistory,
    });

    /**
     * Mark the position again, now with the verse actually reached.
     *
     * Runs when the session ends rather than while scrolling: this is a write to the account,
     * and one per chapter read is the right cost. Skipped when the verse has not moved since
     * the last mark, so paging through a book does not send the same position twice.
     */
    const markVerseReached = () => {
      const session = sessionRef.current;
      if (!session) return;
      const verse = getVerseRef.current?.();
      if (verse === undefined || verse === session.reportedVerse) return;
      session.reportedVerse = verse;
      recordLastReadPosition({
        book: session.book,
        chapter: session.chapter,
        translation: session.translation,
        verse,
        onSynced: refreshReadingHistory,
      });
    };

    const elapsedMs = (session: ReadingSession): number =>
      session.accumulatedMs + (session.resumedAt === null ? 0 : Date.now() - session.resumedAt);

    const report = () => {
      const session = sessionRef.current;
      if (!session) return;
      const bucket = nextReadingDwellReport(elapsedMs(session), session.reportedBucket);
      if (!bucket) return;
      session.reportedBucket = bucket;
      recordReadingEvent({
        book: session.book,
        chapter: session.chapter,
        translation: session.translation,
        dwellBucket: bucket,
        onSynced: refreshReadingHistory,
      });
    };

    const onVisibilityChange = () => {
      const session = sessionRef.current;
      if (!session) return;
      if (document.visibilityState === 'hidden') {
        // Report before pausing: the tab may never come back, and an unreported session
        // is a chapter that was read and left no trace.
        session.accumulatedMs = elapsedMs(session);
        session.resumedAt = null;
        report();
        markVerseReached();
        return;
      }
      session.resumedAt = Date.now();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      report();
      markVerseReached();
      sessionRef.current = null;
    };
  }, [canonicalReference, translationCode, enabled, refreshReadingHistory]);
}
