/**
 * A ministry's own teaching plan — "Youth meets Wednesdays and studies this."
 *
 * The church-level plan lives in `church-teaching-plan.ts` and is addressed by
 * `orgId`. These routes are the same rows narrowed by `ChurchServices.spaceId`,
 * addressed by `spaceId` instead: the gate resolves the space, proves it is one
 * of that church's rooms, and derives the church from it — so a caller can
 * never name a church that does not own the space they are editing.
 *
 * Kept in its own file for the same reason the church plan is: `church.ts`'s
 * contract test slices source by endpoint position to prove the congregant half
 * takes no ids from the request, and staff routes need them.
 *
 * Three differences from the church plan, all deliberate:
 *   - **No service-time slots.** Those belong to the church (a church holds
 *     several services on one morning); a space gathers once, so the space's
 *     own `meetingTime` labels its rows and a slot claim is refused.
 *   - **Uniqueness is a DB index**, `ChurchServices_space_date_unique` — one
 *     gathering per date, enforceable because every space row is timeless.
 *   - **`spaceId` is immutable.** There is no moving a sermon between plans;
 *     delete and recreate.
 *
 * Endpoints:
 *   GET  /api/church/spaces/:spaceId/plan
 *   POST /api/church/spaces/:spaceId/services/create
 *   POST /api/church/spaces/:spaceId/services/update
 *   POST /api/church/spaces/:spaceId/services/repeat
 *   POST /api/church/spaces/:spaceId/services/delete
 *   POST /api/church/spaces/:spaceId/series/rename
 *   POST /api/church/spaces/:spaceId/series/delete
 */

import { Hono } from 'hono';
import { db, first, ChurchServices, NoteTemplates, and, asc, eq } from '../db';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { isUniqueViolation } from '../utils/db-unique-violation';
import { canonicalizeServiceReference } from '../utils/church-service-passage';
import {
  assertCanManageSpaceTeachingPlan,
  assertCanViewSpaceTeachingPlan,
} from '../utils/church-space-plan';
import { parseServiceDateInput, type ChurchServiceRow } from '../utils/church-teaching-plan';
import {
  REPEAT_MAX_WEEKS,
  repeatTitleFor,
  weeklyDatesAfter,
} from '../utils/church-sermon-repeat';
import {
  deleteSeries,
  listSeriesForPlan,
  renameSeries,
  resolveSeriesForWrite,
  seriesTitlesByServiceRows,
} from '../utils/church-series';

const app = new Hono();

const TITLE_MAX = 120;

type SpaceSermonInput = {
  serviceId?: string;
  /** Explicit `null` files this as an undated backlog idea — see parseServiceDateInput. */
  serviceDate?: string | null;
  title?: string;
  /** An existing ChurchSeries in *this space's* plan — never the church's. */
  seriesId?: string | null;
  /** A name instead: typing a new series creates the row, scoped to this space. */
  seriesTitle?: string | null;
  reference?: string | null;
  starterTemplateId?: string | null;
};

function clean(value: string | null | undefined, max: number): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Same shape as the church plan's serializer minus slots, so one client
 * component can render either plan without branching on which it asked for.
 */
function serializeSpaceSermon(row: ChurchServiceRow, seriesTitles?: Map<string, string>) {
  return {
    id: row.id,
    serviceDate: row.serviceDate,
    /** Always empty for a space row — slots are the church's. */
    serviceTimeIds: [] as string[],
    serviceTime: row.serviceTime,
    title: row.title,
    seriesId: row.seriesId,
    /** Joined, not stored — see the church plan's serializer. */
    seriesTitle: row.seriesId ? seriesTitles?.get(row.seriesId) ?? null : null,
    reference: row.reference,
    starterTemplateId: row.starterTemplateId,
    /* Backlog order. `updatedAt` cannot stand in for it: editing an idea
       would reshuffle the Ideas column under the pastor's cursor. */
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? row.createdAt,
  };
}

/** The starter template must belong to this church, same guard as the church plan. */
async function validateStarter(
  orgId: string,
  starterTemplateId: string | null,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  if (!starterTemplateId) return { ok: true };
  const template = first(
    await db
      .select({ id: NoteTemplates.id })
      .from(NoteTemplates)
      .where(and(eq(NoteTemplates.id, starterTemplateId), eq(NoteTemplates.orgId, orgId)))
      .limit(1),
  );
  if (!template) {
    return {
      ok: false,
      code: 'TEMPLATE_NOT_FOUND',
      error: 'That starter template is not one of your church templates',
    };
  }
  return { ok: true };
}

// ─── GET /api/church/spaces/:spaceId/plan ───────────────────────────────────
app.get('/api/church/spaces/:spaceId/plan', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertCanViewSpaceTeachingPlan(auth.userId, c.req.param('spaceId') ?? '');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const services = await db
      .select()
      .from(ChurchServices)
      .where(eq(ChurchServices.spaceId, gate.space.id))
      .orderBy(asc(ChurchServices.serviceDate));

    const scope = { churchId: gate.church.id, spaceId: gate.space.id };
    const seriesTitles = await seriesTitlesByServiceRows(services);

    return c.json({
      church: { id: gate.church.id, name: gate.church.name },
      space: {
        id: gate.space.id,
        title: gate.space.title,
        /*
          The space's own gathering rhythm, filling the same payload key the
          church plan uses for its service times. One entry, because a space
          gathers once — the shape matches so the editor needs no branch.
        */
        meetingDay: gate.space.meetingDay,
        meetingTime: gate.space.meetingTime,
      },
      services: services.map((row) => serializeSpaceSermon(row, seriesTitles)),
      // Per-plan vocabulary: Youth's series and the church's stay separate — the
      // scope is what keeps a volunteer leader out of the main service's rows.
      series: await listSeriesForPlan(scope),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/plan',
      action: 'church_space_plan',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/spaces/:spaceId/services/create ───────────────────────
app.post('/api/church/spaces/:spaceId/services/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertCanManageSpaceTeachingPlan(auth.userId, c.req.param('spaceId') ?? '');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const body = (await c.req.json().catch(() => ({}))) as SpaceSermonInput;

    const parsedDate = parseServiceDateInput(body.serviceDate);
    if (!parsedDate.ok) {
      return c.json({ error: parsedDate.reason, code: 'BAD_REQUEST' }, 400);
    }
    if (parsedDate.kind === 'absent') {
      return c.json({ error: 'serviceDate must be YYYY-MM-DD', code: 'BAD_REQUEST' }, 400);
    }
    /* NULL files this as an undated idea in the channel's backlog. */
    const serviceDate = parsedDate.kind === 'date' ? parsedDate.value : null;
    const title = clean(body.title, TITLE_MAX);
    if (!title) return c.json({ error: 'A title is required', code: 'BAD_REQUEST' }, 400);

    const passage = canonicalizeServiceReference(body.reference);
    if (!passage.ok) return c.json({ error: passage.reason, code: 'INVALID_REFERENCE' }, 400);

    const starterTemplateId = clean(body.starterTemplateId, 200);
    const starter = await validateStarter(gate.church.orgId, starterTemplateId);
    if (!starter.ok) return c.json({ error: starter.error, code: starter.code }, 400);

    const now = new Date();
    /*
      Resolved inside the transaction below rather than here, so a rejected
      gathering takes any series it named down with it. On a space plan that is
      not an edge case: "this ministry already has a gathering that day" is the
      one date rule, it is raised by the index *after* the insert, and it would
      otherwise leave a real empty series behind in the picker every time.
    */
    let seriesId: string | null = null;
    /* A holder, not a bare `let`: TS narrows a closure-assigned local to
       `never` at the check below, and this is the smallest honest way out. */
    const refusal: { reason: { code: string; error: string } | null } = { reason: null };
    const row = {
      id: `svc_${crypto.randomUUID()}`,
      churchId: gate.church.id,
      spaceId: gate.space.id,
      serviceDate,
      // A space gathers at its own meetingTime; a per-row override is the
      // church plan's concern, so this stays null rather than accepting input.
      serviceTime: null,
      title,
      seriesId: null as string | null,
      reference: passage.reference,
      starterTemplateId,
      createdBy: auth.userId,
      updatedBy: null,
      createdAt: now,
      updatedAt: null,
    };

    try {
      await db.transaction(async (tx) => {
        // Scoped to this space: a seriesId from the church plan resolves to
        // SERIES_NOT_FOUND rather than pointing a Youth gathering at it.
        const series = await resolveSeriesForWrite({
          scope: { churchId: gate.church.id, spaceId: gate.space.id },
          seriesId: body.seriesId,
          seriesTitle: body.seriesTitle,
          userId: auth.userId,
          executor: tx,
        });
        if (!series.ok) {
          // Not an exception: rolling back by throwing would lose the reason.
          refusal.reason = { code: series.code, error: series.error };
          return;
        }
        seriesId = series.seriesId;
        row.seriesId = seriesId;
        await tx.insert(ChurchServices).values(row);
      });
      if (refusal.reason) {
        return c.json({ error: refusal.reason.error, code: refusal.reason.code }, 404);
      }
    } catch (error) {
      // The partial unique index is the real guard — catch the violation
      // rather than SELECT-then-INSERT into a race.
      if (isUniqueViolation(error, 'ChurchServices_space_date_unique')) {
        return c.json(
          {
            error: 'This ministry already has a gathering planned that day.',
            code: 'SERVICE_DATE_TAKEN',
          },
          409,
        );
      }
      throw error;
    }

    return c.json({
      success: true,
      service: serializeSpaceSermon(
        { ...row, seriesId } as ChurchServiceRow,
        await seriesTitlesByServiceRows([{ seriesId }]),
      ),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/services/create',
      action: 'create_church_space_service',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/spaces/:spaceId/services/update ───────────────────────
app.post('/api/church/spaces/:spaceId/services/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertCanManageSpaceTeachingPlan(auth.userId, c.req.param('spaceId') ?? '');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const body = (await c.req.json().catch(() => ({}))) as SpaceSermonInput;
    const serviceId = (body.serviceId ?? '').trim();
    if (!serviceId) return c.json({ error: 'serviceId is required', code: 'BAD_REQUEST' }, 400);

    /*
      Scoped to this space, not just the church: an id from the church plan (or
      another ministry's) reads as "not found" rather than being editable from
      the wrong door. This is also what makes `spaceId` immutable — there is no
      code path that can rewrite it.
    */
    const existing = first(
      await db
        .select()
        .from(ChurchServices)
        .where(and(eq(ChurchServices.id, serviceId), eq(ChurchServices.spaceId, gate.space.id)))
        .limit(1),
    );
    if (!existing) {
      return c.json({ error: 'Gathering not found', code: 'SERVICE_NOT_FOUND' }, 404);
    }

    const updates: Partial<ChurchServiceRow> = { updatedBy: auth.userId, updatedAt: new Date() };

    const parsedDate = parseServiceDateInput(body.serviceDate);
    if (!parsedDate.ok) {
      return c.json({ error: parsedDate.reason, code: 'BAD_REQUEST' }, 400);
    }
    if (parsedDate.kind === 'date') updates.serviceDate = parsedDate.value;
    /* Unscheduling — the board's drag back to Ideas. Nothing else to release
       here: a space plan has no slot assignments and no one-off times. */
    if (parsedDate.kind === 'backlog') updates.serviceDate = null;
    if (body.title !== undefined) {
      const title = clean(body.title, TITLE_MAX);
      if (!title) return c.json({ error: 'A title is required', code: 'BAD_REQUEST' }, 400);
      updates.title = title;
    }
    if (body.reference !== undefined) {
      const passage = canonicalizeServiceReference(body.reference);
      if (!passage.ok) return c.json({ error: passage.reason, code: 'INVALID_REFERENCE' }, 400);
      updates.reference = passage.reference;
    }
    if (body.starterTemplateId !== undefined) {
      const starterTemplateId = clean(body.starterTemplateId, 200);
      const starter = await validateStarter(gate.church.orgId, starterTemplateId);
      if (!starter.ok) return c.json({ error: starter.error, code: starter.code }, 400);
      updates.starterTemplateId = starterTemplateId;
    }

    const refusal: { reason: { code: string; error: string } | null } = { reason: null };
    try {
      await db.transaction(async (tx) => {
        // Inside the transaction so a date collision below rolls back any
        // series this named on the way in.
        if (body.seriesId !== undefined || body.seriesTitle !== undefined) {
          const series = await resolveSeriesForWrite({
            scope: { churchId: gate.church.id, spaceId: gate.space.id },
            seriesId: body.seriesId,
            seriesTitle: body.seriesTitle,
            userId: auth.userId,
            executor: tx,
          });
          if (!series.ok) {
            refusal.reason = { code: series.code, error: series.error };
            return;
          }
          updates.seriesId = series.seriesId;
        }
        await tx.update(ChurchServices).set(updates).where(eq(ChurchServices.id, serviceId));
      });
      if (refusal.reason) {
        return c.json({ error: refusal.reason.error, code: refusal.reason.code }, 404);
      }
    } catch (error) {
      if (isUniqueViolation(error, 'ChurchServices_space_date_unique')) {
        return c.json(
          {
            error: 'This ministry already has a gathering planned that day.',
            code: 'SERVICE_DATE_TAKEN',
          },
          409,
        );
      }
      throw error;
    }

    const merged = { ...existing, ...updates } as ChurchServiceRow;
    return c.json({
      success: true,
      service: serializeSpaceSermon(merged, await seriesTitlesByServiceRows([merged])),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/services/update',
      action: 'update_church_space_service',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/spaces/:spaceId/services/repeat ──────────────────────
/**
 * Repeat a gathering weekly — Youth's whole term entered once.
 *
 * The church plan's twin, minus slots. Simpler in exactly one way and harder in
 * another: there is nothing to claim, but the date rule here is a DB index
 * rather than a pre-check, so a collision surfaces as a caught violation.
 *
 * Same stopping rule: everything before the collision stays, and the response
 * names the week it stopped on. A term with an unnoticed hole in it is worse
 * than a short one.
 */
app.post('/api/church/spaces/:spaceId/services/repeat', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertCanManageSpaceTeachingPlan(auth.userId, c.req.param('spaceId') ?? '');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const body = (await c.req.json().catch(() => ({}))) as { serviceId?: string; weeks?: number };
    const serviceId = (body.serviceId ?? '').trim();
    if (!serviceId) return c.json({ error: 'serviceId is required', code: 'BAD_REQUEST' }, 400);

    // Scoped to this space, so a church-plan sermon cannot be repeated from here.
    const seed = first(
      await db
        .select()
        .from(ChurchServices)
        .where(and(eq(ChurchServices.id, serviceId), eq(ChurchServices.spaceId, gate.space.id)))
        .limit(1),
    );
    if (!seed) return c.json({ error: 'Gathering not found', code: 'SERVICE_NOT_FOUND' }, 404);
    /* Weekly repeats count forward from a date. An idea has none to count from. */
    if (seed.serviceDate === null) {
      return c.json(
        {
          error: 'Give this gathering a date first — repeat counts weeks from one.',
          code: 'BAD_REQUEST',
        },
        400,
      );
    }

    const dates = weeklyDatesAfter(seed.serviceDate, Number(body.weeks ?? 0));
    if (dates.length === 0) {
      return c.json(
        { error: `weeks must be between 1 and ${REPEAT_MAX_WEEKS}`, code: 'BAD_REQUEST' },
        400,
      );
    }

    const seriesTitles = await seriesTitlesByServiceRows([seed]);
    const title = repeatTitleFor({
      seedTitle: seed.title,
      seriesTitle: seed.seriesId ? seriesTitles.get(seed.seriesId) ?? null : null,
    });

    const created: ReturnType<typeof serializeSpaceSermon>[] = [];
    let stoppedAt: string | null = null;

    for (const serviceDate of dates) {
      const row = {
        id: `svc_${crypto.randomUUID()}`,
        churchId: gate.church.id,
        spaceId: gate.space.id,
        serviceDate,
        serviceTime: null,
        title,
        seriesId: seed.seriesId,
        // Next week is a different passage; guessing it would put words in the
        // leader's mouth.
        reference: null,
        starterTemplateId: seed.starterTemplateId,
        createdBy: auth.userId,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: null,
      };
      try {
        await db.insert(ChurchServices).values(row);
      } catch (error) {
        if (isUniqueViolation(error, 'ChurchServices_space_date_unique')) {
          stoppedAt = serviceDate;
          break;
        }
        throw error;
      }
      created.push(serializeSpaceSermon(row as ChurchServiceRow, seriesTitles));
    }

    return c.json({ success: true, services: created, stoppedAt });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/services/repeat',
      action: 'repeat_church_space_service',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/spaces/:spaceId/services/delete ───────────────────────
/**
 * A hard delete, matching the church plan: a plan entry is not study.
 * Congregants' notes are independent rows keeping their own
 * `startedFromServiceTitle` snapshot, so removing a gathering never takes
 * anyone's notes with it.
 */
app.post('/api/church/spaces/:spaceId/services/delete', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertCanManageSpaceTeachingPlan(auth.userId, c.req.param('spaceId') ?? '');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const body = (await c.req.json().catch(() => ({}))) as SpaceSermonInput;
    const serviceId = (body.serviceId ?? '').trim();
    if (!serviceId) return c.json({ error: 'serviceId is required', code: 'BAD_REQUEST' }, 400);

    const removed = await db
      .delete(ChurchServices)
      .where(and(eq(ChurchServices.id, serviceId), eq(ChurchServices.spaceId, gate.space.id)))
      .returning({ id: ChurchServices.id });

    if (removed.length === 0) {
      return c.json({ error: 'Gathering not found', code: 'SERVICE_NOT_FOUND' }, 404);
    }
    return c.json({ success: true, serviceId });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/services/delete',
      action: 'delete_church_space_service',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── Series ─────────────────────────────────────────────────────────────────
/**
 * The space's own series, under the space's own gate. Rename and delete only,
 * for the same reason as the church plan: a series is born by naming it on a
 * gathering.
 *
 * `assertCanManageSpaceTeachingPlan` is the widened OR — a granted volunteer
 * leader may rename Youth's series. That is exactly why `ChurchSeries` is
 * plan-scoped: the same person aimed at a church-plan series gets
 * SERIES_NOT_FOUND from `renameSeries`, not a 403 they could probe around.
 */
app.post('/api/church/spaces/:spaceId/series/rename', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertCanManageSpaceTeachingPlan(auth.userId, c.req.param('spaceId') ?? '');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const body = (await c.req.json().catch(() => ({}))) as { seriesId?: string; title?: string };
    const seriesId = (body.seriesId ?? '').trim();
    if (!seriesId) return c.json({ error: 'seriesId is required', code: 'BAD_REQUEST' }, 400);

    const result = await renameSeries(
      { churchId: gate.church.id, spaceId: gate.space.id },
      seriesId,
      String(body.title ?? ''),
    );
    if (!result.ok) {
      const status = result.code === 'BAD_REQUEST' ? 400 : result.code === 'SERIES_NOT_FOUND' ? 404 : 409;
      return c.json({ error: result.error, code: result.code }, status);
    }
    return c.json({ success: true, series: { id: result.series.id, title: result.series.title } });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/series/rename',
      action: 'rename_church_space_series',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** Detaches its gatherings; never deletes them. See `deleteSeries`. */
app.post('/api/church/spaces/:spaceId/series/delete', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertCanManageSpaceTeachingPlan(auth.userId, c.req.param('spaceId') ?? '');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const body = (await c.req.json().catch(() => ({}))) as { seriesId?: string };
    const seriesId = (body.seriesId ?? '').trim();
    if (!seriesId) return c.json({ error: 'seriesId is required', code: 'BAD_REQUEST' }, 400);

    const result = await deleteSeries({ churchId: gate.church.id, spaceId: gate.space.id }, seriesId);
    if (!result.ok) return c.json({ error: result.error, code: result.code }, 404);
    return c.json({ success: true, detached: result.detached });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/series/delete',
      action: 'delete_church_space_series',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
