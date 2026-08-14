/**
 * Fire-and-forget reading-event logging. A reading surface must never wait on, or fail
 * because of, its own analytics — every failure path here is silent on purpose.
 */

import { api } from '../../lib/api';
import type { ReadingDwellBucket } from '@/utils/reading-event-kinds';

export function recordReadingEvent(input: {
  /** Canonical book name, e.g. "John". The server re-derives book order from it. */
  book: string;
  chapter: number;
  translation: string;
  dwellBucket: ReadingDwellBucket;
}): void {
  const { book, chapter, translation, dwellBucket } = input;
  if (!book || !translation || !dwellBucket) return;
  if (!Number.isInteger(chapter) || chapter < 1) return;

  void api
    .post<{ success?: boolean }>('/api/reading/event', { book, chapter, translation, dwellBucket })
    .catch(() => {
      // offline, signed out, or table not pushed yet — reading continues either way
    });
}
