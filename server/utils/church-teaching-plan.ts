/**
 * The church teaching plan — gate + data helpers for ChurchServices.
 *
 * A "service" is one row on the church's wall calendar: date, title, passage,
 * optional series. Staff author it; congregants see only the next one, as the
 * "This Sunday" card on Home.
 *
 * Privacy line, load-bearing: `resolveViewerServiceNotes` is the *only* reader
 * of `Notes.startedFromServiceId`, and it is always scoped to a single
 * `userId` — the viewer's own. Nothing here aggregates, counts, or groups by
 * service. A church must never learn who took notes. See
 * docs/future/PASTOR_FEATURES_ROADMAP.md ("Review is never shared").
 */
import {
  db,
  first,
  ChurchServices,
  Notes,
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  asc,
} from '../db';
import {
  resolveChurchOrgAccess,
  type ChurchOrgAccessResult,
  type ChurchOrgAccessRule,
} from './church-org-access';

export type ChurchServiceRow = typeof ChurchServices.$inferSelect;

/** ISO calendar day, the only shape `ChurchServices.serviceDate` accepts. */
const SERVICE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads the `serviceDate` field of a write payload.
 *
 * Three cases, and the difference between the first two is the whole point:
 * an explicit `null` means "this is a backlog idea, no date yet", while an
 * absent key means the caller forgot — on create that stays a 400, so a stale
 * client that omits the field lands loudly instead of quietly filing every
 * sermon under Unscheduled. On update, absent means "leave the date alone".
 *
 * Shared by all four write routes (church plan and space plan, create and
 * update) because the three-way distinction has to be identical in each; four
 * hand-rolled copies is exactly how one of them ends up treating '' as null.
 */
export function parseServiceDateInput(
  value: string | null | undefined,
): { ok: true; kind: 'absent' } | { ok: true; kind: 'date'; value: string } | { ok: true; kind: 'backlog' } | { ok: false; reason: string } {
  if (value === undefined) return { ok: true, kind: 'absent' };
  if (value === null) return { ok: true, kind: 'backlog' };
  const trimmed = String(value).trim();
  if (!SERVICE_DATE_PATTERN.test(trimmed)) {
    return { ok: false, reason: 'serviceDate must be YYYY-MM-DD' };
  }
  return { ok: true, kind: 'date', value: trimmed };
}

export type TeachingPlanGateResult = ChurchOrgAccessResult;

/**
 * Reading the plan, or reshaping it. The gate order is identical either way —
 * only the capability, the denial code, and whether sponsorship applies differ
 * — so the ordering lives once in `church-org-access.ts` and these two exports
 * name what they permit.
 */
type TeachingPlanAccess = 'view' | 'manage';

const TEACHING_PLAN_ACCESS: Record<TeachingPlanAccess, ChurchOrgAccessRule> = {
  view: {
    capability: 'sermon_tools',
    code: 'SERMON_TOOLS_REQUIRED',
    staffError: 'Only church staff can see the teaching plan',
    roleError: 'Your role does not include the teaching plan',
    // Reading the plan is never sponsorship-gated — a lapsed church must never
    // take its congregation's Sunday away, and its staff must still be able to
    // look at what they already planned.
    sponsorshipGated: false,
  },
  manage: {
    capability: 'manage_teaching_plan',
    code: 'TEACHING_PLAN_ROLE_REQUIRED',
    staffError: 'Only church staff can manage the teaching plan',
    roleError: 'A pastor or admin plans the services here',
    sponsorshipGated: true,
  },
};

/**
 * The staff *read*. Gated on `sermon_tools` — a teacher sees the plan they
 * teach from. Never sponsorship-gated.
 */
export function assertCanViewTeachingPlan(
  userId: string,
  orgId: string,
): Promise<TeachingPlanGateResult> {
  return resolveChurchOrgAccess(userId, orgId, TEACHING_PLAN_ACCESS.view);
}

/**
 * The staff *write*. Gated on `manage_teaching_plan`, narrower than
 * `sermon_tools`: a teacher reads the plan without reshaping what the whole
 * church teaches.
 */
export function assertCanManageTeachingPlan(
  userId: string,
  orgId: string,
): Promise<TeachingPlanGateResult> {
  return resolveChurchOrgAccess(userId, orgId, TEACHING_PLAN_ACCESS.manage);
}

/**
 * Services for a church, oldest first.
 *
 * `from` is a 'YYYY-MM-DD' string compared lexically — safe because ISO dates
 * sort as text, and the column is deliberately text rather than a timestamp
 * (a service is a day on a wall calendar, not an instant).
 */
export async function listServicesForChurch(
  churchId: string,
  options: { plan?: { spaceId: string | null }; from?: string; limit?: number } = {},
): Promise<ChurchServiceRow[]> {
  const { from, limit = 50, plan } = options;

  /*
    Church plan by default, and that default is load-bearing.

    The moment `ChurchServices.spaceId` existed, a churchId-only filter started
    matching every ministry's rows too — which would have merged Youth's
    Wednesday into the congregation's "This Sunday" card with no code change
    anywhere. Defaulting to `spaceId IS NULL` means an un-migrated caller keeps
    today's behaviour instead of silently gaining a wider plan; a caller that
    wants a space plan has to name it.
  */
  const spaceId = plan ? plan.spaceId : null;
  const scope = spaceId === null
    ? isNull(ChurchServices.spaceId)
    : eq(ChurchServices.spaceId, spaceId);

  /*
    Dated rows only, always.

    This helper feeds the congregant side — the "This Sunday" card — and a
    backlog idea is a staff thought, not a promise to the congregation. The
    `gte(from)` below already drops NULLs by SQL's three-valued logic, but that
    is an accident of comparison rather than a decision; a future caller that
    omits `from` would inherit the whole backlog. Stated outright instead.
  */
  const dated = isNotNull(ChurchServices.serviceDate);
  const where = from
    ? and(eq(ChurchServices.churchId, churchId), scope, dated, gte(ChurchServices.serviceDate, from))
    : and(eq(ChurchServices.churchId, churchId), scope, dated);

  return db
    .select()
    .from(ChurchServices)
    .where(where)
    .orderBy(asc(ChurchServices.serviceDate))
    .limit(limit);
}

/** A single service scoped to its church — so an id from another church 404s. */
export async function getServiceForChurch(
  churchId: string,
  serviceId: string,
): Promise<ChurchServiceRow | null> {
  return (
    first(
      await db
        .select()
        .from(ChurchServices)
        .where(and(eq(ChurchServices.churchId, churchId), eq(ChurchServices.id, serviceId)))
        .limit(1),
    ) ?? null
  );
}

/**
 * Map of serviceId → the viewer's own note started from it.
 *
 * ALWAYS scoped by `userId`. This is what flips the card's action from
 * "Take notes" to "Open my notes", and it is the only read of
 * `startedFromServiceId` in the codebase. Never widen it to other users.
 */
export async function resolveViewerServiceNotes(
  userId: string,
  serviceIds: string[],
): Promise<Map<string, string>> {
  const ids = serviceIds.filter(Boolean);
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({ noteId: Notes.id, serviceId: Notes.startedFromServiceId })
    .from(Notes)
    .where(
      and(
        eq(Notes.userId, userId),
        isNotNull(Notes.startedFromServiceId),
        inArray(Notes.startedFromServiceId, ids),
      ),
    );

  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.serviceId && !map.has(row.serviceId)) map.set(row.serviceId, row.noteId);
  }
  return map;
}

/*
 * `deriveSeriesTitles` lived here — distinct `seriesTitle` strings, most
 * recently dated first, to power the editor's picker. It is gone with the
 * column: series are `ChurchSeries` rows now, and `listSeriesForPlan` in
 * church-series.ts returns real objects in the same recency order, which was
 * the part worth keeping.
 */
