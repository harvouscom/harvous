/**
 * Record a Home recall carousel event (open or snooze). Non-throwing.
 * When action is open and noteId is set, also bumps spaced-repetition stability.
 */

import { db, RecallEvents } from '../db';
import { nowISO } from '../db/dates';
import { generateTimestampId } from '@/utils/ids';
import {
  isRecallEventAction,
  isRecallOpportunityKind,
  type RecallEventAction,
  type RecallOpportunityKind,
} from '@/utils/recall-opportunity-kinds';
import { isRecallEventsTableMissing } from './pg-undefined-relation';
import { recordNoteRecallEngaged } from './note-recall-state';

export type RecordRecallEventInput = {
  opportunityId: string;
  kind: RecallOpportunityKind;
  action: RecallEventAction;
  noteId?: string | null;
};

export function validateRecallEventInput(body: unknown): RecordRecallEventInput | null {
  if (!body || typeof body !== 'object') return null;
  const { opportunityId, kind, action, noteId } = body as Record<string, unknown>;
  if (typeof opportunityId !== 'string' || !opportunityId.trim()) return null;
  if (typeof kind !== 'string' || !isRecallOpportunityKind(kind)) return null;
  if (typeof action !== 'string' || !isRecallEventAction(action)) return null;
  if (noteId != null && typeof noteId !== 'string') return null;
  const trimmedNoteId = typeof noteId === 'string' ? noteId.trim() : '';
  return {
    opportunityId: opportunityId.trim(),
    kind,
    action,
    noteId: trimmedNoteId || null,
  };
}

export async function recordRecallEvent(userId: string, input: RecordRecallEventInput): Promise<boolean> {
  try {
    await db.insert(RecallEvents).values({
      id: generateTimestampId('recallevent'),
      userId,
      opportunityId: input.opportunityId,
      kind: input.kind,
      action: input.action,
      noteId: input.noteId ?? null,
      createdAt: nowISO(),
    });

    if (input.action === 'open' && input.noteId) {
      await recordNoteRecallEngaged(userId, input.noteId);
    }

    return true;
  } catch (error) {
    if (isRecallEventsTableMissing(error)) {
      console.warn('[recordRecallEvent] RecallEvents table missing; skipping. Run `npm run db:push`.');
      return false;
    }
    console.error('[recordRecallEvent]', error instanceof Error ? error.message : error);
    return false;
  }
}
