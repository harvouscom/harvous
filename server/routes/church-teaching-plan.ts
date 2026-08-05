/**
 * Staff-authored church teaching plan — the write half of "This Sunday".
 *
 * Kept out of `church.ts` on purpose. That file's contract test slices its
 * source by endpoint position to prove the congregant half never accepts an
 * `orgId` from the request; adding staff routes to it would either break that
 * arithmetic or weaken the assertion. Same split as `church.ts` (self-serve)
 * vs `churches.ts` (Harvous admin).
 *
 * Every write goes through `assertCanManageTeachingPlan`, which requires staff
 * membership, an active + sponsored church, and the `sermon_tools` capability
 * derived server-side from the Clerk org role. This is the first feature behind
 * that capability.
 *
 * Endpoints:
 *   GET  /api/church/services/plan    — staff: the full plan, including past
 *   POST /api/church/services/create
 *   POST /api/church/services/update
 *   POST /api/church/services/delete
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
import { isMinistryBroadcastSpaceRow } from '../utils/channel-publish-cadence';
import { canonicalizeServiceReference } from '../utils/church-service-passage';
import {
  assertCanManageTeachingPlan,
  deriveSeriesTitles,
  type ChurchServiceRow,
} from '../utils/church-teaching-plan';

const app = new Hono();

/** ISO calendar day, the only shape `ChurchServices.serviceDate` accepts. */
const SERVICE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const TITLE_MAX = 120;
const SERIES_MAX = 120;

type ServiceInput = {
  orgId?: string;
  serviceId?: string;
  serviceDate?: string;
  title?: string;
  seriesTitle?: string | null;
  reference?: string | null;
  starterTemplateId?: string | null;
  channelSpaceId?: string | null;
};

function clean(value: string | null | undefined, max: number): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function serializeService(row: ChurchServiceRow) {
  return {
    id: row.id,
    serviceDate: row.serviceDate,
    title: row.title,
    seriesTitle: row.seriesTitle,
    reference: row.reference,
    starterTemplateId: row.starterTemplateId,
    channelSpaceId: row.channelSpaceId,
    updatedAt: row.updatedAt ?? row.createdAt,
  };
}

/**
 * Validate the optional foreign keys against *this* church.
 *
 * Both are cross-church levers if unchecked: a template id from another org
 * would leak that church's starter into this congregation's notes, and a
 * channel id would point the plan at a space these staff can't see.
 */
async function validateReferences(
  orgId: string,
  input: ServiceInput,
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

  const channelSpaceId = clean(input.channelSpaceId, 200);
  if (channelSpaceId) {
    const space = first(
      await db
        .select()
        .from(Spaces)
        .where(and(eq(Spaces.id, channelSpaceId), isNull(Spaces.deletedAt)))
        .limit(1),
    );
    if (!space || space.orgId !== orgId || !isMinistryBroadcastSpaceRow(space)) {
      return { ok: false, code: 'CHANNEL_NOT_FOUND', error: 'That ministry channel was not found' };
    }
  }

  return { ok: true };
}

// ─── GET /api/church/services/plan ──────────────────────────────────────────
/**
 * The staff view: every service, past included, so a pastor can see the shape
 * of the quarter and backfill last Sunday. Ascending by date — the client
 * groups by series and splits upcoming from past.
 */
app.get('/api/church/services/plan', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = (c.req.query('orgId') ?? '').trim();

    const gate = await assertCanManageTeachingPlan(auth.userId, orgId);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const services = await db
      .select()
      .from(ChurchServices)
      .where(eq(ChurchServices.churchId, gate.church.id))
      .orderBy(asc(ChurchServices.serviceDate));

    /*
      The church's own ministry channels, for the editor's companion-channel
      picker. Scoped to `gate.church.orgId` rather than the caller's
      `connectedOrgId`: a staff member can be looking at a church they help lead
      that isn't their home church, and `useChurchChannels` would answer for the
      wrong one.
    */
    const channelRows = await db
      .select({
        id: Spaces.id,
        title: Spaces.title,
        color: Spaces.color,
        type: Spaces.type,
        orgId: Spaces.orgId,
      })
      .from(Spaces)
      .where(and(eq(Spaces.orgId, gate.church.orgId), isNull(Spaces.deletedAt)))
      .orderBy(asc(Spaces.title));

    return c.json({
      church: { id: gate.church.id, name: gate.church.name },
      services: services.map(serializeService),
      // Distinct series the church has used, most recent first — powers the
      // editor's series picker so weeks group without typo-splitting in two.
      seriesTitles: deriveSeriesTitles(services),
      channels: channelRows
        .filter(isMinistryBroadcastSpaceRow)
        .map((row) => ({ id: row.id, title: row.title, color: row.color ?? null })),
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
    const body = (await c.req.json().catch(() => ({}))) as ServiceInput;

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

    const passage = canonicalizeServiceReference(body.reference);
    if (!passage.ok) {
      return c.json({ error: passage.reason, code: 'INVALID_REFERENCE' }, 400);
    }

    const refs = await validateReferences(gate.church.orgId, body);
    if (!refs.ok) return c.json({ error: refs.error, code: refs.code }, 400);

    // One service per church per date is a DB constraint, not a race-prone
    // pre-check — catch the violation rather than SELECT-then-INSERT.
    const existing = first(
      await db
        .select({ id: ChurchServices.id })
        .from(ChurchServices)
        .where(
          and(
            eq(ChurchServices.churchId, gate.church.id),
            eq(ChurchServices.serviceDate, serviceDate),
          ),
        )
        .limit(1),
    );
    if (existing) {
      return c.json(
        {
          error: 'That date already has a service. Edit the existing one instead.',
          code: 'SERVICE_DATE_TAKEN',
          serviceId: existing.id,
        },
        409,
      );
    }

    const now = new Date();
    const row = {
      id: `svc_${crypto.randomUUID()}`,
      churchId: gate.church.id,
      serviceDate,
      title,
      seriesTitle: clean(body.seriesTitle, SERIES_MAX),
      reference: passage.reference,
      starterTemplateId: clean(body.starterTemplateId, 200),
      channelSpaceId: clean(body.channelSpaceId, 200),
      createdBy: auth.userId,
      updatedBy: null,
      createdAt: now,
      updatedAt: null,
    };

    try {
      await db.insert(ChurchServices).values(row);
    } catch (error) {
      // The unique index is the real guard; the check above is just a friendlier
      // path for the common case.
      if (String(error).includes('ChurchServices_church_date_unique')) {
        return c.json(
          { error: 'That date already has a service.', code: 'SERVICE_DATE_TAKEN' },
          409,
        );
      }
      throw error;
    }

    return c.json({ success: true, service: serializeService(row as ChurchServiceRow) });
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
    const body = (await c.req.json().catch(() => ({}))) as ServiceInput;

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
      if (serviceDate !== existing.serviceDate) {
        const clash = first(
          await db
            .select({ id: ChurchServices.id })
            .from(ChurchServices)
            .where(
              and(
                eq(ChurchServices.churchId, gate.church.id),
                eq(ChurchServices.serviceDate, serviceDate),
              ),
            )
            .limit(1),
        );
        if (clash) {
          return c.json(
            { error: 'That date already has a service.', code: 'SERVICE_DATE_TAKEN', serviceId: clash.id },
            409,
          );
        }
      }
      updates.serviceDate = serviceDate;
    }

    if (body.title !== undefined) {
      const title = clean(body.title, TITLE_MAX);
      if (!title) return c.json({ error: 'A title is required', code: 'BAD_REQUEST' }, 400);
      updates.title = title;
    }
    if (body.seriesTitle !== undefined) updates.seriesTitle = clean(body.seriesTitle, SERIES_MAX);

    if (body.reference !== undefined) {
      const passage = canonicalizeServiceReference(body.reference);
      if (!passage.ok) {
        return c.json({ error: passage.reason, code: 'INVALID_REFERENCE' }, 400);
      }
      updates.reference = passage.reference;
    }

    if (body.starterTemplateId !== undefined || body.channelSpaceId !== undefined) {
      const refs = await validateReferences(gate.church.orgId, body);
      if (!refs.ok) return c.json({ error: refs.error, code: refs.code }, 400);
      if (body.starterTemplateId !== undefined) {
        updates.starterTemplateId = clean(body.starterTemplateId, 200);
      }
      if (body.channelSpaceId !== undefined) {
        updates.channelSpaceId = clean(body.channelSpaceId, 200);
      }
    }

    await db.update(ChurchServices).set(updates).where(eq(ChurchServices.id, serviceId));

    return c.json({ success: true, service: serializeService({ ...existing, ...updates }) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/services/update',
      action: 'update_church_service',
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
    const body = (await c.req.json().catch(() => ({}))) as ServiceInput;

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

    await db.delete(ChurchServices).where(eq(ChurchServices.id, serviceId));
    return c.json({ success: true });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/services/delete',
      action: 'delete_church_service',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
