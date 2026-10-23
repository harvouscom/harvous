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
import { resolveScriptureChapterTarget } from '@/utils/scripture-chapter-target';
import { nextReadingDwellReport, type ReadingDwellBucket } from '@/utils/reading-event-kinds';
import { recordLastReadPosition, recordReadingEvent } from '../pages/prototype/proto-reading-events';
import {
  invalidateReadingSurfaces,
  patchReadingHistoryLastRead,
} from './queries/useReadingHistory';
import { invalidateStudyFeed } from '@/utils/study-feed-invalidation';

type ReadingSession = {
  book: string;
  chapter: number;
  translation: string;
  /** Attention accrued in earlier visible stretches of this session. */
  accumulatedMs: number;
  /** When the current visible stretch began, or null while hidden. */
  resumedAt: number | null;
  reportedBucket: ReadingDwellBucket | null;
  /** Last position sent for this chapter, so an unchanged one is not re-sent. */
  reported: ReadingPosition | null;
};

/** Where in the chapter the reader has got to. */
export type ReadingPosition = {
  verse: number;
  /** The end of the chapter is on screen — what tells "read it through" from "stopped at 20". */
  atEnd: boolean;
};

export function useReadingSession({
  canonicalReference,
  translationCode,
  enabled = true,
  getPosition,
}: {
  canonicalReference: string | undefined;
  translationCode: string | undefined;
  /** Pass false until the passage is actually on screen — a failed load is not a read. */
  enabled?: boolean;
  /**
   * Where in the chapter the reader has got to, asked for when the session starts and when it
   * ends. Optional because chapter-level surfaces have no answer — they simply omit the verse.
   */
  getPosition?: () => ReadingPosition | undefined;
}): void {
  const sessionRef = useRef<ReadingSession | null>(null);
  const queryClient = useQueryClient();

  /* Held in a ref so a caller passing an inline arrow does not restart the session — and with
     it the dwell clock — on every render of the surface above. */
  const getPositionRef = useRef(getPosition);
  getPositionRef.current = getPosition;

  /**
   * Home / Activity read this log to decide what to offer next. Reading history holds for
   * five minutes and the study feed for one; neither was invalidated after a chapter was
   * actually read, so coming back from the reader showed the chapter the sitting started on
   * until a full refresh.
   */
  const refreshReadingSurfaces = useCallback(() => {
    invalidateReadingSurfaces(queryClient);
  }, [queryClient]);

  const markLocalPosition = useCallback(
    (input: {
      book: string;
      chapter: number;
      translation: string;
      position?: ReadingPosition;
    }) => {
      const target = resolveScriptureChapterTarget(input.book, input.chapter);
      if (!target) return;
      patchReadingHistoryLastRead(queryClient, {
        ...target,
        translation: input.translation,
        ...(input.position
          ? { verse: input.position.verse, ...(input.position.atEnd ? { atEnd: true } : {}) }
          : {}),
        readAt: new Date().toISOString(),
      });
      // Mark Activity stale now, not only after the POST. Returning to Home inside the
      // feed's 60s staleTime would otherwise keep painting the sitting you left.
      invalidateStudyFeed(queryClient);
    },
    [queryClient],
  );

  useEffect(() => {
    if (!enabled || !canonicalReference || !translationCode) return;

    const parsed = parseScriptureReference(canonicalReference.trim());
    if (!parsed) return;

    /*
     * The verse on screen as the chapter opens — a resumed chapter is already scrolled back to
     * where it was by now (the surface's layout effects and its own measure run before this
     * effect). Sending the chapter alone here used to wipe the stored verse, and the closing
     * write was the only thing that put it back.
     */
    const opening = getPositionRef.current?.();

    sessionRef.current = {
      book: parsed.book,
      chapter: parsed.chapter,
      translation: translationCode,
      accumulatedMs: 0,
      resumedAt: Date.now(),
      reportedBucket: null,
      reported: opening ?? null,
    };

    // Position is marked at the start of the session and the event is logged at the end,
    // so a read that never finishes still leaves somewhere to continue from.
    markLocalPosition({
      book: parsed.book,
      chapter: parsed.chapter,
      translation: translationCode,
      position: opening,
    });
    recordLastReadPosition({
      book: parsed.book,
      chapter: parsed.chapter,
      translation: translationCode,
      verse: opening?.verse,
      atEnd: opening?.atEnd,
      onSynced: refreshReadingSurfaces,
    });

    /**
     * Mark the position again, now with the verse actually reached.
     *
     * Runs when the session ends rather than while scrolling: this is a write to the account,
     * and one per chapter read is the right cost. Skipped when the position has not moved since
     * the last mark, so opening a chapter and leaving does not send the same position twice.
     */
    const markVerseReached = () => {
      const session = sessionRef.current;
      if (!session) return;
      const position = getPositionRef.current?.();
      if (!position) return;
      const last = session.reported;
      if (last && last.verse === position.verse && last.atEnd === position.atEnd) return;
      session.reported = position;
      markLocalPosition({
        book: session.book,
        chapter: session.chapter,
        translation: session.translation,
        position,
      });
      recordLastReadPosition({
        book: session.book,
        chapter: session.chapter,
        translation: session.translation,
        verse: position.verse,
        atEnd: position.atEnd,
        onSynced: refreshReadingSurfaces,
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
        onSynced: refreshReadingSurfaces,
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
  }, [canonicalReference, translationCode, enabled, refreshReadingSurfaces, markLocalPosition]);
}
