/**
 * A church's own configuration — its time zone and its recurring service times.
 *
 * The **first self-serve `Churches` writer**. Every other write to that table
 * goes through `requireHarvousAdmin` in churches.ts; this one is the church's
 * own admin setting their own building's clock.
 *
 * Kept out of `church.ts` on purpose, for the same reason church-teaching-plan.ts
 * is: that file's contract tests slice its source from `/api/church/channels` to
 * `/api/church/billing` to prove the congregant half never accepts an `orgId`
 * from the request. A staff route needs one, so landing it in that window would
 * either break the arithmetic or weaken the assertion.
 *
 * Scope discipline: a service time labels a card and seeds a picker. Nothing
 * here schedules, reminds, or notifies — "scheduling" is a named anti-goal. See
 * docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md §1.
 *
 * Endpoints:
 *   GET  /api/church/settings                     — any staff; never sponsorship-gated
 *   POST /api/church/settings/update              — time zone
 *   POST /api/church/settings/service-times/create
 *   POST /api/church/settings/service-times/delete
 */

import { Hono } from 'hono';
import {
  db,
  Churches,
  ChurchServiceTimes,
  ChurchServiceTimeAssignments,
  and,
  eq,
} from '../db';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { isUniqueViolation } from '../utils/db-unique-violation';
import {
  assertCanManageChurchSettings,
  assertCanViewChurchSettings,
} from '../utils/church-settings-access';
import {
  normalizeChurchTimezone,
  normalizeServiceDay,
  normalizeServiceTime,
} from '../utils/church-service-time';
import {
  listServiceTimesForChurch,
  type ChurchServiceTimeRow,
} from '../utils/church-service-times';

const app = new Hono();

const LABEL_MAX = 40;

function serializeServiceTime(row: ChurchServiceTimeRow) {
  return {
    id: row.id,
    dayOfWeek: row.dayOfWeek,
    startTime: row.startTime,
    label: row.label,
    sortOrder: row.sortOrder,
  };
}

/** The whole settings payload — the church's clock and when it gathers. */
async function settingsPayload(church: {
  id: string;
  name: string;
  orgId: string;
  timezone: string | null;
  country: string | null;
  state: string | null;
}) {
  const serviceTimes = await listServiceTimesForChurch(church.id);
  return {
    church: { id: church.id, name: church.name, orgId: church.orgId },
    /*
      Raw, null intact: the form must be able to show "not set". `country` and
      `state` ride along so the time-zone picker can narrow to where the church
      actually is — Iowa is one zone where the US is 29. Both are read-only
      here, since they are set at registration (usually denormalized from
      Here's My Church), not by the church itself.
    */
    settings: {
      timezone: church.timezone,
      country: church.country,
      state: church.state,
    },
    serviceTimes: serviceTimes.map(serializeServiceTime),
  };
}

// ─── GET /api/church/settings ───────────────────────────────────────────────
app.get('/api/church/settings', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = (c.req.query('orgId') ?? '').trim();

    const gate = await assertCanViewChurchSettings(auth.userId, orgId);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    return c.json(await settingsPayload(gate.church));
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/settings',
      action: 'church_settings_read',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/settings/update ───────────────────────────────────────
app.post('/api/church/settings/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as { orgId?: string; timezone?: string | null };

    const gate = await assertCanManageChurchSettings(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    /*
      Only the time zone is assignable here. This handler is the one self-serve
      door into a table that also holds billing state, the HMC denorm cache, and
      the active kill-switch — none of which a church may set about itself.
    */
    if (body.timezone === undefined) {
      return c.json(await settingsPayload(gate.church));
    }

    const tz = normalizeChurchTimezone(body.timezone);
    if (!tz.ok) return c.json({ error: tz.reason, code: 'BAD_REQUEST' }, 400);

    const saved = await db
      .update(Churches)
      .set({ timezone: tz.value, updatedAt: new Date() })
      .where(eq(Churches.id, gate.church.id))
      .returning();

    return c.json({ success: true, ...(await settingsPayload(saved[0] ?? gate.church)) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/settings/update',
      action: 'church_settings_update',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/settings/service-times/create ─────────────────────────
app.post('/api/church/settings/service-times/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      dayOfWeek?: number | null;
      startTime?: string | null;
      label?: string | null;
    };

    const gate = await assertCanManageChurchSettings(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const day = normalizeServiceDay(body.dayOfWeek);
    if (!day.ok) return c.json({ error: day.reason, code: 'BAD_REQUEST' }, 400);
    if (day.value === null) {
      return c.json({ error: 'Pick a day for this service', code: 'BAD_REQUEST' }, 400);
    }
    const time = normalizeServiceTime(body.startTime);
    if (!time.ok) return c.json({ error: time.reason, code: 'BAD_REQUEST' }, 400);
    if (time.value === null) {
      return c.json({ error: 'Pick a time for this service', code: 'BAD_REQUEST' }, 400);
    }

    const label = String(body.label ?? '').trim().slice(0, LABEL_MAX) || null;
    const now = new Date();

    try {
      const saved = await db
        .insert(ChurchServiceTimes)
        .values({
          id: `cstm_${crypto.randomUUID()}`,
          churchId: gate.church.id,
          dayOfWeek: day.value,
          startTime: time.value,
          label,
          /*
            Always 0: the read orders by sortOrder, then day, then clock, so
            leaving every row equal makes the list read chronologically through
            the week — which is the order a church thinks in. The column exists
            for a future drag-to-reorder; nothing sets it yet, deliberately.
          */
          sortOrder: 0,
          createdAt: now,
        })
        .returning();
      return c.json({ success: true, serviceTime: serializeServiceTime(saved[0]!) });
    } catch (error) {
      if (isUniqueViolation(error, 'ChurchServiceTimes_church_day_time_unique')) {
        return c.json(
          { error: 'You already have a service at that day and time.', code: 'SERVICE_TIME_TAKEN' },
          409,
        );
      }
      throw error;
    }
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/settings/service-times/create',
      action: 'church_service_time_create',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/settings/service-times/delete ─────────────────────────
app.post('/api/church/settings/service-times/delete', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as { orgId?: string; serviceTimeId?: string };

    const gate = await assertCanManageChurchSettings(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const serviceTimeId = (body.serviceTimeId ?? '').trim();
    if (!serviceTimeId) {
      return c.json({ error: 'serviceTimeId is required', code: 'BAD_REQUEST' }, 400);
    }

    /*
      Scoped to this church's own slots: an unscoped delete would let one church
      remove another's. The same reason `validateReferences` re-checks a
      template's org in the teaching plan.
    */
    const removed = await db
      .delete(ChurchServiceTimes)
      .where(
        and(eq(ChurchServiceTimes.id, serviceTimeId), eq(ChurchServiceTimes.churchId, gate.church.id)),
      )
      .returning({ id: ChurchServiceTimes.id });

    if (removed.length === 0) {
      return c.json({ error: 'That service time was not found', code: 'SERVICE_TIME_NOT_FOUND' }, 404);
    }

    // Sermons pointed at it lose that assignment rather than dangling. The
    // sermons themselves survive — removing a slot is not deleting teaching.
    await db
      .delete(ChurchServiceTimeAssignments)
      .where(eq(ChurchServiceTimeAssignments.serviceTimeId, serviceTimeId));

    return c.json({ success: true, serviceTimeId });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/settings/service-times/delete',
      action: 'church_service_time_delete',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
