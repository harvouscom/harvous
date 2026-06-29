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
  onSynced?: () => void;
}): void {
  const { opportunityId, kind, action, noteId, onSynced } = input;
  if (!opportunityId || !kind || !action) return;

  void api
    .post<{ success?: boolean }>('/api/recall/event', {
      opportunityId,
      kind,
      action,
      ...(noteId ? { noteId } : {}),
    })
    .then(() => onSynced?.())
    .catch(() => {
      // offline or table missing — carousel UX continues
    });
}
