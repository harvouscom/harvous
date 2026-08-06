/**
 * Aggregate engagement — roadmap item 12, "later, carefully".
 *
 * **Counts. Only ever counts.** "Review is never shared" is the privacy
 * principle for all church analytics, and this is the first church-facing code
 * that aggregates anything, so it is also the file that defines what aggregating
 * is allowed to mean here:
 *
 *   - No query in this file selects a user column. Not `userId`, not a name, not
 *     an email — `count(*)` and nothing else leaves the database.
 *   - No query in this file touches `Notes`. A pastor does not learn who wrote,
 *     what they wrote, or whether anyone wrote at all. The only reader of
 *     `Notes.startedFromServiceId` stays `resolveViewerServiceNotes`, scoped to
 *     the viewer's own row.
 *
 * Both are asserted by contract tests, because the failure mode is a one-line
 * edit that nobody notices in review.
 *
 * **What is deliberately absent: a count of sermon-started notes.** The roadmap
 * sanctions two numbers — how many people are connected, and how many follow the
 * study — and a note count is neither. It would also be the first church-facing
 * read of the lineage column, which an existing contract test forbids outright.
 * That is a decision to take deliberately, not one to arrive at by adding a
 * query. See CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md §10.
 */
import {
  db,
  Spaces,
  SpaceMemberships,
  UserMetadata,
  and,
  eq,
  inArray,
  isNull,
  sql,
} from '../db';
import { isMinistryBroadcastSpaceRow } from './channel-publish-cadence';
import { resolveChurchOrgAccess, type ChurchOrgAccessResult } from './church-org-access';

/**
 * Who may see it: `manage_staff`, i.e. a Clerk `org:admin`.
 *
 * The narrow choice on purpose. Adoption numbers are an administrative view of
 * the congregation, and "later, carefully" argues for the smallest audience
 * that makes the feature useful — widening to `sermon_tools` later is one line,
 * and narrowing after a church has grown used to it is not.
 *
 * **Never sponsorship-gated.** This is a read, and the standing rule is that a
 * lapsed church keeps every read: it must still see what it already has.
 */
export async function assertCanViewChurchEngagement(
  userId: string,
  orgId: string,
): Promise<ChurchOrgAccessResult> {
  return resolveChurchOrgAccess(userId, orgId, {
    capability: 'manage_staff',
    code: 'CHURCH_ENGAGEMENT_ROLE_REQUIRED',
    staffError: 'Only church staff can see engagement',
    roleError: 'Only a church admin can see engagement',
    sponsorshipGated: false,
  });
}

export type ChannelEngagement = {
  spaceId: string;
  title: string;
  /** People following this channel. Never who they are. */
  followerCount: number;
};

export type ChurchEngagement = {
  /** Congregants who have made this church their home church. */
  connectedCount: number;
  channels: ChannelEngagement[];
};

/**
 * Connected congregants for one church.
 *
 * Keyed on `connectedChurchId` rather than the denormalized `connectedOrgId`:
 * `Churches.id` is the identity, and the org id is a copy kept for cheap
 * org-scoped checks. Counting the copy would make this number disagree with
 * every other read the moment that known drift pair drifts.
 */
async function countConnectedCongregants(churchId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(UserMetadata)
    .where(eq(UserMetadata.connectedChurchId, churchId));
  return Number(rows[0]?.n ?? 0);
}

/**
 * Followers per ministry channel.
 *
 * **Only `role = 'member'` counts as following.** Staff are projected into every
 * org space as `owner`/`leader` by the roster sync, and a granted volunteer
 * leader carries `leader` too — counting either would let a church inflate its
 * own adoption by hiring, and would tell a pastor that they follow their own
 * channel. Whoever runs the room is not an audience for it.
 *
 * Discloses strictly less than the church already sees: staff can open any
 * channel's people sheet and read the followers by name. This is that list's
 * length, without the list.
 */
async function countFollowersByChannel(orgId: string): Promise<ChannelEngagement[]> {
  const spaces = await db
    .select({ id: Spaces.id, title: Spaces.title, type: Spaces.type, orgId: Spaces.orgId })
    .from(Spaces)
    .where(and(eq(Spaces.orgId, orgId), eq(Spaces.isActive, true), isNull(Spaces.deletedAt)));

  const channels = spaces.filter((space) => isMinistryBroadcastSpaceRow(space));
  if (channels.length === 0) return [];

  const counts = await db
    .select({
      spaceId: SpaceMemberships.spaceId,
      n: sql<number>`count(*)::int`,
    })
    .from(SpaceMemberships)
    .where(
      and(
        inArray(
          SpaceMemberships.spaceId,
          channels.map((channel) => channel.id),
        ),
        eq(SpaceMemberships.role, 'member'),
      ),
    )
    .groupBy(SpaceMemberships.spaceId);

  const bySpace = new Map(counts.map((row) => [row.spaceId, Number(row.n ?? 0)]));
  return channels.map((channel) => ({
    spaceId: channel.id,
    title: channel.title,
    followerCount: bySpace.get(channel.id) ?? 0,
  }));
}

/** The whole payload. Two numbers and a per-channel list of numbers. */
export async function getChurchEngagement(church: {
  id: string;
  orgId: string;
}): Promise<ChurchEngagement> {
  const [connectedCount, channels] = await Promise.all([
    countConnectedCongregants(church.id),
    countFollowersByChannel(church.orgId),
  ]);
  return { connectedCount, channels };
}
