/**
 * Staff-authored church teaching plan — the write half of "This Sunday".
 *
 * Kept out of `church.ts` on purpose. That file's contract test slices its
 * source by endpoint position to prove the congregant half never accepts an
 * `orgId` from the request; adding staff routes to it would either break that
 * arithmetic or weaken the assertion. Same split as `church.ts` (self-serve)
 * vs `churches.ts` (Harvous admin).
 *
 * Every write goes through `assertCanManageTeachingPlan`: staff membership, an
 * active + sponsored church, and the `manage_teaching_plan` capability derived
 * server-side from the Clerk org role. The staff read goes through
 * `assertCanViewTeachingPlan`, which asks only for `sermon_tools` and is never
 * sponsorship-gated — a teacher sees the plan they teach from, and a lapsed
 * church keeps looking at what it already planned.
 *
 * Endpoints:
 *   GET  /api/church/services/plan    — staff: the full plan, including past
 *   POST /api/church/services/create
 *   POST /api/church/services/update
 *   POST /api/church/services/repeat
 *   POST /api/church/services/delete
 *   POST /api/church/series/rename
 *   POST /api/church/series/delete
 */

import { Hono } from 'hono';
import {
  db,
  first,
  ChurchServices,
  NoteTemplates,
  Spaces,
  eq,
  and,
  asc,
  isNull,
} from '../db';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { isUniqueViolation } from '../utils/db-unique-violation';
import { isMinistryBroadcastSpaceRow } from '../utils/channel-publish-cadence';
import { canonicalizeServiceReference } from '../utils/church-service-passage';
import { normalizeServiceTime } from '../utils/church-service-time';
import {
  clearServiceTimeAssignments,
  filterServiceTimeIdsForChurch,
  listServiceTimesForChurch,
  replaceServiceTimeAssignments,
  serviceTimeIdsByService,
} from '../utils/church-service-times';
import {
  assertCanManageTeachingPlan,
  assertCanViewTeachingPlan,
  type ChurchServiceRow,
} from '../utils/church-teaching-plan';
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

/** ISO calendar day, the only shape `ChurchServices.serviceDate` accepts. */
const SERVICE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const TITLE_MAX = 120;

type SermonInput = {
  orgId?: string;
  serviceId?: string;
  serviceDate?: string;
  /** Which of the church's recurring services this sermon is preached at. */
  serviceTimeIds?: string[];
  /** A one-off time for a sermon that sits at none of the usual services. */
  serviceTime?: string | null;
  title?: string;
  /** An existing ChurchSeries in *this* plan — what the editor's picker sends. */
  seriesId?: string | null;
  /** A name instead: typing a new series creates the row. See church-series.ts. */
  seriesTitle?: string | null;
  reference?: string | null;
  starterTemplateId?: string | null;
};

function clean(value: string | null | undefined, max: number): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function serializeSermon(
  row: ChurchServiceRow,
  serviceTimeIds: string[] = [],
  seriesTitles?: Map<string, string>,
) {
  return {
    id: row.id,
    serviceDate: row.serviceDate,
    /** The church's slots this sermon fills; the editor renders them as checks. */
    serviceTimeIds,
    /** A one-off time, set only when the sermon sits at no usual service. */
    serviceTime: row.serviceTime,
    title: row.title,
    seriesId: row.seriesId,
    /*
      The joined label, not a stored copy — `seriesTitle` as a column is exactly
      the two-sources-of-truth bug ChurchSeries removed. Kept on the wire because
      every card and row renders the name, and a client that had only an id would
      have to hold the whole series list to draw one line.
    */
    seriesTitle: row.seriesId ? seriesTitles?.get(row.seriesId) ?? null : null,
    reference: row.reference,
    starterTemplateId: row.starterTemplateId,
    updatedAt: row.updatedAt ?? row.createdAt,
  };
}

/**
 * Validate the optional starter template against *this* church.
 *
 * A cross-church lever if unchecked: a template id from another org would leak
 * that church's starter into this congregation's notes.
 */
async function validateReferences(
  orgId: string,
  input: SermonInput,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const templateId = clean(input.starterTemplateId, 200);
  if (templateId) {
    const template = first(
      await db
        .select({ id: NoteTemplates.id })
        .from(NoteTemplates)
        .where(and(eq(NoteTemplates.id, templateId), eq(NoteTemplates.orgId, orgId)))
        .limit(1),
    );
    if (!template) {
      return { ok: false, code: 'TEMPLATE_NOT_FOUND', error: 'That starter template is not one of your church templates' };
    }
  }


  return { ok: true };
}

// ─── GET /api/church/services/plan ──────────────────────────────────────────
/**
 * The staff view: every service, past included, so a pastor can see the shape
 * of the quarter and backfill last Sunday. Ascending by date — the client
 * groups by series and splits upcoming from past.
 *
 * The *read* gate, deliberately: a teacher may look at the plan without
 * holding the capability to change it, and a lapsed church still sees its own.
 */
app.get('/api/church/services/plan', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = (c.req.query('orgId') ?? '').trim();

    const gate = await assertCanViewTeachingPlan(auth.userId, orgId);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const scope = { churchId: gate.church.id, spaceId: null };

    /*
      Two waves, not five serial queries. Only the assignments and the series
      titles need the sermon rows first; the church's slots and its series list
      are keyed on the church alone, so they ride alongside rather than queue
      behind. The plan pane was five round trips deep before this.
    */
    const [services, serviceTimes, series] = await Promise.all([
      db
        .select()
        .from(ChurchServices)
        // Church plan only. Space plans have their own endpoints; merging them
        // here would put Youth's Wednesday in the church's sermon list.
        .where(and(eq(ChurchServices.churchId, gate.church.id), isNull(ChurchServices.spaceId)))
        .orderBy(asc(ChurchServices.serviceDate)),
      listServiceTimesForChurch(gate.church.id),
      listSeriesForPlan(scope),
    ]);

    const [assignments, seriesTitles] = await Promise.all([
      serviceTimeIdsByService(services.map((row) => row.id)),
      seriesTitlesByServiceRows(services),
    ]);


    return c.json({
      church: { id: gate.church.id, name: gate.church.name },
      /*
        The church's recurring services — the checkboxes in the editor, and what
        seeds its date picker. Kept out of the `church` envelope so that object
        stays identical to the congregant payload's; a space plan will fill this
        same key from the space's own meeting times, with no rename.
      */
      serviceTimes: serviceTimes.map((row) => ({
        id: row.id,
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        label: row.label,
      })),
      services: services.map((row) =>
        serializeSermon(row, assignments.get(row.id) ?? [], seriesTitles),
      ),
      /*
        The church plan's own series, most recently *taught* first — what the
        editor's picker offers so weeks group without typo-splitting in two.
        Replaced a list of bare strings derived from the sermon rows: a picker of
        objects can rename, delete, and be attached to, and a string cannot.
      */
      series,
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/services/plan',
      action: 'church_teaching_plan',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/services/create ───────────────────────────────────────
app.post('/api/church/services/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as SermonInput;

    const gate = await assertCanManageTeachingPlan(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const serviceDate = (body.serviceDate ?? '').trim();
    if (!SERVICE_DATE_PATTERN.test(serviceDate)) {
      return c.json({ error: 'serviceDate must be YYYY-MM-DD', code: 'BAD_REQUEST' }, 400);
    }
    const title = clean(body.title, TITLE_MAX);
    if (!title) {
      return c.json({ error: 'A title is required', code: 'BAD_REQUEST' }, 400);
    }

    const time = normalizeServiceTime(body.serviceTime);
    if (!time.ok) return c.json({ error: time.reason, code: 'BAD_REQUEST' }, 400);
    const serviceTime = time.value;

    // Cross-church guard: a slot id from another church would put this sermon
    // on someone else's Sunday. Unknown ids are dropped, not errored — a stale
    // editor holding a since-deleted slot should still be able to save.
    const serviceTimeIds = await filterServiceTimeIdsForChurch(
      gate.church.id,
      Array.isArray(body.serviceTimeIds) ? body.serviceTimeIds : [],
    );

    const passage = canonicalizeServiceReference(body.reference);
    if (!passage.ok) {
      return c.json({ error: passage.reason, code: 'INVALID_REFERENCE' }, 400);
    }

    const refs = await validateReferences(gate.church.orgId, body);
    if (!refs.ok) return c.json({ error: refs.error, code: refs.code }, 400);

    /*
      Two sermons on one Sunday is now ordinary — morning series, evening
      series — so there is no date-level uniqueness left to enforce. What is
      still nonsense is *two timeless sermons* on one date: with no slots to
      tell them apart, neither the plan nor the card could say which is which.
      Sermons that do claim slots are guarded by the DB index below instead.
    */
    if (serviceTimeIds.length === 0) {
      const clash = first(
        await db
          .select({ id: ChurchServices.id })
          .from(ChurchServices)
          .where(
            and(
              eq(ChurchServices.churchId, gate.church.id),
              isNull(ChurchServices.spaceId),
              eq(ChurchServices.serviceDate, serviceDate),
              isNull(ChurchServices.serviceTime),
            ),
          )
          .limit(1),
      );
      if (clash) {
        return c.json(
          {
            error: 'That date already has a sermon. Edit it, or give this one a service time.',
            code: 'SERVICE_DATE_TAKEN',
            serviceId: clash.id,
          },
          409,
        );
      }
    }

    const now = new Date();
    /*
      Resolved inside the transaction below, so a rejected sermon takes any
      series it named down with it. Declared here because the row literal and
      the response both need it.
    */
    let seriesId: string | null = null;
    /* A holder, not a bare `let`: TS narrows a closure-assigned local to
       `never` at the check below, and this is the smallest honest way out. */
    const refusal: { reason: { code: string; error: string } | null } = { reason: null };
    const row = {
      id: `svc_${crypto.randomUUID()}`,
      churchId: gate.church.id,
      serviceDate,
      // Explicit, never omitted: this literal is what serializeSermon echoes
      // back, so an absent key would ship a create response whose shape differs
      // from every read.
      serviceTime,
      title,
      seriesId: null as string | null,
      reference: passage.reference,
      starterTemplateId: clean(body.starterTemplateId, 200),
      createdBy: auth.userId,
      updatedBy: null,
      createdAt: now,
      updatedAt: null,
    };

    try {
      // One transaction: a sermon that failed to claim its slots must not
      // survive half-created, since a timeless sermon means something else —
      // and neither must a series it named on the way in.
      await db.transaction(async (tx) => {
        const series = await resolveSeriesForWrite({
          scope: { churchId: gate.church.id, spaceId: null },
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
        await replaceServiceTimeAssignments(tx, { serviceId: row.id, serviceDate, serviceTimeIds });
      });
      if (refusal.reason) {
        return c.json({ error: refusal.reason.error, code: refusal.reason.code }, 404);
      }
    } catch (error) {
      // The unique index is the real guard for slot collisions — catch the
      // violation rather than SELECT-then-INSERT into a race.
      if (isUniqueViolation(error, 'ChurchServiceTimeAssignments_slot_date_unique')) {
        return c.json(
          {
            error: 'One of those services already has a sermon that day.',
            code: 'SERVICE_TIME_TAKEN',
          },
          409,
        );
      }
      throw error;
    }

    return c.json({
      success: true,
      service: serializeSermon(
        { ...row, seriesId } as ChurchServiceRow,
        serviceTimeIds,
        await seriesTitlesByServiceRows([{ seriesId }]),
      ),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/services/create',
      action: 'create_church_service',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/services/update ───────────────────────────────────────
app.post('/api/church/services/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as SermonInput;

    const gate = await assertCanManageTeachingPlan(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const serviceId = (body.serviceId ?? '').trim();
    if (!serviceId) {
      return c.json({ error: 'serviceId is required', code: 'BAD_REQUEST' }, 400);
    }

    // Scope the lookup to this church so an id from another church reads as
    // "not found" rather than confirming it exists.
    const existing = first(
      await db
        .select()
        .from(ChurchServices)
        .where(
          and(eq(ChurchServices.id, serviceId), eq(ChurchServices.churchId, gate.church.id)),
        )
        .limit(1),
    );
    if (!existing) {
      return c.json({ error: 'Service not found', code: 'SERVICE_NOT_FOUND' }, 404);
    }

    const updates: Partial<ChurchServiceRow> = { updatedBy: auth.userId, updatedAt: new Date() };

    if (body.serviceDate !== undefined) {
      const serviceDate = (body.serviceDate ?? '').trim();
      if (!SERVICE_DATE_PATTERN.test(serviceDate)) {
        return c.json({ error: 'serviceDate must be YYYY-MM-DD', code: 'BAD_REQUEST' }, 400);
      }
      updates.serviceDate = serviceDate;
    }

    if (body.serviceTime !== undefined) {
      const time = normalizeServiceTime(body.serviceTime);
      if (!time.ok) return c.json({ error: time.reason, code: 'BAD_REQUEST' }, 400);
      // An explicit null drops the one-off time; the sermon's slots then say when.
      updates.serviceTime = time.value;
    }

    /*
      Slots are replaced wholesale when the key is present, and left alone when
      it is absent — the same present/absent contract every other field here
      uses, so a partial update never silently unassigns a sermon.
    */
    const nextServiceTimeIds =
      body.serviceTimeIds === undefined
        ? null
        : await filterServiceTimeIdsForChurch(
            gate.church.id,
            Array.isArray(body.serviceTimeIds) ? body.serviceTimeIds : [],
          );
    const nextDate = updates.serviceDate ?? existing.serviceDate;

    if (body.title !== undefined) {
      const title = clean(body.title, TITLE_MAX);
      if (!title) return c.json({ error: 'A title is required', code: 'BAD_REQUEST' }, 400);
      updates.title = title;
    }

    if (body.reference !== undefined) {
      const passage = canonicalizeServiceReference(body.reference);
      if (!passage.ok) {
        return c.json({ error: passage.reason, code: 'INVALID_REFERENCE' }, 400);
      }
      updates.reference = passage.reference;
    }

    if (body.starterTemplateId !== undefined) {
      const refs = await validateReferences(gate.church.orgId, body);
      if (!refs.ok) return c.json({ error: refs.error, code: refs.code }, 400);
      updates.starterTemplateId = clean(body.starterTemplateId, 200);
    }

    /*
      One transaction covering the row and its slots. The date moving matters
      here beyond the row: `ChurchServiceTimeAssignments.serviceDate` mirrors it
      to power the one-sermon-per-slot-per-date index, so a sermon that shifts
      from Sunday to Monday must carry its assignments with it or the guarantee
      quietly stops applying.
    */
    const finalIds = nextServiceTimeIds ?? (await serviceTimeIdsByService([serviceId])).get(serviceId) ?? [];
    const refusal: { reason: { code: string; error: string } | null } = { reason: null };
    try {
      await db.transaction(async (tx) => {
        /*
          Either grain moves the sermon between series, and an explicit null on
          either detaches it. Absent keys leave it alone — the same present/
          absent contract every other field here uses. Inside the transaction so
          a slot collision below rolls back any series this named on the way in.
        */
        if (body.seriesId !== undefined || body.seriesTitle !== undefined) {
          const series = await resolveSeriesForWrite({
            scope: { churchId: gate.church.id, spaceId: null },
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
        if (nextServiceTimeIds !== null || updates.serviceDate !== undefined) {
          await replaceServiceTimeAssignments(tx, {
            serviceId,
            serviceDate: nextDate,
            serviceTimeIds: finalIds,
          });
        }
      });
      if (refusal.reason) {
        return c.json({ error: refusal.reason.error, code: refusal.reason.code }, 404);
      }
    } catch (error) {
      if (isUniqueViolation(error, 'ChurchServiceTimeAssignments_slot_date_unique')) {
        return c.json(
          {
            error: 'One of those services already has a sermon that day.',
            code: 'SERVICE_TIME_TAKEN',
          },
          409,
        );
      }
      throw error;
    }

    const merged = { ...existing, ...updates };
    return c.json({
      success: true,
      service: serializeSermon(merged, finalIds, await seriesTitlesByServiceRows([merged])),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/services/update',
      action: 'update_church_service',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/services/repeat ───────────────────────────────────────
/**
 * Repeat a sermon weekly — the eight-week series entered once.
 *
 * A server endpoint rather than a loop in the editor, for a reason that is not
 * tidiness: writes are rate-limited to 20 a minute, and a quarter is thirteen
 * of them. A client loop would spend most of a pastor's budget on one action
 * and fail halfway through the second series they planned.
 *
 * Generated rows inherit the seed's slots, series and starter — everything that
 * makes them the same series — and only the date moves. They are *not* copies
 * of its passage: each week has its own text, and pre-filling one would be a
 * claim about what the pastor is going to preach.
 *
 * **Stops at the first collision and says where.** Everything generated before
 * the stop stays: a short plan the pastor can see beats a complete-looking one
 * with a silent hole where a week was skipped.
 */
app.post('/api/church/services/repeat', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      serviceId?: string;
      weeks?: number;
    };

    const gate = await assertCanManageTeachingPlan(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const serviceId = (body.serviceId ?? '').trim();
    if (!serviceId) return c.json({ error: 'serviceId is required', code: 'BAD_REQUEST' }, 400);

    const seed = first(
      await db
        .select()
        .from(ChurchServices)
        .where(
          and(
            eq(ChurchServices.id, serviceId),
            eq(ChurchServices.churchId, gate.church.id),
            // Church plan only: a space's gathering repeats through its own
            // endpoint, where the rules about slots are different.
            isNull(ChurchServices.spaceId),
          ),
        )
        .limit(1),
    );
    if (!seed) return c.json({ error: 'Service not found', code: 'SERVICE_NOT_FOUND' }, 404);

    const dates = weeklyDatesAfter(seed.serviceDate, Number(body.weeks ?? 0));
    if (dates.length === 0) {
      return c.json(
        { error: `weeks must be between 1 and ${REPEAT_MAX_WEEKS}`, code: 'BAD_REQUEST' },
        400,
      );
    }

    const seedSlots = (await serviceTimeIdsByService([seed.id])).get(seed.id) ?? [];
    const seriesTitles = await seriesTitlesByServiceRows([seed]);
    const title = repeatTitleFor({
      seedTitle: seed.title,
      seriesTitle: seed.seriesId ? seriesTitles.get(seed.seriesId) ?? null : null,
    });

    const created: ReturnType<typeof serializeSermon>[] = [];
    let stoppedAt: string | null = null;

    for (const serviceDate of dates) {
      /*
        The same two guards the create route applies, in the same order: a
        timeless sermon can't share a date with another timeless one, and a
        slot claim is settled by the index. Re-checked per week rather than up
        front — thirteen inserts is thirteen chances for someone else to take
        a Sunday while this runs.
      */
      if (seedSlots.length === 0) {
        const clash = first(
          await db
            .select({ id: ChurchServices.id })
            .from(ChurchServices)
            .where(
              and(
                eq(ChurchServices.churchId, gate.church.id),
                isNull(ChurchServices.spaceId),
                eq(ChurchServices.serviceDate, serviceDate),
                isNull(ChurchServices.serviceTime),
              ),
            )
            .limit(1),
        );
        if (clash) {
          stoppedAt = serviceDate;
          break;
        }
      }

      const now = new Date();
      const row = {
        id: `svc_${crypto.randomUUID()}`,
        churchId: gate.church.id,
        serviceDate,
        serviceTime: seed.serviceTime,
        title,
        seriesId: seed.seriesId,
        // Deliberately not the seed's: next week is a different passage, and
        // guessing it would put words in the pastor's mouth.
        reference: null,
        starterTemplateId: seed.starterTemplateId,
        createdBy: auth.userId,
        updatedBy: null,
        createdAt: now,
        updatedAt: null,
      };

      try {
        await db.transaction(async (tx) => {
          await tx.insert(ChurchServices).values(row);
          await replaceServiceTimeAssignments(tx, {
            serviceId: row.id,
            serviceDate,
            serviceTimeIds: seedSlots,
          });
        });
      } catch (error) {
        if (isUniqueViolation(error, 'ChurchServiceTimeAssignments_slot_date_unique')) {
          stoppedAt = serviceDate;
          break;
        }
        throw error;
      }
      created.push(serializeSermon(row as ChurchServiceRow, seedSlots, seriesTitles));
    }

    return c.json({
      success: true,
      services: created,
      /** The week it ran into, or null if it planned the whole run. */
      stoppedAt,
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/services/repeat',
      action: 'repeat_church_service',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/services/delete ───────────────────────────────────────
/**
 * POST-with-body, matching /api/church/staff/remove.
 *
 * A hard delete, deliberately: a plan entry is not study. Congregants' notes
 * are independent rows and keep their own `startedFromServiceTitle` snapshot,
 * so removing a service never takes anyone's Sunday notes with it.
 */
app.post('/api/church/services/delete', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as SermonInput;

    const gate = await assertCanManageTeachingPlan(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const serviceId = (body.serviceId ?? '').trim();
    if (!serviceId) {
      return c.json({ error: 'serviceId is required', code: 'BAD_REQUEST' }, 400);
    }

    const existing = first(
      await db
        .select({ id: ChurchServices.id })
        .from(ChurchServices)
        .where(
          and(eq(ChurchServices.id, serviceId), eq(ChurchServices.churchId, gate.church.id)),
        )
        .limit(1),
    );
    if (!existing) {
      return c.json({ error: 'Service not found', code: 'SERVICE_NOT_FOUND' }, 404);
    }

    /*
      The slot claims go with it. Nothing enforces this for us — the ids here
      are plain text columns, with no foreign key to cascade — so a delete that
      touched only `ChurchServices` left `ChurchServiceTimeAssignments` rows
      pointing at a sermon that no longer exists. They still occupied their slot
      in the unique index, so that service time on that date was blocked
      forever, and nothing in the plan showed why. Found while building
      "repeat weekly", which stopped on a Sunday the plan showed as empty.
    */
    await db.transaction(async (tx) => {
      await clearServiceTimeAssignments(tx, serviceId);
      await tx.delete(ChurchServices).where(eq(ChurchServices.id, serviceId));
    });
    return c.json({ success: true });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/services/delete',
      action: 'delete_church_service',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── Series ─────────────────────────────────────────────────────────────────
/**
 * Rename and delete only. There is no create endpoint on purpose: a series
 * comes into being by naming it on a sermon, which is how a pastor actually
 * thinks about it. An empty series with nothing under it is a form to fill in,
 * not a plan.
 *
 * Both sit behind `assertCanManageTeachingPlan` — the plan's own gate, called
 * rather than copied, so the church series and the church sermons can never
 * drift apart on who may touch them.
 */
app.post('/api/church/series/rename', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      seriesId?: string;
      title?: string;
    };

    const gate = await assertCanManageTeachingPlan(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const seriesId = (body.seriesId ?? '').trim();
    if (!seriesId) return c.json({ error: 'seriesId is required', code: 'BAD_REQUEST' }, 400);

    const result = await renameSeries(
      { churchId: gate.church.id, spaceId: null },
      seriesId,
      String(body.title ?? ''),
    );
    if (!result.ok) {
      const status = result.code === 'BAD_REQUEST' ? 400 : result.code === 'SERIES_NOT_FOUND' ? 404 : 409;
      return c.json({ error: result.error, code: result.code }, status);
    }
    return c.json({
      success: true,
      series: { id: result.series.id, title: result.series.title },
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/series/rename',
      action: 'rename_church_series',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** Detaches its sermons; never deletes them. See `deleteSeries`. */
app.post('/api/church/series/delete', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as { orgId?: string; seriesId?: string };

    const gate = await assertCanManageTeachingPlan(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const seriesId = (body.seriesId ?? '').trim();
    if (!seriesId) return c.json({ error: 'seriesId is required', code: 'BAD_REQUEST' }, 400);

    const result = await deleteSeries({ churchId: gate.church.id, spaceId: null }, seriesId);
    if (!result.ok) return c.json({ error: result.error, code: result.code }, 404);
    return c.json({ success: true, detached: result.detached });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/series/delete',
      action: 'delete_church_series',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
