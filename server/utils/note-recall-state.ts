/**
 * Workstream B — server-persisted recall engagement (stability + lastRecallEngagedAt).
 * Upserts into NoteFingerprints so resurfacing state survives cross-device without a separate table.
 */

import {
  db,
  eq,
  and,
  now,
  Notes,
  NoteFingerprints,
} from '../db';
import { DEFAULT_BASE_STABILITY_DAYS } from '@/utils/prototype-home-trends';
import { isNoteFingerprintsTableMissing } from './pg-undefined-relation';

export const STABILITY_GROWTH_FACTOR = 2;
export const MAX_STABILITY_DAYS = 180;

export function nextRecallStabilityDays(
  current: number | undefined | null,
  base: number = DEFAULT_BASE_STABILITY_DAYS,
): number {
  const start = current != null && Number.isFinite(current) && current > 0 ? current : base;
  return Math.min(MAX_STABILITY_DAYS, Math.round(start * STABILITY_GROWTH_FACTOR));
}

export interface NoteRecallEngagement {
  noteId: string;
  recallStabilityDays: number | null;
  lastRecallEngagedAt: Date | null;
}

/** Record recall re-engagement for a note the user owns. Non-throwing. */
export async function recordNoteRecallEngaged(
  userId: string,
  noteId: string,
): Promise<NoteRecallEngagement | null> {
  try {
    const owned = (
      await db
        .select({ id: Notes.id })
        .from(Notes)
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
        .limit(1)
    )[0];
    if (!owned) return null;

    const existing = (
      await db
        .select({
          recallStabilityDays: NoteFingerprints.recallStabilityDays,
        })
        .from(NoteFingerprints)
        .where(eq(NoteFingerprints.noteId, noteId))
        .limit(1)
    )[0];

    const engagedAt = now();
    const nextStability = nextRecallStabilityDays(existing?.recallStabilityDays ?? undefined);

    await db
      .insert(NoteFingerprints)
      .values({
        noteId,
        userId,
        meaningWeight: 0,
        passageCount: 0,
        computedAt: engagedAt,
        recallStabilityDays: nextStability,
        lastRecallEngagedAt: engagedAt,
      })
      .onConflictDoUpdate({
        target: NoteFingerprints.noteId,
        set: {
          recallStabilityDays: nextStability,
          lastRecallEngagedAt: engagedAt,
        },
      });

    return {
      noteId,
      recallStabilityDays: nextStability,
      lastRecallEngagedAt: engagedAt,
    };
  } catch (err) {
    if (isNoteFingerprintsTableMissing(err)) {
      console.warn('[note-recall-state] NoteFingerprints table missing; skipping. Run `npm run db:push`.');
      return null;
    }
    console.error('[recordNoteRecallEngaged]', err instanceof Error ? err.message : err);
    return null;
  }
}
