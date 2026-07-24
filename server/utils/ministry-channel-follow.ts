/**
 * Congregant follow rail for ministry channels (type='public' + orgId).
 * Adds/removes SpaceMemberships role='member' only — never touches owner/leader
 * (staff sync owns those). UI can stay dark; connect-accept calls these later.
 */

import { db, first, Spaces, SpaceMemberships, eq, and } from '../db';
import { nowISO } from '../db/dates';
import { isMinistryBroadcastSpaceRow } from './channel-publish-cadence';

export type MinistryChannelFollowPlan =
  | { action: 'insert' }
  | { action: 'noop'; reason: 'already_member' | 'already_staff' }
  | { action: 'reject'; code: 'NOT_MINISTRY_CHANNEL' | 'SPACE_INACTIVE' | 'SPACE_NOT_FOUND' };

export type MinistryChannelUnfollowPlan =
  | { action: 'delete' }
  | { action: 'noop'; reason: 'not_following' }
  | { action: 'reject'; code: 'STAFF_ROW' | 'NOT_MINISTRY_CHANNEL' | 'SPACE_NOT_FOUND' };

export function planMinistryChannelFollow(options: {
  space: { type?: string | null; orgId?: string | null; deletedAt?: string | null } | null;
  existingRole: string | null;
}): MinistryChannelFollowPlan {
  if (!options.space) return { action: 'reject', code: 'SPACE_NOT_FOUND' };
  if (options.space.deletedAt) return { action: 'reject', code: 'SPACE_INACTIVE' };
  if (!isMinistryBroadcastSpaceRow(options.space)) {
    return { action: 'reject', code: 'NOT_MINISTRY_CHANNEL' };
  }
  if (options.existingRole === 'owner' || options.existingRole === 'leader') {
    return { action: 'noop', reason: 'already_staff' };
  }
  if (options.existingRole === 'member') {
    return { action: 'noop', reason: 'already_member' };
  }
  return { action: 'insert' };
}

export function planMinistryChannelUnfollow(options: {
  space: { type?: string | null; orgId?: string | null } | null;
  existingRole: string | null;
}): MinistryChannelUnfollowPlan {
  if (!options.space) return { action: 'reject', code: 'SPACE_NOT_FOUND' };
  if (!isMinistryBroadcastSpaceRow(options.space)) {
    return { action: 'reject', code: 'NOT_MINISTRY_CHANNEL' };
  }
  if (options.existingRole === 'owner' || options.existingRole === 'leader') {
    return { action: 'reject', code: 'STAFF_ROW' };
  }
  if (options.existingRole !== 'member') {
    return { action: 'noop', reason: 'not_following' };
  }
  return { action: 'delete' };
}

async function loadSpaceAndMembership(spaceId: string, userId: string) {
  const space = first(
    await db.select().from(Spaces).where(eq(Spaces.id, spaceId)).limit(1),
  );
  const membership = first(
    await db
      .select()
      .from(SpaceMemberships)
      .where(and(eq(SpaceMemberships.spaceId, spaceId), eq(SpaceMemberships.userId, userId)))
      .limit(1),
  );
  return { space, membership };
}

/**
 * Follow a ministry channel as role='member'. Idempotent for existing members;
 * no-ops if the user is already staff on the channel.
 */
export async function followMinistryChannel(
  userId: string,
  spaceId: string,
): Promise<{ followed: boolean; reason?: string; code?: string }> {
  const id = spaceId.trim();
  const uid = userId.trim();
  if (!id || !uid) return { followed: false, code: 'SPACE_NOT_FOUND', reason: 'Missing ids' };

  const { space, membership } = await loadSpaceAndMembership(id, uid);
  const plan = planMinistryChannelFollow({
    space,
    existingRole: membership?.role ?? null,
  });

  if (plan.action === 'reject') {
    return { followed: false, code: plan.code, reason: plan.code };
  }
  if (plan.action === 'noop') {
    return { followed: false, reason: plan.reason };
  }

  const now = nowISO();
  await db.insert(SpaceMemberships).values({
    id: `smem_${crypto.randomUUID()}`,
    spaceId: id,
    userId: uid,
    role: 'member',
    joinedAt: now,
    createdAt: now,
  });
  return { followed: true };
}

/**
 * Unfollow a ministry channel. Only removes role='member' — never staff rows.
 */
export async function unfollowMinistryChannel(
  userId: string,
  spaceId: string,
): Promise<{ unfollowed: boolean; reason?: string; code?: string }> {
  const id = spaceId.trim();
  const uid = userId.trim();
  if (!id || !uid) return { unfollowed: false, code: 'SPACE_NOT_FOUND', reason: 'Missing ids' };

  const { space, membership } = await loadSpaceAndMembership(id, uid);
  const plan = planMinistryChannelUnfollow({
    space,
    existingRole: membership?.role ?? null,
  });

  if (plan.action === 'reject') {
    return { unfollowed: false, code: plan.code, reason: plan.code };
  }
  if (plan.action === 'noop') {
    return { unfollowed: false, reason: plan.reason };
  }

  await db
    .delete(SpaceMemberships)
    .where(
      and(
        eq(SpaceMemberships.spaceId, id),
        eq(SpaceMemberships.userId, uid),
        eq(SpaceMemberships.role, 'member'),
      ),
    );
  return { unfollowed: true };
}
