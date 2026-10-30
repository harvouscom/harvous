/**
 * Church applications — a church asking to join Harvous, and a Harvous admin answering.
 *
 * Its own file because it is the one place a signed-in stranger can start a church: the
 * applicant half takes nothing but their own request, and the admin half is
 * `requireHarvousAdmin` throughout. See server/utils/church-applications.ts for the lifecycle.
 *
 * Endpoints:
 *   GET  /api/church-applications/mine
 *   POST /api/church-applications                       — submit
 *   POST /api/church-applications/:id/withdraw
 *   GET  /api/admin/church-applications?status=pending
 *   POST /api/admin/church-applications/:id/approve
 *   POST /api/admin/church-applications/:id/decline
 */
import { Hono } from 'hono';
import { db, first, Churches, eq } from '../db';
import { getAuthenticatedAuth, requireAuth, getAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { requireHarvousAdmin, getHarvousSystemUserId } from '../utils/harvous-admin';
import {
  approveApplication,
  cleanApplicationInput,
  declineApplication,
  latestApplicationFor,
  listApplications,
  submitApplication,
  withdrawApplication,
  type ApplicationStatus,
  type ChurchApplicationRow,
} from '../utils/church-applications';
import { HmcPartnerError } from '../utils/hmc-partner';

const app = new Hono();

/** What an applicant sees of their own request. Never the admin's identity. */
function forApplicant(row: ChurchApplicationRow) {
  return {
    id: row.id,
    status: row.status,
    hmcChurchId: row.hmcChurchId,
    name: row.name,
    city: row.city,
    state: row.state,
    churchId: row.churchId,
    decisionNote: row.status === 'declined' ? row.decisionNote : null,
    createdAt: row.createdAt,
  };
}

app.get('/api/church-applications/mine', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const row = await latestApplicationFor(auth.userId);
    let church: { id: string; name: string; orgId: string } | null = null;
    if (row?.churchId) {
      church =
        first(
          await db
            .select({ id: Churches.id, name: Churches.name, orgId: Churches.orgId })
            .from(Churches)
            .where(eq(Churches.id, row.churchId))
            .limit(1),
        ) ?? null;
    }
    return c.json({ application: row ? forApplicant(row) : null, church });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church-applications/mine', action: 'church_application_mine' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/church-applications', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = cleanApplicationInput(body);
    if (!input.ok) return c.json({ error: input.error, code: input.code }, 400);
    const result = await submitApplication(auth.userId, input.value);
    if (!result.ok) {
      return c.json({ error: result.error, code: result.code, church: result.church ?? null }, result.status);
    }
    return c.json({ application: forApplicant(result.application) });
  } catch (error) {
    if (error instanceof HmcPartnerError) return c.json({ error: error.message, code: error.code }, 502);
    const e = handleAPIError(error, { endpoint: '/api/church-applications', action: 'church_application_submit' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/church-applications/:id/withdraw', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const ok = await withdrawApplication(auth.userId, c.req.param('id') ?? '');
    if (!ok) return c.json({ error: 'No waiting request to withdraw', code: 'NOT_PENDING' }, 409);
    return c.json({ success: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church-applications/[id]/withdraw', action: 'church_application_withdraw' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── Admin ───────────────────────────────────────────────────────────────────

const STATUSES: ApplicationStatus[] = ['pending', 'approved', 'declined', 'withdrawn'];

app.get('/api/admin/church-applications', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const raw = (c.req.query('status') ?? 'pending') as ApplicationStatus;
    const status = STATUSES.includes(raw) ? raw : 'pending';
    return c.json({ applications: await listApplications(status) });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/admin/church-applications', action: 'list_church_applications' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/admin/church-applications/:id/approve', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const adminUserId = getAuth(c)?.userId ?? getHarvousSystemUserId();
    const result = await approveApplication({ id: c.req.param('id'), adminUserId });
    if (!result.ok) return c.json({ error: result.error, code: result.code }, result.status);
    return c.json({
      success: true,
      church: result.church,
      seededServiceTimes: result.seededServiceTimes,
      alreadyPickedCount: result.alreadyPickedCount,
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/admin/church-applications/[id]/approve', action: 'approve_church_application' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/admin/church-applications/:id/decline', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const body = (await c.req.json().catch(() => ({}))) as { note?: unknown };
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null;
    const adminUserId = getAuth(c)?.userId ?? getHarvousSystemUserId();
    const ok = await declineApplication({ id: c.req.param('id'), adminUserId, note });
    if (!ok) return c.json({ error: 'That request was already decided', code: 'NOT_PENDING' }, 409);
    return c.json({ success: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/admin/church-applications/[id]/decline', action: 'decline_church_application' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default app;
