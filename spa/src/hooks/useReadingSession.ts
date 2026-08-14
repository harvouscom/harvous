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

import { useEffect, useRef } from 'react';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { nextReadingDwellReport, type ReadingDwellBucket } from '@/utils/reading-event-kinds';
import { recordLastReadPosition, recordReadingEvent } from '../pages/prototype/proto-reading-events';

type ReadingSession = {
  book: string;
  chapter: number;
  translation: string;
  /** Attention accrued in earlier visible stretches of this session. */
  accumulatedMs: number;
  /** When the current visible stretch began, or null while hidden. */
  resumedAt: number | null;
  reportedBucket: ReadingDwellBucket | null;
};

export function useReadingSession({
  canonicalReference,
  translationCode,
  enabled = true,
}: {
  canonicalReference: string | undefined;
  translationCode: string | undefined;
  /** Pass false until the passage is actually on screen — a failed load is not a read. */
  enabled?: boolean;
}): void {
  const sessionRef = useRef<ReadingSession | null>(null);

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
    };

    // Position is marked at the start of the session and the event is logged at the end,
    // so a read that never finishes still leaves somewhere to continue from.
    recordLastReadPosition({
      book: parsed.book,
      chapter: parsed.chapter,
      translation: translationCode,
    });

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
  }, [canonicalReference, translationCode, enabled]);
}
