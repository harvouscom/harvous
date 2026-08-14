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
  /** Fires once the server has the event, so Home can refresh what it says about reading. */
  onSynced?: () => void;
}): void {
  const { book, chapter, translation, dwellBucket, onSynced } = input;
  if (!book || !translation || !dwellBucket) return;
  if (!Number.isInteger(chapter) || chapter < 1) return;

  void api
    .post<{ success?: boolean }>('/api/reading/event', { book, chapter, translation, dwellBucket })
    .then(() => onSynced?.())
    .catch(() => {
      // offline, signed out, or table not pushed yet — reading continues either way
    });
}

/**
 * Mark where the reader is, so Home can offer to continue from it.
 *
 * Sent when the chapter opens rather than when reading ends: someone who closes a laptop
 * mid-chapter is exactly who continue-reading is for, and no reading event exists for them.
 */
export function recordLastReadPosition(input: {
  book: string;
  chapter: number;
  translation: string;
  /** Only when the surface tracks one — chapter-level surfaces omit it. */
  verse?: number;
  /** Fires once the server has the position, so Home can refresh what it says about reading. */
  onSynced?: () => void;
}): void {
  const { book, chapter, translation, verse, onSynced } = input;
  if (!book || !translation) return;
  if (!Number.isInteger(chapter) || chapter < 1) return;

  void api
    .post<{ success?: boolean }>('/api/user/update-last-read', {
      book,
      chapter,
      translation,
      ...(verse === undefined ? {} : { verse }),
    })
    .then(() => onSynced?.())
    .catch(() => {
      // same contract as the event log: reading never waits on, or fails with, this
    });
}
