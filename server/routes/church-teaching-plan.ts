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
 *   POST /api/church/services/link-note
 *   POST /api/church/series/create
 *   POST /api/church/series/rerun
 *   POST /api/church/series/update
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
  ne,
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
  linkNoteToService,
  parseServiceDateInput,
  resolveViewerPlannedNotes,
  type ChurchServiceRow,
} from '../utils/church-teaching-plan';
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

type SermonInput = {
  orgId?: string;
  serviceId?: string;
  /** Explicit `null` files this as an undated backlog idea — see parseServiceDateInput. */
  serviceDate?: string | null;
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
    /* Backlog order. `updatedAt` cannot stand in for it: editing an idea
       would reshuffle the Ideas column under the pastor's cursor. */
    createdAt: row.createdAt,
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
      Two waves, not six serial queries. Only the assignments, the series titles
      and the attachments need the sermon rows first; the church's slots and its
      series list are keyed on the church alone, so they ride alongside rather
      than queue behind.
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

    const serviceIds = services.map((row) => row.id);
    const [assignments, seriesTitles, attachments, viewerDrafts] = await Promise.all([
      serviceTimeIdsByService(serviceIds),
      seriesTitlesByServiceRows(services),
      /* Staff-gated read, so the resources a week draws on ride along rather
         than costing a request per row when the editor opens. */
      attachmentsByServiceIds(serviceIds),
      /* The viewer's OWN sermon drafts, and only ever theirs — see
         resolveViewerPlannedNotes. This is what turns "Write this sermon" into
         "Open my draft" on a week they have already started. */
      resolveViewerPlannedNotes(auth.userId, serviceIds),
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
      services: services.map((row) => ({
        ...serializeSermon(row, assignments.get(row.id) ?? [], seriesTitles),
        resources: attachments.get(row.id) ?? [],
        /* Null for every week this viewer has not started, including ones a
           colleague has. Never a count, never a name — see the helper. */
        viewerDraftNoteId: viewerDrafts.get(row.id)?.noteId ?? null,
        /* The note's own title, so the editor can name the linked note without
           a second fetch — the picker's 30-row window may not contain it. */
        viewerDraftNoteTitle: viewerDrafts.get(row.id)?.title ?? null,
      })),
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

    const parsedDate = parseServiceDateInput(body.serviceDate);
    if (!parsedDate.ok) {
      return c.json({ error: parsedDate.reason, code: 'BAD_REQUEST' }, 400);
    }
    if (parsedDate.kind === 'absent') {
      return c.json({ error: 'serviceDate must be YYYY-MM-DD', code: 'BAD_REQUEST' }, 400);
    }
    const serviceDate = parsedDate.kind === 'date' ? parsedDate.value : null;
    const title = clean(body.title, TITLE_MAX);
    if (!title) {
      return c.json({ error: 'A title is required', code: 'BAD_REQUEST' }, 400);
    }

    const time = normalizeServiceTime(body.serviceTime);
    if (!time.ok) return c.json({ error: time.reason, code: 'BAD_REQUEST' }, 400);
    /*
      An undated idea keeps neither kind of time. Both a slot claim and a
      one-off clock reading describe a moment on a date this row does not have
      — and the assignments table mirrors `serviceDate` into a NOT NULL column,
      so there is nothing to write there either. Stripped rather than refused:
      the drag that unschedules a sermon shouldn't have to clear its times
      first, and there is no ambiguity about what the user meant.
    */
    const serviceTime = serviceDate === null ? null : time.value;

    // Cross-church guard: a slot id from another church would put this sermon
    // on someone else's Sunday. Unknown ids are dropped, not errored — a stale
    // editor holding a since-deleted slot should still be able to save.
    const serviceTimeIds = serviceDate === null
      ? []
      : await filterServiceTimeIdsForChurch(
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
    if (serviceDate !== null && serviceTimeIds.length === 0) {
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
      /* The church's own plan is always gatherings — stated rather than
         left to the column default, so the intent survives a schema edit. */
      kind: 'gathering' as const,
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
        /* No date, no assignments — the table's own serviceDate is NOT NULL. */
        if (serviceDate !== null) {
          await replaceServiceTimeAssignments(tx, { serviceId: row.id, serviceDate, serviceTimeIds });
        }
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

    const parsedDate = parseServiceDateInput(body.serviceDate);
    if (!parsedDate.ok) {
      return c.json({ error: parsedDate.reason, code: 'BAD_REQUEST' }, 400);
    }
    if (parsedDate.kind === 'date') updates.serviceDate = parsedDate.value;
    /* Unscheduling — the board's drag back to Ideas. */
    if (parsedDate.kind === 'backlog') updates.serviceDate = null;
    const unscheduling = parsedDate.kind === 'backlog';

    if (body.serviceTime !== undefined) {
      const time = normalizeServiceTime(body.serviceTime);
      if (!time.ok) return c.json({ error: time.reason, code: 'BAD_REQUEST' }, 400);
      // An explicit null drops the one-off time; the sermon's slots then say when.
      updates.serviceTime = time.value;
    }
    /* A date is what a time is relative to. Losing one loses the other, whatever
       the payload said — the same strip create does. */
    if (unscheduling) updates.serviceTime = null;

    /*
      Slots are replaced wholesale when the key is present, and left alone when
      it is absent — the same present/absent contract every other field here
      uses, so a partial update never silently unassigns a sermon.
    */
    const nextServiceTimeIds = unscheduling
      ? []
      : body.serviceTimeIds === undefined
        ? null
        : await filterServiceTimeIdsForChurch(
            gate.church.id,
            Array.isArray(body.serviceTimeIds) ? body.serviceTimeIds : [],
          );
    const nextDate = updates.serviceDate !== undefined ? updates.serviceDate : existing.serviceDate;

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

    /*
      The same "two timeless sermons on one date" nonsense create refuses, now
      that a date can arrive by update too. It could not happen before the
      planner board: the editor only ever moved a sermon you were already
      looking at, so a collision was visible on screen. Dragging a card onto an
      occupied Sunday is not, and a silent double-booking there is worse than a
      refusal the board can revert. Only when this sermon ends up timeless —
      slot-claiming sermons are still caught by the DB index below.
    */
    const finalServiceTime =
      updates.serviceTime !== undefined ? updates.serviceTime : existing.serviceTime;
    if (nextDate !== null && finalIds.length === 0 && finalServiceTime === null) {
      const clash = first(
        await db
          .select({ id: ChurchServices.id })
          .from(ChurchServices)
          .where(
            and(
              eq(ChurchServices.churchId, gate.church.id),
              isNull(ChurchServices.spaceId),
              eq(ChurchServices.serviceDate, nextDate),
              isNull(ChurchServices.serviceTime),
              ne(ChurchServices.id, serviceId),
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
        if (nextDate === null) {
          /* Unscheduled: release the slots outright rather than re-writing them
             against a date this row no longer has. Holding them would keep those
             Sundays blocked for a sermon that is back to being an idea. */
          await clearServiceTimeAssignments(tx, serviceId);
        } else if (nextServiceTimeIds !== null || updates.serviceDate !== undefined) {
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

// ─── POST /api/church/services/attachments/set ──────────────────────────────
/**
 * The resources a sermon draws on. Replace-set: the editor holds the whole list.
 */
app.post('/api/church/services/attachments/set', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      serviceId?: string;
      itemIds?: unknown;
    };

    const gate = await assertCanManageTeachingPlan(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const serviceId = (body.serviceId ?? '').trim();
    if (!serviceId) return c.json({ error: 'serviceId is required', code: 'BAD_REQUEST' }, 400);

    const itemIds = Array.isArray(body.itemIds)
      ? body.itemIds.map((id) => String(id).trim()).filter(Boolean)
      : [];

    const result = await setServiceAttachments({
      serviceId,
      itemIds,
      churchId: gate.church.id,
      spaceId: null,
      userId: auth.userId,
    });
    if (!result.ok) return c.json({ error: result.error, code: result.code }, result.status);

    const attached = await attachmentsByServiceIds([serviceId]);
    return c.json({ success: true, resources: attached.get(serviceId) ?? [] });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/services/attachments/set',
      action: 'church_service_attachments',
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
    /* Weekly repeats count forward from a date. An idea has none to count from. */
    if (seed.serviceDate === null) {
      return c.json(
        {
          error: 'Give this sermon a date first — repeat counts weeks from one.',
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
        kind: seed.kind,
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

// ─── The staff sermon draft ─────────────────────────────────────────────────
/**
 * POST /api/church/services/link-note — point one of your own notes at a week,
 * or (with `noteId` and a null `serviceId`) let it go.
 *
 * **One endpoint serves both directions of the bridge.** "Write this sermon"
 * creates a note the ordinary way and then links it; "Add to the teaching plan"
 * creates a service through `/services/create` — with all of its date parsing,
 * slot filtering, collision guards and series resolution — and then links it.
 * A bespoke `create-from-note` would have had to restate every one of those
 * rules, and the second copy is where they would drift.
 *
 * The two-call shape means a create can land and its link fail. That leaves a
 * plan row the pastor can see and retry from — not a corrupt state — which is
 * a better trade than a duplicated validator.
 *
 * Two gates, both required and neither sufficient: `assertCanManageTeachingPlan`
 * for the plan side, and `linkNoteToService`'s own `userId` scope for the note
 * side. Staff may not stamp a colleague's note, and an author may not stamp a
 * plan they cannot manage.
 */
app.post('/api/church/services/link-note', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      noteId?: string;
      /** Explicit null unlinks. An absent key is a bad request, not an unlink. */
      serviceId?: string | null;
    };

    const gate = await assertCanManageTeachingPlan(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const noteId = (body.noteId ?? '').trim();
    if (!noteId) return c.json({ error: 'noteId is required', code: 'BAD_REQUEST' }, 400);
    if (!('serviceId' in body)) {
      return c.json({ error: 'serviceId is required', code: 'BAD_REQUEST' }, 400);
    }

    const serviceId = (body.serviceId ?? '').trim() || null;
    if (serviceId) {
      /* The row must be in *this church's own* plan. Without the scope check a
         staffer could aim their note at a ministry's row, or another church's,
         and the planner would then offer to open a draft from a plan that has
         no idea it exists. */
      const service = first(
        await db
          .select({ id: ChurchServices.id })
          .from(ChurchServices)
          .where(
            and(
              eq(ChurchServices.id, serviceId),
              eq(ChurchServices.churchId, gate.church.id),
              isNull(ChurchServices.spaceId),
            ),
          )
          .limit(1),
      );
      if (!service) {
        return c.json({ error: 'That sermon is not in this plan', code: 'NOT_FOUND' }, 404);
      }
    }

    /* 404 rather than 403 on someone else's note: a stranger must not learn
       that a note id exists. */
    const linked = await linkNoteToService(auth.userId, noteId, serviceId);
    if (!linked) return c.json({ error: 'Note not found', code: 'NOT_FOUND' }, 404);

    return c.json({ success: true, noteId, serviceId });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/services/link-note',
      action: 'link_sermon_draft',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── Series ─────────────────────────────────────────────────────────────────
/**
 * POST /api/church/series/create — name a series before any week exists.
 *
 * The plan deliberately had no create path: a series was born by naming it on a
 * sermon, and an empty one was "a form to fill in, not a plan". That is still
 * true of the *accidental* empty series, which is why `findOrCreateSeries`
 * remains the combobox's path — but it withheld a real intention, which is
 * "we are doing eight weeks in Romans this autumn" decided before week one.
 *
 * `firstDate` is optional and makes the difference between the two readings:
 * with one, this creates the series *and* its opening week, so the pastor lands
 * on something they can extend; without one, it creates the row alone, which
 * every read path already renders.
 */
app.post('/api/church/series/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      title?: string;
      color?: string | null;
      description?: string | null;
      runLabel?: string | null;
      /** Optional opening week. Omit for a series with no sermons yet. */
      firstDate?: string | null;
    };

    const gate = await assertCanManageTeachingPlan(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const scope = { churchId: gate.church.id, spaceId: null };
    const parsedDate = parseServiceDateInput(body.firstDate ?? null);
    if (!parsedDate.ok) return c.json({ error: parsedDate.reason, code: 'BAD_REQUEST' }, 400);
    const firstDate = parsedDate.kind === 'date' ? parsedDate.value : null;

    const created = await createSeries(
      scope,
      {
        title: String(body.title ?? ''),
        color: body.color ?? null,
        description: body.description ?? null,
        runLabel: body.runLabel ?? null,
      },
      auth.userId,
    );
    if (!created.ok) {
      return c.json(
        { error: created.error, code: created.code },
        created.code === 'SERIES_TITLE_TAKEN' ? 409 : 400,
      );
    }

    /*
      The opening week, named after the series — the same honest substitute
      `repeat` uses, since `title` is NOT NULL and a pastor overwrites it first
      thing. No passage: "next week is a different text" applies just as much to
      the first one, and pre-filling it would put words in their mouth.
    */
    let serviceId: string | null = null;
    if (firstDate) {
      const row = first(
        await db
          .insert(ChurchServices)
          .values({
            id: `svc_${crypto.randomUUID()}`,
            churchId: gate.church.id,
            spaceId: null,
            serviceDate: firstDate,
            serviceTime: null,
            title: created.series.title,
            seriesId: created.series.id,
            reference: null,
            starterTemplateId: null,
            kind: 'gathering' as const,
            createdBy: auth.userId,
            updatedBy: null,
            createdAt: new Date(),
            updatedAt: null,
          })
          .returning(),
      );
      serviceId = row?.id ?? null;
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
      endpoint: '/api/church/series/create',
      action: 'create_church_series',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * POST /api/church/series/rerun — teach a finished series again.
 *
 * The seasonal case: a church runs Advent every year, and last year's outline
 * is the best starting point it has. Deliberately the opposite of `repeat`,
 * which refuses to copy a passage because *there* the next week is a different
 * text. Both stances are right for their own job; see church-series-rerun.ts.
 *
 * Server-side for the reason `repeat` is: writes are capped at 20 a minute and
 * a quarter is thirteen of them.
 *
 * Labels **both** runs. The source's `runLabel` is null until a second run
 * exists — which is exactly the moment the ambiguity comes into being, and so
 * the moment to resolve it. Otherwise the plan would read "Advent" beside
 * "Advent 2027", which is worse than either.
 */
app.post('/api/church/series/rerun', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      sourceSeriesId?: string;
      startDate?: string;
      runLabel?: string;
      copy?: Partial<RerunCopyFlags>;
    };

    const gate = await assertCanManageTeachingPlan(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const scope = { churchId: gate.church.id, spaceId: null };
    const sourceId = (body.sourceSeriesId ?? '').trim();
    if (!sourceId) return c.json({ error: 'sourceSeriesId is required', code: 'BAD_REQUEST' }, 400);

    const parsedStart = parseServiceDateInput(body.startDate ?? null);
    if (!parsedStart.ok || parsedStart.kind !== 'date') {
      return c.json({ error: 'startDate must be YYYY-MM-DD', code: 'BAD_REQUEST' }, 400);
    }

    const source = await getSeriesWithServices(scope, sourceId);
    if (!source) return c.json({ error: 'That series is not in this plan', code: 'SERIES_NOT_FOUND' }, 404);

    const dates = rerunDatesFor(source.services.map((s) => s.serviceDate), parsedStart.value);
    if (!dates) {
      return c.json(
        { error: 'That series has no dated weeks to copy', code: 'NOTHING_TO_COPY' },
        400,
      );
    }

    const copy = { ...DEFAULT_RERUN_COPY, ...(body.copy ?? {}) };
    /* Derived from the new run's own start rather than typed, so two runs of
       one name are always told apart by when they happened. */
    const newLabel = (body.runLabel ?? '').trim() || runLabelForDate(parsedStart.value);

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

    // Label the source too, now that it has a sibling.
    if (!source.series.runLabel) {
      const sourceLabel = runLabelForDate(
        source.services.map((s) => s.serviceDate).filter(Boolean).sort()[0] ?? null,
      );
      if (sourceLabel && sourceLabel !== newLabel) {
        await updateSeries(scope, source.series.id, { runLabel: sourceLabel });
      }
    }

    const rows = buildRerunRows({
      source: source.services,
      dates,
      seriesId: created.series.id,
      seriesTitle: created.series.title,
      churchId: gate.church.id,
      spaceId: null,
      copy,
      userId: auth.userId,
      now: new Date(),
    });

    /*
      Inserted one at a time so a slot collision stops the run at the date it
      happened rather than failing the whole copy — the same contract `repeat`
      settled on, because a plan with a hole the pastor did not notice is worse
      than a short one they can see.
    */
    const slotsBySource = await serviceTimeIdsByService(source.services.map((s) => s.id));
    const sortedSource = source.services
      .filter((s) => s.serviceDate)
      .sort((a, b) => String(a.serviceDate).localeCompare(String(b.serviceDate)));
    let createdCount = 0;
    let stoppedAt: string | null = null;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      try {
        await db.transaction(async (tx) => {
          await tx.insert(ChurchServices).values(row);
          const slots = copy.titles ? (slotsBySource.get(sortedSource[i]!.id) ?? []) : [];
          const usable = await filterServiceTimeIdsForChurch(gate.church.id, slots);
          if (usable.length > 0 && row.serviceDate) {
            await replaceServiceTimeAssignments(tx, {
              serviceId: row.id!,
              serviceDate: row.serviceDate,
              serviceTimeIds: usable,
            });
          }
        });
        createdCount += 1;
      } catch (error) {
        /* Named, not any-unique: the collision worth stopping on is a service
           slot already claimed on that date. Swallowing every unique violation
           here would hide a genuine bug as a short run. */
        if (isUniqueViolation(error, 'ChurchServiceTimeAssignments_slot_date_unique')) {
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
      endpoint: '/api/church/series/rerun',
      action: 'rerun_church_series',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * Update and delete only. There is no create endpoint on purpose: a series
 * comes into being by naming it on a sermon, which is how a pastor actually
 * thinks about it. An empty series with nothing under it is a form to fill in,
 * not a plan.
 *
 * Both sit behind `assertCanManageTeachingPlan` — the plan's own gate, called
 * rather than copied, so the church series and the church sermons can never
 * drift apart on who may touch them.
 *
 * This was `/series/rename` and replaced it outright rather than gaining a
 * sibling — one writer per row, the same clean-break discipline the schema
 * takes. Every field is optional: an absent key means "leave it", so setting a
 * colour never has to resend a title and race someone else's rename.
 */
app.post('/api/church/series/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      seriesId?: string;
      title?: string;
      color?: string | null;
      description?: string | null;
    };

    const gate = await assertCanManageTeachingPlan(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const seriesId = (body.seriesId ?? '').trim();
    if (!seriesId) return c.json({ error: 'seriesId is required', code: 'BAD_REQUEST' }, 400);

    const result = await updateSeries({ churchId: gate.church.id, spaceId: null }, seriesId, {
      // `in` rather than `!== undefined` on the raw body, so an explicit
      // `null` reaches the helper as "clear it" instead of "leave it".
      ...('title' in body ? { title: String(body.title ?? '') } : {}),
      ...('color' in body ? { color: body.color ?? null } : {}),
      ...('description' in body ? { description: body.description ?? null } : {}),
    });
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
      endpoint: '/api/church/series/update',
      action: 'update_church_series',
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
