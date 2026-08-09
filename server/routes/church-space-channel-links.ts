/**
 * Which of a church's rooms are paired — staff-only, and addressed by org.
 *
 * Every read goes through `resolveCompanionChannel` / `listCompanionLinks`
 * rather than the link table, because a stored pairing is not a live one; see
 * the docblock on server/utils/church-space-channel-links.ts and the post-mortem
 * it points at.
 */
import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { assertCanManageChannelLinks } from '../utils/church-staff';
import { requireSpaceAccess, SpaceAccessError } from '../utils/space-access';
import {
  listCompanionLinks,
  resolveCompanionChannel,
  resolveCompanionOf,
  setChannelLink,
} from '../utils/church-space-channel-links';

const app = new Hono();

// ─── GET /api/church/space-channel-links ────────────────────────────────────
app.get('/api/church/space-channel-links', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = (c.req.query('orgId') ?? '').trim();
    if (!orgId) return c.json({ error: 'orgId is required', code: 'ORG_ID_REQUIRED' }, 400);

    const gate = await assertCanManageChannelLinks(auth.userId, orgId);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    return c.json({ links: await listCompanionLinks(gate.church.orgId) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/space-channel-links',
      action: 'channel_links_list',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/companion ─────────────────────────────────────
/**
 * The other half of this room's pairing, for its header.
 *
 * Membership-gated rather than staff-gated: the pairing is a fact about the
 * room, and the people in it are who the chip is for. Asked per room rather
 * than folded into the navigation payload, because it is only ever needed for
 * the room being looked at and the nav read would pay for it on every space.
 *
 * A room answers on whichever side it sits: a Shared Space reports the channel
 * it broadcasts through, a channel reports the space it speaks for. Both null
 * is the overwhelmingly common answer and renders nothing.
 */
app.get('/api/spaces/:spaceId/companion', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceId = c.req.param('spaceId') ?? '';
    const { space } = await requireSpaceAccess(spaceId, auth.userId);

    if (!space.orgId) return c.json({ companionChannel: null, companionOfSpace: null });

    const [companionChannel, companionOfSpace] = await Promise.all([
      space.type === 'shared' ? resolveCompanionChannel(space.id) : Promise.resolve(null),
      space.type === 'public' ? resolveCompanionOf(space.id) : Promise.resolve(null),
    ]);

    return c.json({ companionChannel, companionOfSpace });
  } catch (error) {
    if (error instanceof SpaceAccessError) {
      return c.json({ error: error.message, code: 'SPACE_ACCESS' }, error.status);
    }
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/companion',
      action: 'space_companion_read',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/space-channel-links/set ───────────────────────────────
/**
 * Pair a room with a channel, or clear it with `channelSpaceId: null`.
 *
 * Null is a real value here rather than a separate unpair route: "which channel
 * does this room use" has one answer at a time, and "none" is one of them.
 */
app.post('/api/church/space-channel-links/set', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      spaceId?: string;
      channelSpaceId?: string | null;
    };

    const orgId = (body.orgId ?? '').trim();
    if (!orgId) return c.json({ error: 'orgId is required', code: 'ORG_ID_REQUIRED' }, 400);

    const gate = await assertCanManageChannelLinks(auth.userId, orgId);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const spaceId = (body.spaceId ?? '').trim();
    if (!spaceId) return c.json({ error: 'spaceId is required', code: 'SPACE_ID_REQUIRED' }, 400);

    const channelSpaceId = (body.channelSpaceId ?? '')?.trim() || null;

    const result = await setChannelLink({
      orgId: gate.church.orgId,
      spaceId,
      channelSpaceId,
      userId: auth.userId,
    });
    if (!result.ok) return c.json({ error: result.error, code: result.code }, result.status);

    return c.json({ success: true, companion: result.companion });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/space-channel-links/set',
      action: 'channel_links_set',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
