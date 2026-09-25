/**
 * Restricted channels — who may follow a ministry channel (docs/CHURCH_V2_ROADMAP.md §C3).
 *
 * `Spaces.audience` on a channel:
 *   - `church`   — anyone connected to the church (the default, and every channel before C3);
 *   - `ministry` — people in a group of the channel's ministry;
 *   - `leaders`  — people who lead a group of the channel's ministry.
 * Whoever leads the channel itself (an owner or leader row — staff, via the staff sync) is always
 * in its audience.
 *
 * **Follow rows are the only truth.** The feed, church push, church Review and "N followers" all
 * read `member` rows, so restricting a channel means removing the rows of people outside it —
 * nothing downstream needs its own audience check. Rows are reconciled:
 *   - when a channel's audience changes, or spaces move between ministries (whole church);
 *   - on the viewer's own reads (`/channels`, `/feed`, church push, church Review refill), which
 *     catches someone who has since left the group that qualified them.
 * Browse and follow gate on the same predicate, so a row is never created that the next
 * reconcile would remove. Only `member` rows are ever deleted: owner, leader and grant rows
 * belong to the staff sync.
 */

import { db, Spaces, SpaceMemberships, and, eq, inArray, isNull, ne } from '../db';

export const CHANNEL_AUDIENCES = ['church', 'ministry', 'leaders'] as const;
export type ChannelAudience = (typeof CHANNEL_AUDIENCES)[number];

export function isChannelAudience(value: unknown): value is ChannelAudience {
  return typeof value === 'string' && (CHANNEL_AUDIENCES as readonly string[]).includes(value);
}

export type AudienceChannel = { id: string; audience: string | null; ministryId: string | null };

/** What the predicate needs to know about one person, within one church. */
export type AudienceViewer = {
  /** Channels they lead (owner/leader row) — always in audience. */
  leadsChannelIds: ReadonlySet<string>;
  /** Their groups in this church: the ministry each is in, and their role there. */
  groups: ReadonlyArray<{ ministryId: string | null; role: string }>;
};

const LEAD_ROLES = new Set(['owner', 'leader']);

/**
 * Pure: may this person follow (and keep following) this channel? Fails closed: a restricted
 * channel with no ministry has no audience but its leaders — `planAssignSpace` and archive
 * refuse to produce one, so this only matters if a row is edited by hand.
 */
export function channelAudienceAllows(channel: AudienceChannel, viewer: AudienceViewer): boolean {
  const audience = channel.audience ?? 'church';
  if (audience === 'church') return true;
  if (viewer.leadsChannelIds.has(channel.id)) return true;
  if (!channel.ministryId) return false;
  const inMinistry = viewer.groups.filter((group) => group.ministryId === channel.ministryId);
  if (audience === 'ministry') return inMinistry.length > 0;
  if (audience === 'leaders') return inMinistry.some((group) => LEAD_ROLES.has(group.role));
  return false; // An unknown audience is a restricted one.
}

/** Pure: the viewer facts from their membership rows in one church. */
export function buildAudienceViewer(
  rows: ReadonlyArray<{ spaceId: string; type: string; ministryId: string | null; role: string }>,
): AudienceViewer {
  return {
    leadsChannelIds: new Set(
      rows.filter((row) => row.type === 'public' && LEAD_ROLES.has(row.role)).map((row) => row.spaceId),
    ),
    groups: rows
      .filter((row) => row.type === 'shared')
      .map((row) => ({ ministryId: row.ministryId, role: row.role })),
  };
}

/** Membership rows for these people in this church's live spaces, grouped by person. */
async function membershipRowsByUser(orgId: string, userIds: readonly string[]) {
  const byUser = new Map<string, { spaceId: string; type: string; ministryId: string | null; role: string }[]>();
  if (userIds.length === 0) return byUser;
  const rows = await db
    .select({
      userId: SpaceMemberships.userId,
      spaceId: SpaceMemberships.spaceId,
      role: SpaceMemberships.role,
      type: Spaces.type,
      ministryId: Spaces.ministryId,
    })
    .from(SpaceMemberships)
    .innerJoin(Spaces, eq(Spaces.id, SpaceMemberships.spaceId))
    .where(and(inArray(SpaceMemberships.userId, [...userIds]), eq(Spaces.orgId, orgId), isNull(Spaces.deletedAt)));
  for (const { userId, ...row } of rows) {
    const list = byUser.get(userId) ?? [];
    list.push(row);
    byUser.set(userId, list);
  }
  return byUser;
}

/** One person's viewer facts in one church. */
export async function loadAudienceViewer(userId: string, orgId: string): Promise<AudienceViewer> {
  const rows = (await membershipRowsByUser(orgId, [userId])).get(userId) ?? [];
  return buildAudienceViewer(rows);
}

/** A church's restricted channels, as the predicate reads them. */
export async function restrictedChannelsForOrg(orgId: string): Promise<AudienceChannel[]> {
  return db
    .select({ id: Spaces.id, audience: Spaces.audience, ministryId: Spaces.ministryId })
    .from(Spaces)
    .where(
      and(eq(Spaces.orgId, orgId), eq(Spaces.type, 'public'), isNull(Spaces.deletedAt), ne(Spaces.audience, 'church')),
    );
}

/**
 * Remove the follows these channels' audiences no longer allow — or, with `dryRun`, only count
 * them. The channels are passed in (not read back) so a dry run can ask about an audience that
 * has not been saved yet. Returns a count, never who.
 */
export async function reconcileChannelAudience(
  orgId: string,
  channels: readonly AudienceChannel[],
  options?: { dryRun?: boolean },
): Promise<number> {
  const restricted = channels.filter((channel) => (channel.audience ?? 'church') !== 'church');
  if (restricted.length === 0) return 0;

  const follows = await db
    .select({ id: SpaceMemberships.id, spaceId: SpaceMemberships.spaceId, userId: SpaceMemberships.userId })
    .from(SpaceMemberships)
    .where(
      and(
        inArray(
          SpaceMemberships.spaceId,
          restricted.map((channel) => channel.id),
        ),
        eq(SpaceMemberships.role, 'member'),
      ),
    );
  if (follows.length === 0) return 0;

  const rowsByUser = await membershipRowsByUser(orgId, [...new Set(follows.map((row) => row.userId))]);
  const channelById = new Map(restricted.map((channel) => [channel.id, channel]));
  const outside = follows.filter(
    (row) => !channelAudienceAllows(channelById.get(row.spaceId)!, buildAudienceViewer(rowsByUser.get(row.userId) ?? [])),
  );
  if (outside.length && !options?.dryRun) {
    await db.delete(SpaceMemberships).where(
      and(
        inArray(
          SpaceMemberships.id,
          outside.map((row) => row.id),
        ),
        eq(SpaceMemberships.role, 'member'),
      ),
    );
  }
  return outside.length;
}

/** Every restricted channel in a church — after spaces move between ministries. */
export async function reconcileOrgChannelAudiences(orgId: string): Promise<number> {
  return reconcileChannelAudience(orgId, await restrictedChannelsForOrg(orgId));
}

/**
 * The viewer's own follows, on their own reads: drop any restricted channel they no longer
 * qualify for. One cheap query when the church restricts nothing, which is almost every church.
 */
export async function reconcileViewerChannelAudience(userId: string, orgId: string): Promise<void> {
  const restricted = await restrictedChannelsForOrg(orgId);
  if (restricted.length === 0) return;
  const follows = await db
    .select({ id: SpaceMemberships.id, spaceId: SpaceMemberships.spaceId })
    .from(SpaceMemberships)
    .where(
      and(
        eq(SpaceMemberships.userId, userId),
        eq(SpaceMemberships.role, 'member'),
        inArray(
          SpaceMemberships.spaceId,
          restricted.map((channel) => channel.id),
        ),
      ),
    );
  if (follows.length === 0) return;
  const viewer = await loadAudienceViewer(userId, orgId);
  const channelById = new Map(restricted.map((channel) => [channel.id, channel]));
  const outside = follows.filter((row) => !channelAudienceAllows(channelById.get(row.spaceId)!, viewer));
  if (outside.length === 0) return;
  await db.delete(SpaceMemberships).where(
    and(
      inArray(
        SpaceMemberships.id,
        outside.map((row) => row.id),
      ),
      eq(SpaceMemberships.role, 'member'),
    ),
  );
}
