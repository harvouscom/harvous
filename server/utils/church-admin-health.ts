/**
 * "Is this church actually using Harvous?" — the health line on each row of /admin/churches.
 *
 * Counts only, for a Harvous admin running concierge pilots: never who, never anything about
 * anyone's notes. Each measure is one grouped query across every church (the list is small and
 * read rarely), not a query per church.
 *
 * `churchAttention` turns the counts into the few reasons a concierge should look at a church
 * today; the panel sorts by them.
 */
import {
  db,
  and,
  eq,
  inArray,
  isNull,
  sql,
  ChurchContentSubmissions,
  ChurchJoinLinks,
  ChurchServiceTimes,
  Churches,
  SpaceMemberships,
  SpaceNotes,
  Spaces,
  UserMetadata,
} from '../db';
import { churchSponsorship } from './church-entitlement';

export type ChurchHealth = {
  connectedCount: number;
  /** Distinct people who own or lead one of the church's spaces, plus whoever created the church. */
  staffCount: number;
  channelCount: number;
  serviceTimeCount: number;
  /** Everyone who has ever joined through any of the church's links (rotated ones included). */
  joinedByLinkCount: number;
  /** Posts waiting on a pastor's approval. */
  inReviewCount: number;
  /** Newest note added to one of its channels; null = never posted. */
  lastPostAt: string | null;
};

export type ChurchAttention = 'lapsed' | 'pilot_ending' | 'never_posted' | 'no_service_times' | 'no_one_connected' | 'quiet';

/** A channel silent this long, at a church that has posted before, is worth a nudge. */
export const QUIET_AFTER_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Pure: why a concierge should look at this church, most urgent first. Empty = healthy. */
export function churchAttention(
  church: Pick<typeof Churches.$inferSelect, 'isActive' | 'deletedAt' | 'billingPlan' | 'pilotUntil'>,
  health: ChurchHealth,
  now: Date = new Date(),
): ChurchAttention[] {
  if (!church.isActive || church.deletedAt) return [];
  const out: ChurchAttention[] = [];
  const plan = churchSponsorship(church, now);
  if (plan.state === 'lapsed') out.push('lapsed');
  else if (plan.state === 'pilot' && (plan.pilotDaysLeft ?? 99) <= 7) out.push('pilot_ending');
  if (!health.lastPostAt) out.push('never_posted');
  else if (now.getTime() - new Date(health.lastPostAt).getTime() > QUIET_AFTER_DAYS * DAY_MS) out.push('quiet');
  if (health.serviceTimeCount === 0) out.push('no_service_times');
  if (health.connectedCount === 0) out.push('no_one_connected');
  return out;
}

const countMap = (rows: Array<{ key: string | null; n: number | string | null }>) =>
  new Map(rows.filter((r) => r.key).map((r) => [r.key as string, Number(r.n ?? 0)]));

/** Health for every church in `churches`, keyed by church id. */
export async function loadChurchHealth(
  churches: ReadonlyArray<Pick<typeof Churches.$inferSelect, 'id' | 'orgId' | 'createdBy'>>,
): Promise<Map<string, ChurchHealth>> {
  const out = new Map<string, ChurchHealth>();
  if (churches.length === 0) return out;
  const churchIds = churches.map((c) => c.id);
  const orgIds = churches.map((c) => c.orgId);

  const [connected, channels, times, links, inReview, posts, staffRows] = await Promise.all([
    db
      .select({ key: UserMetadata.connectedChurchId, n: sql<number>`count(*)::int` })
      .from(UserMetadata)
      .where(inArray(UserMetadata.connectedChurchId, churchIds))
      .groupBy(UserMetadata.connectedChurchId),
    db
      .select({ key: Spaces.orgId, n: sql<number>`count(*)::int` })
      .from(Spaces)
      .where(and(inArray(Spaces.orgId, orgIds), eq(Spaces.type, 'public'), isNull(Spaces.deletedAt)))
      .groupBy(Spaces.orgId),
    db
      .select({ key: ChurchServiceTimes.churchId, n: sql<number>`count(*)::int` })
      .from(ChurchServiceTimes)
      .where(inArray(ChurchServiceTimes.churchId, churchIds))
      .groupBy(ChurchServiceTimes.churchId),
    db
      .select({ key: ChurchJoinLinks.churchId, n: sql<number>`coalesce(sum(${ChurchJoinLinks.useCount}), 0)::int` })
      .from(ChurchJoinLinks)
      .where(inArray(ChurchJoinLinks.churchId, churchIds))
      .groupBy(ChurchJoinLinks.churchId),
    db
      .select({ key: ChurchContentSubmissions.orgId, n: sql<number>`count(*)::int` })
      .from(ChurchContentSubmissions)
      .where(and(inArray(ChurchContentSubmissions.orgId, orgIds), eq(ChurchContentSubmissions.status, 'in_review')))
      .groupBy(ChurchContentSubmissions.orgId),
    db
      .select({ key: Spaces.orgId, at: sql<string | null>`max(${SpaceNotes.addedAt})` })
      .from(SpaceNotes)
      .innerJoin(Spaces, eq(Spaces.id, SpaceNotes.spaceId))
      .where(
        and(
          inArray(Spaces.orgId, orgIds),
          eq(Spaces.type, 'public'),
          isNull(Spaces.deletedAt),
          isNull(SpaceNotes.removedAt),
        ),
      )
      .groupBy(Spaces.orgId),
    db
      .selectDistinct({ orgId: Spaces.orgId, userId: SpaceMemberships.userId })
      .from(SpaceMemberships)
      .innerJoin(Spaces, eq(Spaces.id, SpaceMemberships.spaceId))
      .where(
        and(
          inArray(Spaces.orgId, orgIds),
          isNull(Spaces.deletedAt),
          inArray(SpaceMemberships.role, ['owner', 'leader']),
        ),
      ),
  ]);

  const connectedBy = countMap(connected);
  const channelsBy = countMap(channels);
  const timesBy = countMap(times);
  const linksBy = countMap(links);
  const reviewBy = countMap(inReview);
  const lastPostBy = new Map(
    posts.filter((p) => p.key && p.at).map((p) => [p.key as string, new Date(p.at as string).toISOString()]),
  );
  const staffBy = new Map<string, Set<string>>();
  for (const row of staffRows) {
    if (!row.orgId) continue;
    const set = staffBy.get(row.orgId) ?? new Set<string>();
    set.add(row.userId);
    staffBy.set(row.orgId, set);
  }

  for (const church of churches) {
    const staff = new Set(staffBy.get(church.orgId) ?? []);
    staff.add(church.createdBy);
    out.set(church.id, {
      connectedCount: connectedBy.get(church.id) ?? 0,
      staffCount: staff.size,
      channelCount: channelsBy.get(church.orgId) ?? 0,
      serviceTimeCount: timesBy.get(church.id) ?? 0,
      joinedByLinkCount: linksBy.get(church.id) ?? 0,
      inReviewCount: reviewBy.get(church.orgId) ?? 0,
      lastPostAt: lastPostBy.get(church.orgId) ?? null,
    });
  }
  return out;
}
