/**
 * Who may write a church's review questions, and for which channel.
 *
 * Composes `resolveChurchOrgAccess`, so staff are proven before anyone learns whether the church
 * has lapsed. Gated on `publish`: writing a question for a channel is publishing to it, and
 * every staff role holds that. When ministries scope staff (docs/CHURCH_V2_ROADMAP.md §C) this is
 * the one place that narrows to the channels a staffer leads.
 *
 * Reads are never sponsorship-gated — a lapsed church's staff still see what they wrote.
 * Archiving isn't either: taking a question down must always work.
 */
import { db, first, Spaces, eq } from '../db';
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
  return { ok: true, church: gate.church, channel: { id: channel.id, title: channel.title } };
}

/** "Answered by N", floored: below five it could name the people in a small group. */
export const ANSWERED_COUNT_FLOOR = 5;

export function flooredAnsweredCount(count: number | null | undefined): number | null {
  const n = count ?? 0;
  return n >= ANSWERED_COUNT_FLOOR ? n : null;
}
