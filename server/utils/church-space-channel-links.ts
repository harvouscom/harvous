/**
 * A ministry's two rooms, paired — and the reason the pairing cannot dangle.
 *
 * Read `docs/future/CHURCH_STUDY_MATERIAL_LINKING.md` first. That doc buries
 * `ChurchServices.channelSpaceId`, and the sharpest of its four findings is
 * that the pointer had no read-side semantics: a row said two things were
 * related, nothing re-asked whether they still were, and a deleted channel left
 * a line in the UI pointing at nothing.
 *
 * So the row here is not the relation. `resolveCompanionChannel` re-derives it
 * on every read: both rooms still present, still active, still the same org,
 * still the right `Spaces.type`. A dead half reads as unpaired — never as a
 * tombstone, never as a chip you can tap into nothing. Nothing may read the
 * link table directly; that is the whole point of this file.
 *
 * What this is *not*: a claim that material in the channel is about anything in
 * the space. That is the inversion (`ChurchServicePublishedNotes`), a different
 * relationship at a different grain, and it stays unaffected by this one.
 */
import {
  db,
  first,
  and,
  eq,
  isNull,
  Spaces,
  ChurchSpaceChannelLinks,
} from '../db';
import { isChurchOrgSpaceRow, isMinistryBroadcastSpaceRow } from './channel-publish-cadence';

export type CompanionRoom = {
  id: string;
  title: string;
  color: string | null;
};

type SpaceRow = typeof Spaces.$inferSelect;

/** Live, active, and belonging to the org the link claims. */
async function liveSpace(spaceId: string): Promise<SpaceRow | null> {
  return (
    first(
      await db
        .select()
        .from(Spaces)
        .where(and(eq(Spaces.id, spaceId), isNull(Spaces.deletedAt)))
        .limit(1),
    ) ?? null
  );
}

function asRoom(space: SpaceRow): CompanionRoom {
  return { id: space.id, title: space.title, color: space.color ?? null };
}

/**
 * Both halves of a pairing, or null.
 *
 * Every caller goes through here rather than reading the row, because "is this
 * still a pairing" is four checks and the answer changes without the row
 * changing — a room is deleted, deactivated, or moved between orgs and the link
 * is silently stale.
 */
async function resolvePair(
  link: typeof ChurchSpaceChannelLinks.$inferSelect | null,
): Promise<{ space: SpaceRow; channel: SpaceRow } | null> {
  if (!link) return null;

  const [space, channel] = await Promise.all([
    liveSpace(link.spaceId),
    liveSpace(link.channelSpaceId),
  ]);
  if (!space || !channel) return null;
  if (!space.isActive || !channel.isActive) return null;

  /* Both must still be this org's rooms, and each must still be the kind of
     room its side of the pairing means. A Shared Space converted to something
     else stops being a companion rather than becoming a wrong one. */
  if (space.orgId !== link.orgId || channel.orgId !== link.orgId) return null;
  if (!isChurchOrgSpaceRow(space) || space.type !== 'shared') return null;
  if (!isMinistryBroadcastSpaceRow(channel)) return null;

  return { space, channel };
}

/** The channel a Shared Space broadcasts through, or null. */
export async function resolveCompanionChannel(spaceId: string): Promise<CompanionRoom | null> {
  const link =
    first(
      await db
        .select()
        .from(ChurchSpaceChannelLinks)
        .where(eq(ChurchSpaceChannelLinks.spaceId, spaceId))
        .limit(1),
    ) ?? null;
  const pair = await resolvePair(link);
  return pair ? asRoom(pair.channel) : null;
}

/** The Shared Space a ministry channel is the companion of, or null. */
export async function resolveCompanionOf(channelSpaceId: string): Promise<CompanionRoom | null> {
  const link =
    first(
      await db
        .select()
        .from(ChurchSpaceChannelLinks)
        .where(eq(ChurchSpaceChannelLinks.channelSpaceId, channelSpaceId))
        .limit(1),
    ) ?? null;
  const pair = await resolvePair(link);
  return pair ? asRoom(pair.space) : null;
}

/**
 * Every live pairing in one church, for the staff picker.
 *
 * Resolved the same way as a single read — a listing that showed pairings the
 * detail view would deny is worse than one that shows fewer.
 */
export async function listCompanionLinks(
  orgId: string,
): Promise<{ space: CompanionRoom; channel: CompanionRoom }[]> {
  const links = await db
    .select()
    .from(ChurchSpaceChannelLinks)
    .where(eq(ChurchSpaceChannelLinks.orgId, orgId));

  const resolved = await Promise.all(links.map((link) => resolvePair(link)));
  return resolved
    .filter((pair): pair is { space: SpaceRow; channel: SpaceRow } => pair !== null)
    .map((pair) => ({ space: asRoom(pair.space), channel: asRoom(pair.channel) }));
}

export type SetChannelLinkResult =
  | { ok: true; companion: CompanionRoom | null }
  | { ok: false; status: 400 | 404; error: string; code: string };

/**
 * Pair a room with a channel, or clear its pairing when `channelSpaceId` is null.
 *
 * Validates both halves against the caller's org before writing, so a staff
 * member cannot pair in a room they do not run — and cannot borrow another
 * church's channel, which is the failure a bare id in a body invites.
 */
export async function setChannelLink(params: {
  orgId: string;
  spaceId: string;
  channelSpaceId: string | null;
  userId: string;
}): Promise<SetChannelLinkResult> {
  const { orgId, spaceId, channelSpaceId, userId } = params;

  const space = await liveSpace(spaceId);
  if (!space || !space.isActive || space.orgId !== orgId || space.type !== 'shared') {
    return { ok: false, status: 404, error: 'Space not found', code: 'SPACE_NOT_FOUND' };
  }

  if (!channelSpaceId) {
    await db.delete(ChurchSpaceChannelLinks).where(eq(ChurchSpaceChannelLinks.spaceId, spaceId));
    return { ok: true, companion: null };
  }

  const channel = await liveSpace(channelSpaceId);
  if (
    !channel ||
    !channel.isActive ||
    channel.orgId !== orgId ||
    !isMinistryBroadcastSpaceRow(channel)
  ) {
    return { ok: false, status: 404, error: 'Channel not found', code: 'CHANNEL_NOT_FOUND' };
  }

  /* One space per channel, the mirror of the unique index on the other side.
     Enforced here rather than by a second index because the honest answer to
     "this channel already speaks for Youth" is an explanation, not a conflict. */
  const claimed = first(
    await db
      .select({ spaceId: ChurchSpaceChannelLinks.spaceId })
      .from(ChurchSpaceChannelLinks)
      .where(eq(ChurchSpaceChannelLinks.channelSpaceId, channelSpaceId))
      .limit(1),
  );
  if (claimed && claimed.spaceId !== spaceId) {
    return {
      ok: false,
      status: 400,
      error: 'That channel is already paired with another space',
      code: 'CHANNEL_ALREADY_PAIRED',
    };
  }

  await db
    .insert(ChurchSpaceChannelLinks)
    .values({
      id: `scl_${crypto.randomUUID()}`,
      orgId,
      spaceId,
      channelSpaceId,
      createdByUserId: userId,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: ChurchSpaceChannelLinks.spaceId,
      set: { channelSpaceId, createdByUserId: userId, createdAt: new Date() },
    });

  return { ok: true, companion: asRoom(channel) };
}
