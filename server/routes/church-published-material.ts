/**
 * Attach published material to the week — or the run — it is for.
 *
 * The staff half of the inversion in
 * `docs/future/CHURCH_STUDY_MATERIAL_LINKING.md`. The youth pastor publishes a
 * discussion guide into the Youth channel and says what it is for; the
 * congregation's "This Sunday" renders it. The service never points back.
 *
 *   GET  /api/church/published-material/targets   — the picker's options
 *   GET  /api/church/published-material/for-note  — what this note claims now
 *   POST /api/church/published-material/set       — replace what it claims
 *
 * **The gate is the room, not the church.** Every route here is scoped by
 * `canAuthorInSpace` on the ministry channel the note lives in, which is
 * leader-or-owner for a `type='public'` space. That is deliberately *not*
 * `manage_teaching_plan`: the linking doc's fourth complaint about the pointer
 * this replaces was that the wrong person authored it — curation sat with
 * whoever planned the service, while the knowledge sat with whoever made the
 * material. A granted channel leader can attach; a congregant who follows the
 * channel holds `member` and cannot.
 *
 * Targets stay church-scoped even so, so leading one room never becomes a way
 * to write on another church's plan.
 */

import { Hono } from 'hono';
import { db, and, eq, isNull, Spaces, SpaceNotes } from '../db';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { isMinistryBroadcastSpaceRow } from '../utils/channel-publish-cadence';
import { canAuthorInSpace, requireSpaceAccess, SpaceAccessError } from '../utils/space-access';
import { getActiveChurchByOrgId } from '../utils/church-staff';
import { listServicesForChurch } from '../utils/church-teaching-plan';
import { listSeriesForPlan } from '../utils/church-series';
import {
  publishedMaterialClaimsForNote,
  setPublishedMaterialForNote,
  PUBLISHED_MATERIAL_MAX_TARGETS,
} from '../utils/church-published-material';
import type { ChurchRow } from '../utils/church-entitlement';

const app = new Hono();

/** How far ahead the picker offers weeks. A quarter of Sundays, the plan's own horizon. */
const TARGETS_LIMIT = 50;

type AttachGate =
  | { ok: true; church: ChurchRow; channelId: string }
  | { ok: false; status: 403 | 404; error: string; code: string };

/**
 * May this user attach on behalf of this note?
 *
 * Resolves the note to the live ministry channel it sits in, then asks the
 * ordinary space gate. A note in someone's personal space, or in a Shared
 * Space, has no channel to publish from and is refused — 404 rather than 403,
 * because a stranger must not learn that a note id exists.
 */
async function gateAttachForNote(userId: string, noteId: string): Promise<AttachGate> {
  const rows = await db
    .select({
      spaceId: Spaces.id,
      spaceType: Spaces.type,
      spaceOrgId: Spaces.orgId,
      spaceIsActive: Spaces.isActive,
    })
    .from(SpaceNotes)
    .innerJoin(Spaces, eq(Spaces.id, SpaceNotes.spaceId))
    .where(and(eq(SpaceNotes.noteId, noteId), isNull(SpaceNotes.removedAt), isNull(Spaces.deletedAt)));

  const channel = rows.find(
    (row) =>
      row.spaceIsActive && isMinistryBroadcastSpaceRow({ type: row.spaceType, orgId: row.spaceOrgId }),
  );
  if (!channel || !channel.spaceOrgId) {
    return { ok: false, status: 404, error: 'Note not found', code: 'NOT_FOUND' };
  }

  let access;
  try {
    access = await requireSpaceAccess(channel.spaceId, userId);
  } catch (error) {
    if (error instanceof SpaceAccessError) {
      return { ok: false, status: 404, error: 'Note not found', code: 'NOT_FOUND' };
    }
    throw error;
  }
  if (!canAuthorInSpace(access.space, access.role)) {
    return { ok: false, status: 403, error: 'You cannot publish in this channel', code: 'FORBIDDEN' };
  }

  const church = await getActiveChurchByOrgId(channel.spaceOrgId);
  if (!church) {
    return { ok: false, status: 404, error: 'Church not found', code: 'NOT_FOUND' };
  }

  return { ok: true, church, channelId: channel.spaceId };
}

/**
 * GET /api/church/published-material/targets?noteId= — what this note may claim.
 *
 * The church's upcoming weeks and its series, both from the **church plan**.
 * Deliberately not the channel's own space plan: attaching is how a ministry
 * speaks to the congregation's Sunday, and a channel's own plan is already
 * delivered to its followers without any of this.
 */
app.get('/api/church/published-material/targets', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = (c.req.query('noteId') ?? '').trim();
    if (!noteId) return c.json({ error: 'noteId is required', code: 'BAD_REQUEST' }, 400);

    const gate = await gateAttachForNote(auth.userId, noteId);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const today = new Date().toISOString().slice(0, 10);
    const [services, series] = await Promise.all([
      listServicesForChurch(gate.church.id, { from: today, limit: TARGETS_LIMIT }),
      listSeriesForPlan({ churchId: gate.church.id, spaceId: null }),
    ]);

    return c.json({
      services: services.map((service) => ({
        id: service.id,
        title: service.title,
        serviceDate: service.serviceDate,
        seriesId: service.seriesId,
      })),
      series: series.map((row) => ({
        id: row.id,
        title: row.title,
        runLabel: row.runLabel,
        serviceCount: row.serviceCount,
      })),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/published-material/targets',
      action: 'published_material_targets',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** GET /api/church/published-material/for-note?noteId= — the picker's current state. */
app.get('/api/church/published-material/for-note', requireAuth, rateLimit('read'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = (c.req.query('noteId') ?? '').trim();
    if (!noteId) return c.json({ error: 'noteId is required', code: 'BAD_REQUEST' }, 400);

    const gate = await gateAttachForNote(auth.userId, noteId);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    return c.json(await publishedMaterialClaimsForNote(noteId));
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/published-material/for-note',
      action: 'published_material_for_note',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * POST /api/church/published-material/set — replace everything this note claims.
 *
 * Replace-set, so the picker sends what it holds rather than a diff. Both
 * arrays are required keys: an absent one is a bad request, not "leave that
 * grain alone", for the same reason `link-note` refuses an absent `serviceId`.
 */
app.post('/api/church/published-material/set', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      noteId?: string;
      serviceIds?: unknown;
      seriesIds?: unknown;
    };

    const noteId = (body.noteId ?? '').trim();
    if (!noteId) return c.json({ error: 'noteId is required', code: 'BAD_REQUEST' }, 400);
    if (!Array.isArray(body.serviceIds) || !Array.isArray(body.seriesIds)) {
      return c.json(
        { error: 'serviceIds and seriesIds are required', code: 'BAD_REQUEST' },
        400,
      );
    }

    const serviceIds = body.serviceIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    const seriesIds = body.seriesIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (serviceIds.length + seriesIds.length > PUBLISHED_MATERIAL_MAX_TARGETS) {
      return c.json(
        { error: `At most ${PUBLISHED_MATERIAL_MAX_TARGETS} attachments on one note`, code: 'TOO_MANY_ATTACHMENTS' },
        400,
      );
    }

    const gate = await gateAttachForNote(auth.userId, noteId);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const result = await setPublishedMaterialForNote({
      noteId,
      serviceIds,
      seriesIds,
      churchId: gate.church.id,
      userId: auth.userId,
    });
    if (!result.ok) return c.json({ error: result.error, code: result.code }, result.status);

    return c.json({ success: true, noteId, serviceIds, seriesIds });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/published-material/set',
      action: 'published_material_set',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
