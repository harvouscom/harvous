/**
 * Fire-and-forget recall carousel analytics (opens + snoozes).
 */

import { api } from '../../lib/api';
import type { RecallEventAction, RecallOpportunityKind } from '@/utils/recall-opportunity-kinds';

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

  void api
    .post<{ success?: boolean }>('/api/recall/event', {
      opportunityId,
      kind,
      action,
      ...(noteId ? { noteId } : {}),
      ...(spaceId ? { spaceId } : {}),
    })
    .then(() => onSynced?.())
    .catch(() => {
      // offline or table missing — carousel UX continues
    });
}
