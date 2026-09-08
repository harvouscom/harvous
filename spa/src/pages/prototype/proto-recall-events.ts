/**
 * Fire-and-forget recall carousel analytics.
 *
 * Impressions go out as one batch per tick; opens, snoozes and dismissals go out immediately and
 * on their own. See the note above the queue for why the two are not treated alike.
 */

import { api } from '../../lib/api';
import type { RecallEventAction, RecallOpportunityKind } from '@/utils/recall-opportunity-kinds';

type RecallEventPayload = {
  opportunityId: string;
  kind: RecallOpportunityKind;
  action: RecallEventAction;
  noteId?: string;
  /** The room this was said in; absent means personal Home. */
  spaceId?: string;
};

/**
 * Impressions queue; everything else goes straight out.
 *
 * Home renders six suggestions at once and the carousel records one impression per card, which
 * was six POSTs in a single tick of a load that already makes plenty. They batch cleanly because
 * nothing waits on them: an impression records that a card was on screen, is never read back for
 * suppression, and has no `onSynced` caller.
 *
 * The rest do not queue, and should not. An `open` is followed immediately by navigation away
 * from this page, so a deferred flush is a lost event; a `snooze` or `dismiss` is what suppresses
 * a card on the reader's other devices, which is a promise worth a round trip of its own.
 */
const pendingImpressions: RecallEventPayload[] = [];
let flushHandle: ReturnType<typeof setTimeout> | null = null;

/**
 * Zero, not a debounce window.
 *
 * The six calls arrive synchronously inside one effect, so the shortest possible macrotask
 * already collects all of them. A longer window would batch across renders too, and buy nothing
 * for the cost of holding events through a navigation that could drop them.
 */
const IMPRESSION_FLUSH_MS = 0;

function flushImpressions(): void {
  flushHandle = null;
  if (pendingImpressions.length === 0) return;
  const events = pendingImpressions.splice(0, pendingImpressions.length);
  void api.post<{ success?: boolean }>('/api/recall/events', { events }).catch(() => {
    // offline or table missing — carousel UX continues
  });
}

export function recordRecallOpportunityEvent(input: {
  opportunityId: string;
  kind: RecallOpportunityKind;
  action: RecallEventAction;
  noteId?: string | null;
  /**
   * The room this was said in — the same id the localStorage cooldown store is keyed by, so
   * the local and cross-device halves of suppression partition the same way. Omitted means
   * personal Home, which is what every row written before the column existed came from.
   */
  spaceId?: string | null;
  onSynced?: () => void;
}): void {
  const { opportunityId, kind, action, noteId, spaceId, onSynced } = input;
  if (!opportunityId || !kind || !action) return;

  const payload: RecallEventPayload = {
    opportunityId,
    kind,
    action,
    ...(noteId ? { noteId } : {}),
    /* Batched impressions carry it too — `validateRecallEventInput` reads each
       row of the batch with the same validator the single endpoint uses. */
    ...(spaceId ? { spaceId } : {}),
  };

  if (action === 'impression') {
    pendingImpressions.push(payload);
    if (flushHandle === null) flushHandle = setTimeout(flushImpressions, IMPRESSION_FLUSH_MS);
    // Nothing waits on an impression, so there is no `onSynced` to honour here.
    return;
  }

  void api
    .post<{ success?: boolean }>('/api/recall/event', payload)
    .then(() => onSynced?.())
    .catch(() => {
      // offline or table missing — carousel UX continues
    });
}
