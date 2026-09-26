/**
 * Who may write a church's review questions, and for which channel.
 *
 * Composes `resolveChurchOrgAccess`, so staff are proven before anyone learns whether the church
 * has lapsed. Gated on `publish`: writing a question for a channel is publishing to it, and
 * every staff role holds that.
 *
 * Writing and taking down also need the staffer to *lead the channel* — an owner or leader row,
 * the rule publishing a note uses (`canPublishNoteIntoSpace`). The staff sync grants those rows
 * by ministry scope (docs/CHURCH_V2_ROADMAP.md §C), so a teacher scoped to Youth writes Youth's
 * questions and not Kids'. Reading stays church-wide, like the Content list.
 *
 * Reads are never sponsorship-gated — a lapsed church's staff still see what they wrote.
 * Archiving isn't either: taking a question down must always work.
 */
import { db, first, Spaces, SpaceMemberships, and, eq, inArray } from '../db';
import { resolveChurchOrgAccess, type ChurchOrgAccessRule } from './church-org-access';
import type { ChurchRow } from './church-staff';

const RULES: Record<'read' | 'write' | 'retire', ChurchOrgAccessRule> = {
  read: {
    capability: 'publish',
    code: 'CHURCH_REVIEW_FORBIDDEN',
    staffError: 'Only church staff can see review questions',
    roleError: 'Your role does not include review questions',
    sponsorshipGated: false,
  },
  write: {
    capability: 'publish',
    code: 'CHURCH_REVIEW_FORBIDDEN',
    staffError: 'Only church staff can write review questions',
    roleError: 'Your role does not include review questions',
    sponsorshipGated: true,
  },
  retire: {
    capability: 'publish',
    code: 'CHURCH_REVIEW_FORBIDDEN',
    staffError: 'Only church staff can take a question down',
    roleError: 'Your role does not include review questions',
    sponsorshipGated: false,
  },
};

export type ChurchReviewGate =
  | { ok: true; church: ChurchRow }
  | { ok: false; status: 400 | 402 | 403 | 404 | 409; code: string; error: string };

export type ChurchReviewChannelGate =
  | { ok: true; church: ChurchRow; channel: { id: string; title: string } }
  | { ok: false; status: 400 | 402 | 403 | 404 | 409; code: string; error: string };

export function assertChurchReviewAccess(
  userId: string,
  orgId: string,
  mode: 'read' | 'write' | 'retire',
): Promise<ChurchReviewGate> {
  return resolveChurchOrgAccess(userId, orgId, RULES[mode]);
}

/**
 * The staff gate, then the channel: it must be one of *this* church's ministry channels.
 * Same 404 for another church's channel as for none at all.
 */
export async function assertChurchReviewChannel(
  userId: string,
  orgId: string,
  channelSpaceId: string,
  mode: 'read' | 'write' | 'retire',
): Promise<ChurchReviewChannelGate> {
  const gate = await assertChurchReviewAccess(userId, orgId, mode);
  if (!gate.ok) return gate;
  const channel = channelSpaceId
    ? first(
        await db
          .select({ id: Spaces.id, title: Spaces.title, orgId: Spaces.orgId, type: Spaces.type, deletedAt: Spaces.deletedAt })
          .from(Spaces)
          .where(eq(Spaces.id, channelSpaceId))
          .limit(1),
      )
    : undefined;
  if (!channel || channel.deletedAt || channel.type !== 'public' || channel.orgId !== gate.church.orgId) {
    return { ok: false, status: 404, code: 'CHANNEL_NOT_FOUND', error: 'Channel not found' };
  }
  // Same 404 for a channel they don't lead: never "exists, but not yours".
  if (mode !== 'read' && !(await staffLeadsChannel(userId, channel.id))) {
    return { ok: false, status: 404, code: 'CHANNEL_NOT_FOUND', error: 'Channel not found' };
  }
  return { ok: true, church: gate.church, channel: { id: channel.id, title: channel.title } };
}

const LEAD_ROLES = ['owner', 'leader'];

/** Whether this person leads the channel: its owner, or an owner/leader membership row. */
export async function staffLeadsChannel(userId: string, channelSpaceId: string): Promise<boolean> {
  const row = first(
    await db
      .select({ ownerId: Spaces.userId, role: SpaceMemberships.role })
      .from(Spaces)
      .leftJoin(
        SpaceMemberships,
        and(eq(SpaceMemberships.spaceId, Spaces.id), eq(SpaceMemberships.userId, userId)),
      )
      .where(eq(Spaces.id, channelSpaceId))
      .limit(1),
  );
  return Boolean(row && (row.ownerId === userId || (row.role && LEAD_ROLES.includes(row.role))));
}

/** Of these channels, the ones this person leads. */
export async function channelsLedBy(userId: string, channels: readonly { id: string; ownerId: string }[]): Promise<Set<string>> {
  if (channels.length === 0) return new Set();
  const rows = await db
    .select({ spaceId: SpaceMemberships.spaceId })
    .from(SpaceMemberships)
    .where(
      and(
        eq(SpaceMemberships.userId, userId),
        inArray(SpaceMemberships.role, LEAD_ROLES),
        inArray(
          SpaceMemberships.spaceId,
          channels.map((channel) => channel.id),
        ),
      ),
    );
  const led = new Set(rows.map((row) => row.spaceId));
  for (const channel of channels) if (channel.ownerId === userId) led.add(channel.id);
  return led;
}

/** "Answered by N", floored: below five it could name the people in a small group. */
export const ANSWERED_COUNT_FLOOR = 5;

export function flooredAnsweredCount(count: number | null | undefined): number | null {
  const n = count ?? 0;
  return n >= ANSWERED_COUNT_FLOOR ? n : null;
}
