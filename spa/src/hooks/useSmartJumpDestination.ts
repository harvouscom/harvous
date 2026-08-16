import { useMemo } from 'react';
import { bibleBookChapterCounts } from '@/utils/bible-book-chapters';
import { parseReaderQuery } from '@/utils/parse-reader-query';
import { readingDwellCountsAsRead } from '@/utils/reading-event-kinds';
import {
  deriveContinueReading,
  deriveSmartJumpDestination,
  type SmartJumpDestination,
} from '@/utils/prototype-home-trends';
import { useReadingHistory } from './queries/useReadingHistory';
import { useVotdToday } from './queries/useVotdToday';

/**
 * Where "open the reader" goes when nothing named a passage.
 *
 * Lives in one place because two surfaces ask the same question — the toolbar control and the
 * scripture list's empty state — and a second copy of the priority would drift the moment one
 * of them gained a case the other did not.
 *
 * Both queries are auth-gated internally and answer null while loading, which lands on the
 * fallback. That is the right shape for a control that is always clickable: an early click
 * opens John 1 rather than nothing.
 */
export function useSmartJumpDestination(): SmartJumpDestination {
  const readingHistoryQuery = useReadingHistory();
  const { data: votd } = useVotdToday();

  const lastRead = readingHistoryQuery.data?.lastRead ?? null;
  const chapters = readingHistoryQuery.data?.chapters;
  const votdReference = votd?.reference;

  return useMemo(() => {
    const continueReading = deriveContinueReading(
      {
        lastRead,
        readChapters: (chapters ?? []).map((c) => ({
          book: c.book,
          chapter: c.chapter,
          countsAsRead: readingDwellCountsAsRead(c.dwellBucket),
        })),
      },
      bibleBookChapterCounts(),
    );

    const parsedVotd = votdReference ? parseReaderQuery(votdReference) : null;

    return deriveSmartJumpDestination(
      continueReading,
      parsedVotd
        ? { book: parsedVotd.book, chapter: parsedVotd.chapter, verse: parsedVotd.verse }
        : null,
    );
  }, [lastRead, chapters, votdReference]);
}
