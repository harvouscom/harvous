/**
 * Server helpers for ministry channel publish cadence (declared + observed).
 * Pure parse/label/stale logic lives in `@/utils/channel-publish-cadence`.
 */

import { and, eq, inArray, isNull, max } from 'drizzle-orm';
import { db } from '../db/client';
import { Notes, SpaceNotes } from '../db/schema';
import {
  cadenceLabel,
  isCadenceStale,
  parsePublishCadence,
  type PublishCadence,
} from '@/utils/channel-publish-cadence';

export {
  PUBLISH_CADENCE_VALUES,
  cadenceIntervalDays,
  cadenceLabel,
  cadenceShortLabel,
  isCadenceStale,
  isTimedPublishCadence,
  parsePublishCadence,
  parsePublishCadenceInput,
  staffCadenceStaleHint,
  type PublishCadence,
  type PublishCadenceInputResult,
} from '@/utils/channel-publish-cadence';

export function isMinistryBroadcastSpaceRow(space: {
  type?: string | null;
  orgId?: string | null;
}): boolean {
  return space.type === 'public' && Boolean(space.orgId);
}

/**
 * A room a church owns — ministry channel (`public`) or church Shared Space
 * (`shared`) — as opposed to somebody's personal space.
 *
 * Deliberately wider than the broadcast predicate above: a teaching plan
 * belongs to any room the church gathers in, not only the ones it broadcasts
 * into. Naming it ends the inline-checks-only status church Shared Spaces have
 * had, and it lives here beside its sibling rather than in the plan gate so
 * both the plan and the leadership-grant gates can use it without a cycle.
 */
export function isChurchOrgSpaceRow(space: {
  type?: string | null;
  orgId?: string | null;
}): boolean {
  return Boolean(space.orgId) && (space.type === 'shared' || space.type === 'public');
}

/** Latest curriculum note `createdAt` per space (active SpaceNotes associations). */
export async function getLastCurriculumAtBySpaceIds(
  spaceIds: string[],
): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (spaceIds.length === 0) return out;

  const rows = await db
    .select({
      spaceId: SpaceNotes.spaceId,
      lastAt: max(Notes.createdAt),
    })
    .from(SpaceNotes)
    .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
    .where(
      and(
        inArray(SpaceNotes.spaceId, spaceIds),
        isNull(SpaceNotes.removedAt),
        eq(Notes.contentEncrypted, false),
      ),
    )
    .groupBy(SpaceNotes.spaceId);

  for (const row of rows) {
    if (row.spaceId && row.lastAt) out.set(row.spaceId, row.lastAt);
  }
  return out;
}

export async function getLastCurriculumAtForSpace(spaceId: string): Promise<Date | null> {
  const map = await getLastCurriculumAtBySpaceIds([spaceId]);
  return map.get(spaceId) ?? null;
}

export type ChannelCadenceFields = {
  publishCadence: PublishCadence | null;
  lastCurriculumAt: string | null;
  cadenceStale: boolean;
  cadenceLabel: string | null;
};

export function buildChannelCadenceFields(
  publishCadenceRaw: string | null | undefined,
  lastCurriculumAt: Date | string | null | undefined,
  now: Date = new Date(),
): ChannelCadenceFields {
  const publishCadence = parsePublishCadence(publishCadenceRaw);
  const lastIso =
    lastCurriculumAt == null
      ? null
      : lastCurriculumAt instanceof Date
        ? lastCurriculumAt.toISOString()
        : String(lastCurriculumAt);
  return {
    publishCadence,
    lastCurriculumAt: lastIso,
    cadenceStale: isCadenceStale(lastCurriculumAt, publishCadence, now),
    cadenceLabel: cadenceLabel(publishCadence),
  };
}

/** Attach publishCadence + cadenceStale + lastCurriculumAt onto ministry spaces for nav payloads. */
export async function attachMinistryCadenceToSpaces<
  T extends { id: string; type?: string | null; orgId?: string | null; publishCadence?: string | null },
>(
  spaces: T[],
): Promise<
  Array<
    T & {
      publishCadence: PublishCadence | null;
      cadenceStale?: boolean;
      lastCurriculumAt?: string | null;
    }
  >
> {
  const ministryIds = spaces.filter((s) => isMinistryBroadcastSpaceRow(s)).map((s) => s.id);
  const lastById = await getLastCurriculumAtBySpaceIds(ministryIds);
  const now = new Date();

  return spaces.map((space) => {
    if (!isMinistryBroadcastSpaceRow(space)) {
      return { ...space, publishCadence: null as PublishCadence | null };
    }
    const publishCadence = parsePublishCadence(space.publishCadence);
    const lastAt = lastById.get(space.id) ?? null;
    return {
      ...space,
      publishCadence,
      lastCurriculumAt: lastAt ? lastAt.toISOString() : null,
      cadenceStale: isCadenceStale(lastAt, publishCadence, now),
    };
  });
}
