/**
 * Reporting that a suggestion was carried out, from wherever that turns out to happen.
 *
 * This used to live inside `use-home-surface-data` as a closure, which meant only Home could
 * report a completion — and Home is not where completing happens. A generative card seeds a
 * draft and navigates away; the moment worth recording occurs on the note page, minutes
 * later, in a tree that knows nothing about the shelf. That is why `complete` had exactly one
 * caller and why the action was empty in sixty days of logs.
 *
 * So the report is a plain function rather than a hook. Everything it needs is either passed
 * in or global: the cooldown store is module-level, the day index is derived from the clock,
 * and the event post is fire-and-forget.
 */
import { localDayIndex } from '@/utils/local-day-index';
import type { RecallOpportunityKind } from '@/utils/recall-opportunity-kinds';
import {
  RECALL_COMPLETED_COOLDOWN_DAYS,
  notifyRecallCooldownChanged,
  recordRecallOpened,
} from './proto-recall-cooldown';
import { recordRecallOpportunityEvent } from './proto-recall-events';

export function reportRecallCompleted(input: {
  /** The space whose cooldown map this rests in — Home's space, not necessarily the note's. */
  spaceId: string | null | undefined;
  opportunityId: string;
  kind: RecallOpportunityKind;
  noteId?: string | null;
}): void {
  const { spaceId, opportunityId, kind, noteId } = input;
  if (!spaceId || !opportunityId) return;

  /*
   * Rested for the long window, not the ordinary one. A suggestion you acted on should not
   * come back next week asking again — that is the difference `RECALL_COMPLETED_COOLDOWN_DAYS`
   * exists to draw, and it was previously only ever applied on the one wired kind.
   */
  recordRecallOpened(spaceId, opportunityId, localDayIndex(new Date()), RECALL_COMPLETED_COOLDOWN_DAYS);
  recordRecallOpportunityEvent({ opportunityId, kind, action: 'complete', noteId });

  /* The shelf is usually unmounted when this fires, so there is no local state to bump —
     this is the cross-tree signal that makes it re-read whenever it comes back. */
  notifyRecallCooldownChanged();
}
