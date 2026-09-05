/**
 * Grant and revoke leadership of one space.
 *
 * The volunteer path: a youth leader who is not one of the church's ≤20 Clerk
 * staff can be given the Youth channel — publish, structure, and its teaching
 * plan — and nothing else. See `server/utils/church-space-leaders.ts` for the
 * boundary this must never cross.
 *
 * **Two lanes now**, and the handlers below are written not to care which. A
 * churchless Shared Space grants on its owner's authority alone; everything
 * church-specific lives in `assertCanGrantSpaceLeadership`, so widening the
 * gate widened the feature without a second copy of the promote/demote rules —
 * which, on an authorization path, is the whole point.
 *
 * The `/api/church/` prefix therefore now serves a room with no church, exactly
 * as `/api/church/spaces/:spaceId/plan` already does. Following that precedent
 * beat minting a second path: one implementation of who-may-promote is worth
 * more than a tidy namespace.
 *
 * Still separate from `spaces.ts`'s member routes on purpose. Those are the
 * membership model (owner removes members, paid add-on, invites); this is
 * authority over a room, and conflating them is how a role check ends up
 * inside a billing file.
 *
 * Endpoints:
 *   POST /api/church/spaces/:spaceId/leaders/grant   { userId }
 *   POST /api/church/spaces/:spaceId/leaders/revoke  { userId }
 */

import { Hono } from 'hono';
import { db, first, SpaceMemberships, and, eq } from '../db';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { nowISO } from '../db/dates';
import { assertCanGrantSpaceLeadership, GRANT_SOURCE } from '../utils/church-space-leaders';

const app = new Hono();

type LeaderInput = { userId?: string };

/** The membership this grant would act on, with the reasons it may not. */
async function loadTarget(spaceId: string, targetUserId: string) {
  return first(
    await db
      .select()
      .from(SpaceMemberships)
      .where(and(eq(SpaceMemberships.spaceId, spaceId), eq(SpaceMemberships.userId, targetUserId)))
      .limit(1),
  );
}

// ─── POST /api/church/spaces/:spaceId/leaders/grant ─────────────────────────
app.post('/api/church/spaces/:spaceId/leaders/grant', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertCanGrantSpaceLeadership(auth.userId, c.req.param('spaceId') ?? '');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const body = (await c.req.json().catch(() => ({}))) as LeaderInput;
    const targetUserId = (body.userId ?? '').trim();
    if (!targetUserId) return c.json({ error: 'userId is required', code: 'BAD_REQUEST' }, 400);

    /*
      You promote someone already in the room. Granting to a stranger would be
      an invite, which is a different act with a different consent story — they
      have to have joined before they can lead.
    */
    const membership = await loadTarget(gate.space.id, targetUserId);
    if (!membership) {
      return c.json(
        { error: 'That person is not in this space yet', code: 'NOT_A_MEMBER' },
        404,
      );
    }

    if (membership.role === 'owner') {
      // The owner already leads by definition, and demoting them later would
      // strand the space — the same reason staff sync never touches this row.
      return c.json(
        { error: 'The space owner already leads this space', code: 'ALREADY_LEADS' },
        409,
      );
    }

    if (membership.role === 'leader' && membership.grantSource !== GRANT_SOURCE) {
      /*
        A staff-projected leader. Converting it to a grant would take the row
        out of the roster sweep's hands, so removing them from Clerk staff
        would silently leave them leading. Their leadership is already correct;
        it just belongs to the sync.

        Unreachable in the space lane — nothing writes a leader row there but
        this route, and it always stamps `grantSource`. The wording still turns
        on the lane rather than asserting that: a message that names church
        staff to a life group would be nonsense the day something else writes
        one of these rows.
      */
      return c.json(
        {
          error:
            gate.lane === 'church'
              ? 'They already lead this space as church staff'
              : 'They already lead this space',
          code: 'STAFF_LEADER',
        },
        409,
      );
    }

    await db
      .update(SpaceMemberships)
      .set({ role: 'leader', grantSource: GRANT_SOURCE, updatedAt: nowISO() })
      .where(and(eq(SpaceMemberships.spaceId, gate.space.id), eq(SpaceMemberships.userId, targetUserId)));

    return c.json({ success: true, userId: targetUserId, role: 'leader', grantSource: GRANT_SOURCE });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/leaders/grant',
      action: 'grant_space_leadership',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/spaces/:spaceId/leaders/revoke ────────────────────────
/**
 * Revocation is first-class, not "delete the row and hope".
 *
 * The person stays in the space as a member — they were probably a member
 * before they led, and taking their access away entirely is a different
 * decision from taking their authority away.
 */
app.post('/api/church/spaces/:spaceId/leaders/revoke', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertCanGrantSpaceLeadership(auth.userId, c.req.param('spaceId') ?? '');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const body = (await c.req.json().catch(() => ({}))) as LeaderInput;
    const targetUserId = (body.userId ?? '').trim();
    if (!targetUserId) return c.json({ error: 'userId is required', code: 'BAD_REQUEST' }, 400);

    const membership = await loadTarget(gate.space.id, targetUserId);
    if (!membership) {
      return c.json({ error: 'That person is not in this space', code: 'NOT_A_MEMBER' }, 404);
    }

    /*
      Only a grant is revocable here. A staff-projected leader's row belongs to
      `syncChurchStaffForOrg` — demoting it would just be undone on the next
      webhook, and the honest fix is to change their Clerk role instead.
    */
    if (membership.role !== 'leader' || membership.grantSource !== GRANT_SOURCE) {
      return c.json(
        {
          error:
            membership.role !== 'leader'
              ? 'They do not lead this space'
              : gate.lane === 'church'
                ? 'They lead this space as church staff. Change their role on the Team instead.'
                : 'They do not lead this space',
          code: membership.role === 'leader' ? 'STAFF_LEADER' : 'NOT_A_LEADER',
        },
        409,
      );
    }

    await db
      .update(SpaceMemberships)
      // grantSource back to null: the row returns to plain membership, and a
      // NULL here reads as "not a grant" everywhere that checks.
      .set({ role: 'member', grantSource: null, updatedAt: nowISO() })
      .where(and(eq(SpaceMemberships.spaceId, gate.space.id), eq(SpaceMemberships.userId, targetUserId)));

    return c.json({ success: true, userId: targetUserId, role: 'member' });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/leaders/revoke',
      action: 'revoke_space_leadership',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
