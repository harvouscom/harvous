/**
 * Church (Clerk organization) routes.
 *
 * Endpoints:
 *   POST /api/churches          — Create church (Clerk org + Churches row)
 *   GET  /api/churches/me       — Current user's linked church (if any)
 */

import { Hono } from 'hono';
import { createClerkClient } from '@clerk/backend';
import { getAuth } from '../middleware/auth';
import { db, Churches, UserMetadata, eq } from '../db';
import { nowISO } from '../db/dates';
import { handleAPIError } from '@/utils/error-handling';

const app = new Hono();

// ─── POST /api/churches ───────────────────────────────────────────────────────

app.post('/api/churches', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json().catch(() => ({}));
    const churchName = typeof body.churchName === 'string' ? body.churchName.trim() : '';
    const churchCity = typeof body.churchCity === 'string' ? body.churchCity.trim() || null : null;
    const churchState = typeof body.churchState === 'string' ? body.churchState.trim() || null : null;
    const churchCountry = typeof body.churchCountry === 'string' ? body.churchCountry.trim() || null : null;

    if (!churchName) {
      return c.json({ error: 'Church name is required' }, 400);
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      return c.json({ error: 'Server configuration error' }, 500);
    }

    const clerkClient = createClerkClient({ secretKey: clerkSecretKey });
    const org = await clerkClient.organizations.createOrganization({
      name: churchName,
      createdBy: auth.userId,
    });

    const id = `church_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const now = nowISO();
    await db.insert(Churches).values({
      id,
      orgId: org.id,
      churchName,
      churchCity,
      churchState,
      churchCountry,
      adminUserId: auth.userId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return c.json({
      success: true,
      church: {
        id,
        orgId: org.id,
        churchName,
        churchCity,
        churchState,
        churchCountry,
      },
    });
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: 'POST /api/churches', action: 'create_church' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/churches/me ─────────────────────────────────────────────────────

app.get('/api/churches/me', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Unauthorized' }, 401);

    const um = await db
      .select({ connectedChurchId: UserMetadata.connectedChurchId, connectedOrgId: UserMetadata.connectedOrgId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, auth.userId))
      .get();

    if (!um?.connectedChurchId && !um?.connectedOrgId) {
      return c.json({ church: null });
    }

    const church = await db
      .select()
      .from(Churches)
      .where(
        um.connectedChurchId
          ? eq(Churches.id, um.connectedChurchId)
          : eq(Churches.orgId, um.connectedOrgId!),
      )
      .get();

    if (!church || !church.isActive) {
      return c.json({ church: null });
    }

    return c.json({
      church: {
        id: church.id,
        orgId: church.orgId,
        churchName: church.churchName,
        churchCity: church.churchCity,
        churchState: church.churchState,
        churchCountry: church.churchCountry,
      },
    });
  } catch (error: unknown) {
    const e = handleAPIError(error, { endpoint: 'GET /api/churches/me', action: 'get_my_church' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default app;
