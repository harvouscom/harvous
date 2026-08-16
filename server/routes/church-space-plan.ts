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
 *   GET  /api/church/spaces/:spaceId/coming-up   (members, not staff)
 *   POST /api/church/spaces/:spaceId/services/create
 *   POST /api/church/spaces/:spaceId/services/update
 *   POST /api/church/spaces/:spaceId/services/repeat
 *   POST /api/church/spaces/:spaceId/services/delete
 *   POST /api/church/spaces/:spaceId/services/link-note
 *   POST /api/church/spaces/:spaceId/series/create
 *   POST /api/church/spaces/:spaceId/series/rerun
 *   POST /api/church/spaces/:spaceId/series/update
 *   POST /api/church/spaces/:spaceId/series/delete
 *   POST /api/church/spaces/:spaceId/series/publish-thread
 */

import { Hono } from 'hono';
import {
  db,
  first,
  ChurchSeries,
  ChurchServices,
  NoteTemplates,
  SpaceMemberships,
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
} from '../db';
import { broadcastInvalidation } from '../utils/realtime';
import { requireSpaceAccess } from '../utils/space-access';
import { canManageSpaceThreadStructure } from '../utils/thread-sequence';
import { publishSeriesAsStudyPlan } from '../utils/church-series-publish';
import { resolveViewerServiceNotes } from '../utils/church-teaching-plan';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { isUniqueViolation } from '../utils/db-unique-violation';
import { canonicalizeServiceReference } from '../utils/church-service-passage';
import {
  linkNoteToService,
  resolveViewerPlannedNotes,
} from '../utils/church-teaching-plan';
import {
  assertCanManageSpaceTeachingPlan,
  assertCanViewSpaceTeachingPlan,
  type SpacePlanGateResult,
} from '../utils/church-space-plan';
import { parseServiceDateInput, type ChurchServiceRow } from '../utils/church-teaching-plan';
import { isMinistryBroadcastSpaceRow } from '../utils/channel-publish-cadence';
import {
  attachmentsByServiceIds,
  setServiceAttachments,
} from '../utils/church-service-attachments';
import {
  REPEAT_MAX_WEEKS,
  repeatTitleFor,
  weeklyDatesAfter,
} from '../utils/church-sermon-repeat';
import {
  createSeries,
  deleteSeries,
  nextFreeRunLabel,
  getSeriesWithServices,
  listSeriesForPlan,
  updateSeries,
  resolveSeriesForWrite,
  seriesTitlesByServiceRows,
} from '../utils/church-series';
import {
  DEFAULT_RERUN_COPY,
  buildRerunRows,
  rerunDatesFor,
  runLabelForDate,
  type RerunCopyFlags,
} from '../utils/church-series-rerun';

const app = new Hono();

const TITLE_MAX = 120;

/**
 * How long a gathering stays on screen after it happened — the room is still
 * writing up Wednesday on Thursday. Matches the church card's own grace.
 */
const SPACE_GATHERING_GRACE_DAYS = 4;
/** A couple of months of plan is plenty for a card that shows one gathering. */
const SPACE_GATHERING_WINDOW = 8;

/**
 * What this plan's rows are: a channel publishes, every other space gathers.
 *
 * Derived from the space, never from the request — a client that could name its
 * own kind could file a row as content and escape the one-per-date index that
 * makes a gathering schedule mean anything.
 */
type PlanKind = 'gathering' | 'content';

function planKindForSpace(space: { type: string | null; orgId: string | null }): PlanKind {
  return isMinistryBroadcastSpaceRow(space) ? 'content' : 'gathering';
}

/** "Gathering" is a lie for a channel; "entry" is honest for both. */
function notFoundError(kind: PlanKind): string {
  return kind === 'content' ? 'Entry not found' : 'Gathering not found';
}

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
    /** 'gathering' | 'content' — see the schema docblock. */
    kind: row.kind,
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

/**
 * A starter must belong to the plan that names it.
 *
 * Church lane: this church's org templates, same guard as the church plan.
 * Space lane: templates scoped to *this room* — deliberately not the planner's
 * personal ones. A starter is handed to everyone who takes notes on that
 * gathering, and a private template's name would travel with it.
 */
async function validateStarter(
  gate: Extract<SpacePlanGateResult, { ok: true }>,
  starterTemplateId: string | null,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  if (!starterTemplateId) return { ok: true };
  const owner =
    gate.lane === 'church' && gate.church
      ? eq(NoteTemplates.orgId, gate.church.orgId)
      : eq(NoteTemplates.spaceId, gate.space.id);
  const template = first(
    await db
      .select({ id: NoteTemplates.id })
      .from(NoteTemplates)
      .where(and(eq(NoteTemplates.id, starterTemplateId), owner))
      .limit(1),
  );
  if (!template) {
    return {
      ok: false,
      code: 'TEMPLATE_NOT_FOUND',
      error:
        gate.lane === 'church'
          ? 'That starter template is not one of your church templates'
          : 'That starter template is not one of this space’s templates',
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

    const scope = { churchId: (gate.church?.id ?? null), spaceId: gate.space.id };

    // The series list is keyed on the scope, not on the rows — see the church
    // plan's twin. Only the joined titles have to wait for the sermons.
    const [services, series] = await Promise.all([
      db
        .select()
        .from(ChurchServices)
        .where(eq(ChurchServices.spaceId, gate.space.id))
        .orderBy(asc(ChurchServices.serviceDate)),
      listSeriesForPlan(scope),
    ]);

    const serviceIds = services.map((row) => row.id);
    const seriesTitles = await seriesTitlesByServiceRows(services);
    const attachments = await attachmentsByServiceIds(serviceIds);
    /* The viewer's OWN drafts, never anyone else's — same rule and same helper
       as the church plan. A granted volunteer leader reaches this endpoint, so
       "only ever theirs" matters here more, not less. */
    const viewerDrafts = await resolveViewerPlannedNotes(auth.userId, serviceIds);

    /*
      Whether this reader may also write. The church lane has always answered
      this client-side from church capabilities, but the space lane has no
      capabilities to read — the answer lives in the room's membership role, so
      the server has to say. One extra gate call rather than shipping the role
      and re-deriving the rule in the client.
    */
    const manage = await assertCanManageSpaceTeachingPlan(auth.userId, gate.space.id);

    return c.json({
      church: gate.church ? { id: gate.church.id, name: gate.church.name } : null,
      viewer: { canManage: manage.ok },
      /*
        What this plan plans. Sent once at the top rather than left for the
        client to infer from the space's type — the server already decides it
        on every write, and two derivations of one fact drift.
      */
      planKind: planKindForSpace(gate.space),
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
      services: services.map((row) => ({
        ...serializeSpaceSermon(row, seriesTitles),
        resources: attachments.get(row.id) ?? [],
        viewerDraftNoteId: viewerDrafts.get(row.id)?.noteId ?? null,
        /* The note's own title, so the editor can name the linked note without
           a second fetch — the picker's 30-row window may not contain it. */
        viewerDraftNoteTitle: viewerDrafts.get(row.id)?.title ?? null,
      })),
      // Per-plan vocabulary: Youth's series and the church's stay separate — the
      // scope is what keeps a volunteer leader out of the main service's rows.
      series,
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
    const starter = await validateStarter(gate, starterTemplateId);
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
      churchId: (gate.church?.id ?? null),
      spaceId: gate.space.id,
      serviceDate,
      // A space gathers at its own meetingTime; a per-row override is the
      // church plan's concern, so this stays null rather than accepting input.
      serviceTime: null,
      title,
      seriesId: null as string | null,
      reference: passage.reference,
      starterTemplateId,
      /* From the space, never the body — see planKindForSpace. */
      kind: planKindForSpace(gate.space),
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
          scope: { churchId: (gate.church?.id ?? null), spaceId: gate.space.id },
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
            /* Only reachable for gatherings — the unique index no longer
               covers content, because a channel publishing twice in a day is
               ordinary rather than a mistake. */
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
      return c.json({ error: notFoundError(planKindForSpace(gate.space)), code: 'SERVICE_NOT_FOUND' }, 404);
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
      const starter = await validateStarter(gate, starterTemplateId);
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
            scope: { churchId: (gate.church?.id ?? null), spaceId: gate.space.id },
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
            /* Only reachable for gatherings — the unique index no longer
               covers content, because a channel publishing twice in a day is
               ordinary rather than a mistake. */
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

// ─── POST /api/church/spaces/:spaceId/services/attachments/set ─────────────
/**
 * Resources for one entry on a space plan.
 *
 * Rides the plan's own manage gate, so a granted volunteer leader may attach
 * to their room's entries — they are usually the person who found the material.
 */
app.post(
  '/api/church/spaces/:spaceId/services/attachments/set',
  requireAuth,
  rateLimit('write'),
  async (c) => {
    try {
      const auth = getAuthenticatedAuth(c);
      const gate = await assertCanManageSpaceTeachingPlan(auth.userId, c.req.param('spaceId') ?? '');
      if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

      const body = (await c.req.json().catch(() => ({}))) as {
        serviceId?: string;
        itemIds?: unknown;
      };
      const serviceId = (body.serviceId ?? '').trim();
      if (!serviceId) return c.json({ error: 'serviceId is required', code: 'BAD_REQUEST' }, 400);

      const itemIds = Array.isArray(body.itemIds)
        ? body.itemIds.map((id) => String(id).trim()).filter(Boolean)
        : [];

      const result = await setServiceAttachments({
        serviceId,
        itemIds,
        churchId: (gate.church?.id ?? null),
        spaceId: gate.space.id,
        userId: auth.userId,
      });
      if (!result.ok) return c.json({ error: result.error, code: result.code }, result.status);

      const attached = await attachmentsByServiceIds([serviceId]);
      return c.json({ success: true, resources: attached.get(serviceId) ?? [] });
    } catch (error) {
      const standardError = handleAPIError(error, {
        endpoint: '/api/church/spaces/[spaceId]/services/attachments/set',
        action: 'space_service_attachments',
      });
      return c.json({ error: standardError.message, code: standardError.code }, 500);
    }
  },
);

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
    if (!seed) return c.json({ error: notFoundError(planKindForSpace(gate.space)), code: 'SERVICE_NOT_FOUND' }, 404);
    /* Weekly repeats count forward from a date. An idea has none to count from. */
    if (seed.serviceDate === null) {
      return c.json(
        {
          error:
            planKindForSpace(gate.space) === 'content'
              ? 'Give this a date first — repeat counts weeks from one.'
              : 'Give this gathering a date first — repeat counts weeks from one.',
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
        churchId: (gate.church?.id ?? null),
        spaceId: gate.space.id,
        serviceDate,
        serviceTime: null,
        title,
        seriesId: seed.seriesId,
        // Next week is a different passage; guessing it would put words in the
        // leader's mouth.
        reference: null,
        starterTemplateId: seed.starterTemplateId,
        /* Inherits the seed's kind by inheriting the space's — a repeat cannot
           change what sort of thing it is repeating. */
        kind: seed.kind,
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
      return c.json({ error: notFoundError(planKindForSpace(gate.space)), code: 'SERVICE_NOT_FOUND' }, 404);
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

// ─── The staff sermon draft ─────────────────────────────────────────────────
/**
 * The space mirror of `/api/church/services/link-note`, under the space plan's
 * own gate — so a granted volunteer leader may write a draft for the ministry
 * they run without holding any church capability.
 *
 * The row must be in *this space's* plan, which is what stops a leader aiming
 * their note at the main service's Sunday.
 */
app.post('/api/church/spaces/:spaceId/services/link-note', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertCanManageSpaceTeachingPlan(auth.userId, c.req.param('spaceId') ?? '');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const body = (await c.req.json().catch(() => ({}))) as {
      noteId?: string;
      serviceId?: string | null;
    };
    const noteId = (body.noteId ?? '').trim();
    if (!noteId) return c.json({ error: 'noteId is required', code: 'BAD_REQUEST' }, 400);
    if (!('serviceId' in body)) {
      return c.json({ error: 'serviceId is required', code: 'BAD_REQUEST' }, 400);
    }

    const serviceId = (body.serviceId ?? '').trim() || null;
    if (serviceId) {
      const service = first(
        await db
          .select({ id: ChurchServices.id })
          .from(ChurchServices)
          .where(
            and(eq(ChurchServices.id, serviceId), eq(ChurchServices.spaceId, gate.space.id)),
          )
          .limit(1),
      );
      if (!service) {
        return c.json({ error: 'That entry is not in this plan', code: 'NOT_FOUND' }, 404);
      }
    }

    const linked = await linkNoteToService(auth.userId, noteId, serviceId);
    if (!linked) return c.json({ error: 'Note not found', code: 'NOT_FOUND' }, 404);

    return c.json({ success: true, noteId, serviceId });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/services/link-note',
      action: 'link_space_sermon_draft',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── Series ─────────────────────────────────────────────────────────────────
/**
 * The space's own series create + re-run, under the space plan's gate — so a
 * granted volunteer leader can plan their ministry's seasons without holding
 * any church capability.
 *
 * Simpler than the church's mirror in one way that matters: a space gathers
 * once, at its own `meetingTime`, so there are no service-time slots to copy
 * and no slot collision to stop on. What can collide is
 * `ChurchServices_space_date_unique` — one gathering per date — and the re-run
 * stops at the first of those for the same reason the church one does.
 */
app.post('/api/church/spaces/:spaceId/series/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertCanManageSpaceTeachingPlan(auth.userId, c.req.param('spaceId') ?? '');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const body = (await c.req.json().catch(() => ({}))) as {
      title?: string;
      color?: string | null;
      description?: string | null;
      firstDate?: string | null;
    };
    const scope = { churchId: (gate.church?.id ?? null), spaceId: gate.space.id };
    const parsedDate = parseServiceDateInput(body.firstDate ?? null);
    if (!parsedDate.ok) return c.json({ error: parsedDate.reason, code: 'BAD_REQUEST' }, 400);
    const firstDate = parsedDate.kind === 'date' ? parsedDate.value : null;

    const created = await createSeries(
      scope,
      {
        title: String(body.title ?? ''),
        color: body.color ?? null,
        description: body.description ?? null,
      },
      auth.userId,
    );
    if (!created.ok) {
      return c.json(
        { error: created.error, code: created.code },
        created.code === 'SERIES_TITLE_TAKEN' ? 409 : 400,
      );
    }

    let serviceId: string | null = null;
    if (firstDate) {
      try {
        const row = first(
          await db
            .insert(ChurchServices)
            .values({
              id: `svc_${crypto.randomUUID()}`,
              churchId: (gate.church?.id ?? null),
              spaceId: gate.space.id,
              serviceDate: firstDate,
              serviceTime: null,
              title: created.series.title,
              seriesId: created.series.id,
              reference: null,
              starterTemplateId: null,
              kind: planKindForSpace(gate.space),
              createdBy: auth.userId,
              updatedBy: null,
              createdAt: new Date(),
              updatedAt: null,
            })
            .returning(),
        );
        serviceId = row?.id ?? null;
      } catch (error) {
        if (!isUniqueViolation(error, 'ChurchServices_space_date_unique')) throw error;
        /* The series is real and the date was taken — say so rather than
           rolling back a series the pastor did ask for. */
        return c.json({
          success: true,
          series: {
            id: created.series.id,
            title: created.series.title,
            color: created.series.color,
            description: created.series.description,
            runLabel: created.series.runLabel,
          },
          serviceId: null,
          dateTaken: firstDate,
        });
      }
    }

    return c.json({
      success: true,
      series: {
        id: created.series.id,
        title: created.series.title,
        color: created.series.color,
        description: created.series.description,
        runLabel: created.series.runLabel,
      },
      serviceId,
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/series/create',
      action: 'create_church_space_series',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

app.post('/api/church/spaces/:spaceId/series/rerun', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertCanManageSpaceTeachingPlan(auth.userId, c.req.param('spaceId') ?? '');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const body = (await c.req.json().catch(() => ({}))) as {
      sourceSeriesId?: string;
      startDate?: string;
      runLabel?: string;
      copy?: Partial<RerunCopyFlags>;
    };
    const scope = { churchId: (gate.church?.id ?? null), spaceId: gate.space.id };
    const sourceId = (body.sourceSeriesId ?? '').trim();
    if (!sourceId) return c.json({ error: 'sourceSeriesId is required', code: 'BAD_REQUEST' }, 400);

    const parsedStart = parseServiceDateInput(body.startDate ?? null);
    if (!parsedStart.ok || parsedStart.kind !== 'date') {
      return c.json({ error: 'startDate must be YYYY-MM-DD', code: 'BAD_REQUEST' }, 400);
    }

    const source = await getSeriesWithServices(scope, sourceId);
    if (!source) {
      return c.json({ error: 'That series is not in this plan', code: 'SERIES_NOT_FOUND' }, 404);
    }

    const dates = rerunDatesFor(source.services.map((s) => s.serviceDate), parsedStart.value);
    if (!dates) {
      return c.json({ error: 'That series has no dated weeks to copy', code: 'NOTHING_TO_COPY' }, 400);
    }

    const copy = { ...DEFAULT_RERUN_COPY, ...(body.copy ?? {}) };
    /*
      Label the source FIRST, then find a free label for the new run.

      Order is load-bearing and the reverse of it is a real bug: computing the
      new label against an unlabelled source lets both want "2026", and the
      source's update then violates the uniqueness index — 500ing the route
      after the new series row already exists, leaving a run with no weeks in
      it. Claiming the source's label first means `nextFreeRunLabel` can see it
      and steps to "2026 (2)".
    */
    if (!source.series.runLabel) {
      const sourceLabel = runLabelForDate(
        source.services.map((s) => s.serviceDate).filter(Boolean).sort()[0] ?? null,
      );
      if (sourceLabel) {
        const labelled = await updateSeries(scope, source.series.id, { runLabel: sourceLabel });
        /* If that name is somehow taken, leave the source bare rather than
           failing the whole re-run — an unlabelled source is cosmetic, a lost
           copy is not. */
        if (!labelled.ok) {
          // eslint-disable-next-line no-console
          console.warn('[series/rerun] could not label the source run:', labelled.code);
        }
      }
    }

    const desiredLabel =
      (body.runLabel ?? '').trim() || runLabelForDate(parsedStart.value) || 'Run';
    /* The year is a preference. Two runs starting in the same year need more
       than a year to tell them apart. */
    const newLabel = await nextFreeRunLabel(scope, source.series.title, desiredLabel);

    const created = await createSeries(
      scope,
      {
        title: source.series.title,
        color: source.series.color,
        description: source.series.description,
        runLabel: newLabel,
      },
      auth.userId,
    );
    if (!created.ok) {
      return c.json(
        { error: created.error, code: created.code },
        created.code === 'SERIES_TITLE_TAKEN' ? 409 : 400,
      );
    }


    const rows = buildRerunRows({
      source: source.services,
      dates,
      seriesId: created.series.id,
      seriesTitle: created.series.title,
      churchId: (gate.church?.id ?? null),
      spaceId: gate.space.id,
      copy,
      userId: auth.userId,
      now: new Date(),
    });

    let createdCount = 0;
    let stoppedAt: string | null = null;
    for (const row of rows) {
      try {
        await db.insert(ChurchServices).values({ ...row, kind: planKindForSpace(gate.space) });
        createdCount += 1;
      } catch (error) {
        if (isUniqueViolation(error, 'ChurchServices_space_date_unique')) {
          stoppedAt = row.serviceDate ?? null;
          break;
        }
        throw error;
      }
    }

    return c.json({
      success: true,
      series: { id: created.series.id, title: created.series.title, runLabel: created.series.runLabel },
      created: createdCount,
      stoppedAt,
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/series/rerun',
      action: 'rerun_church_space_series',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * The space's own series, under the space's own gate. Update and delete only,
 * for the same reason as the church plan: a series is born by naming it on a
 * gathering.
 *
 * `assertCanManageSpaceTeachingPlan` is the widened OR — a granted volunteer
 * leader may recolour and rename Youth's series. That is exactly why
 * `ChurchSeries` is plan-scoped: the same person aimed at a church-plan series
 * gets SERIES_NOT_FOUND from `updateSeries`, not a 403 they could probe around.
 */
app.post('/api/church/spaces/:spaceId/series/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gate = await assertCanManageSpaceTeachingPlan(auth.userId, c.req.param('spaceId') ?? '');
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const body = (await c.req.json().catch(() => ({}))) as {
      seriesId?: string;
      title?: string;
      color?: string | null;
      description?: string | null;
    };
    const seriesId = (body.seriesId ?? '').trim();
    if (!seriesId) return c.json({ error: 'seriesId is required', code: 'BAD_REQUEST' }, 400);

    const result = await updateSeries(
      { churchId: (gate.church?.id ?? null), spaceId: gate.space.id },
      seriesId,
      {
        // `in` rather than `!== undefined`, so an explicit null clears rather
        // than being read as "leave it". Same shape as the church plan's.
        ...('title' in body ? { title: String(body.title ?? '') } : {}),
        ...('color' in body ? { color: body.color ?? null } : {}),
        ...('description' in body ? { description: body.description ?? null } : {}),
      },
    );
    if (!result.ok) {
      const status = result.code === 'BAD_REQUEST' ? 400 : result.code === 'SERIES_NOT_FOUND' ? 404 : 409;
      return c.json({ error: result.error, code: result.code }, status);
    }
    return c.json({
      success: true,
      series: {
        id: result.series.id,
        title: result.series.title,
        color: result.series.color,
        description: result.series.description,
      },
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/series/update',
      action: 'update_church_space_series',
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

    const result = await deleteSeries({ churchId: (gate.church?.id ?? null), spaceId: gate.space.id }, seriesId);
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

/**
 * Publish a series into its own space as a sequence Thread — the study plan a
 * room walks week by week.
 *
 * Two gates, both required and neither sufficient. The plan gate says the actor
 * may author this ministry's teaching; the Thread gate says they may author
 * this space's Thread structure. They are genuinely different questions — a
 * granted volunteer leader passes the first through the grant arm — and
 * publishing does both jobs at once.
 *
 * Scope is deliberately narrow in v1: a space-plan series publishes into the
 * space that planned it, with no target picker. Cross-plan publishing means
 * deciding what a church-plan series copied into a room even is, and the series
 * docblock is clear that cross-plan reuse is a copy — its own feature.
 */
app.post(
  '/api/church/spaces/:spaceId/series/publish-thread',
  requireAuth,
  rateLimit('write'),
  async (c) => {
    try {
      const auth = getAuthenticatedAuth(c);
      const spaceId = c.req.param('spaceId') ?? '';
      const gate = await assertCanManageSpaceTeachingPlan(auth.userId, spaceId);
      if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

      /*
       * Channels used to be refused here, as read-only during the pilot — "there is no plan
       * for a room the congregation cannot write in". A channel is exactly the room this
       * should work in: a study plan is staff-authored and congregation-walked, so the fact
       * that followers cannot compose is the reason it fits rather than a reason to refuse.
       * Publishing stays staff-only through `assertCanManageSpaceTeachingPlan` above, and
       * `canAuthorInSpace` keeps `member` read-only inside the space itself.
       */

      let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
      try {
        access = await requireSpaceAccess(gate.space.id, auth.userId);
      } catch {
        return c.json({
          error: 'You are not a member of this space',
          code: 'SPACE_MEMBERSHIP_REQUIRED',
        }, 403);
      }
      /*
        A granted volunteer leader can plan a room they hold no membership in.
        Publishing writes a Thread and notes *into* the space, so it needs the
        membership too — say which of the two is missing rather than 403ing
        with the plan gate's wording, which would read as "you can't plan this".
      */
      if (!canManageSpaceThreadStructure(access.space, access.role, auth.userId)) {
        return c.json({
          error: 'Only the space owner or a leader can publish a study plan here',
          code: 'SPACE_THREAD_ROLE_REQUIRED',
        }, 403);
      }

      const body = (await c.req.json().catch(() => ({}))) as { seriesId?: string };
      const seriesId = (body.seriesId ?? '').trim();
      if (!seriesId) return c.json({ error: 'seriesId is required', code: 'BAD_REQUEST' }, 400);

      const series = first(
        await db
          .select({
            id: ChurchSeries.id,
            title: ChurchSeries.title,
            color: ChurchSeries.color,
            spaceId: ChurchSeries.spaceId,
            churchId: ChurchSeries.churchId,
            publishedThreadId: ChurchSeries.publishedThreadId,
          })
          .from(ChurchSeries)
          .where(eq(ChurchSeries.id, seriesId))
          .limit(1),
      );
      /* Scope is proven against the gate's own church and space, never the
         caller's word for either. */
      if (!series || series.churchId !== (gate.church?.id ?? null)) {
        return c.json({ error: 'Series not found', code: 'SERIES_NOT_FOUND' }, 404);
      }
      if (series.spaceId !== gate.space.id) {
        return c.json({
          error: "A church-wide series cannot be published into one room's plan",
          code: 'CHURCH_PLAN_PUBLISH_UNSUPPORTED',
        }, 409);
      }

      const result = await publishSeriesAsStudyPlan({
        series: {
          id: series.id,
          title: series.title,
          color: series.color,
          publishedThreadId: series.publishedThreadId,
        },
        spaceId: gate.space.id,
        actorId: auth.userId,
      });

      const recipients = await db
        .select({ userId: SpaceMemberships.userId })
        .from(SpaceMemberships)
        .where(eq(SpaceMemberships.spaceId, gate.space.id));
      for (const recipientId of new Set(recipients.map((row) => row.userId))) {
        broadcastInvalidation(recipientId, { type: 'space:updated', id: gate.space.id });
      }

      return c.json({ success: true, ...result });
    } catch (error) {
      const standardError = handleAPIError(error, {
        endpoint: '/api/church/spaces/[spaceId]/series/publish-thread',
        action: 'publish_church_space_series_thread',
      });
      return c.json({ error: standardError.message, code: standardError.code }, 500);
    }
  },
);

/**
 * The room's own next gathering, for the people who gather in it.
 *
 * The plan endpoint above is staff-gated: it hands back the whole schedule,
 * every week's resources, and the scaffolding for editing them. A member needs
 * one thing — what are we on this week, and let me write about it — so this is
 * a separate, narrower read gated on **membership of the space**, not on
 * `sermon_tools`.
 *
 * Deliberately one gathering and never a list: "one next gathering per context
 * you joined, never a schedule of any context"
 * (docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md §1). This is the
 * per-space half of the same doctrine the This Sunday card follows.
 *
 * `viewerNoteId` is the caller's OWN note and nobody else's — the same rule
 * `resolveViewerServiceNotes` is held to everywhere it is used. A room must
 * never learn who else has written this week.
 */
app.get('/api/church/spaces/:spaceId/coming-up', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceId = c.req.param('spaceId') ?? '';

    let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
    try {
      access = await requireSpaceAccess(spaceId, auth.userId);
    } catch {
      /* Not a member — indistinguishable from "no such room", on purpose. */
      return c.json({ gathering: null });
    }

    /*
      A channel has nothing to come up to: its entries are unpublished staff
      intentions, and announcing one as a gathering would promise something the
      church has not said. Same refusal the client made, moved server-side so
      the payload cannot carry it at all.
    */
    if (isMinistryBroadcastSpaceRow(access.space)) return c.json({ gathering: null });

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - (SPACE_GATHERING_GRACE_DAYS + 1));
    const from = cutoff.toISOString().slice(0, 10);

    const rows = await db
      .select()
      .from(ChurchServices)
      .where(
        and(
          eq(ChurchServices.spaceId, spaceId),
          isNotNull(ChurchServices.serviceDate),
          gte(ChurchServices.serviceDate, from),
        ),
      )
      .orderBy(asc(ChurchServices.serviceDate))
      .limit(SPACE_GATHERING_WINDOW);

    if (rows.length === 0) return c.json({ gathering: null });

    const seriesTitles = await seriesTitlesByServiceRows(rows);
    const viewerNotes = await resolveViewerServiceNotes(
      auth.userId,
      rows.map((row) => row.id),
    );

    const templateIds = [
      ...new Set(rows.map((r) => r.starterTemplateId).filter((id): id is string => Boolean(id))),
    ];
    const templates = templateIds.length
      ? await db.select().from(NoteTemplates).where(inArray(NoteTemplates.id, templateIds))
      : [];
    const templateById = new Map(templates.map((t) => [t.id, t]));

    return c.json({
      space: {
        id: access.space.id,
        title: access.space.title,
        meetingDay: access.space.meetingDay ?? null,
        meetingTime: access.space.meetingTime ?? null,
      },
      /*
        The window, not one row: which of these is "next" depends on the
        viewer's own day, and the client already owns that judgement in
        `currentSermonFor` — including the grace window that keeps Wednesday
        on screen through Thursday.
      */
      services: rows.map((row) => {
        const template = row.starterTemplateId ? templateById.get(row.starterTemplateId) : undefined;
        return {
          id: row.id,
          serviceDate: row.serviceDate,
          serviceTime: row.serviceTime,
          times: row.serviceTime ? [row.serviceTime] : [],
          title: row.title,
          reference: row.reference,
          seriesTitle: row.seriesId ? seriesTitles.get(row.seriesId) ?? null : null,
          viewerNoteId: viewerNotes.get(row.id) ?? null,
          starter: template
            ? {
                templateId: template.id,
                templateName: template.name,
                content: template.content,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/spaces/[spaceId]/coming-up',
      action: 'read_space_coming_up',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
