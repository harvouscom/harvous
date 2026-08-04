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
  asc,
} from '../db';
import { fetchClerkOrgMemberships } from './clerk-org';
import { capabilitiesForChurchRole } from './church-role-capabilities';
import { CHURCH_LAPSED_CODE, CHURCH_LAPSED_ERROR, churchIsSponsored } from './church-entitlement';
import { getActiveChurchByOrgId, isChurchStaffForOrg, type ChurchRow } from './church-staff';

export type ChurchServiceRow = typeof ChurchServices.$inferSelect;

export type TeachingPlanGateResult =
  | { ok: true; church: ChurchRow }
  | { ok: false; status: 402 | 403 | 404 | 409; code: string; error: string };

/**
 * May this user author the church's teaching plan?
 *
 * Order matters and deliberately differs from `assertChurchStaffOrgWrite` in
 * church-staff.ts, which checks sponsorship *before* staff membership and so
 * tells any signed-in stranger whether a given church has lapsed. That is
 * pre-existing; don't copy it. Here staff membership is proven first, and only
 * a real staff member ever learns the billing state.
 */
export async function assertCanManageTeachingPlan(
  userId: string,
  orgId: string,
): Promise<TeachingPlanGateResult> {
  const church = await getActiveChurchByOrgId(orgId);
  if (!church) {
    return { ok: false, status: 404, code: 'CHURCH_NOT_FOUND', error: 'Church not found' };
  }
  if (!church.isActive) {
    return { ok: false, status: 409, code: 'CHURCH_INACTIVE', error: 'Church is not active' };
  }
  if (!(await isChurchStaffForOrg(userId, church.orgId))) {
    return {
      ok: false,
      status: 403,
      code: 'CHURCH_STAFF_REQUIRED',
      error: 'Only church staff can manage the teaching plan',
    };
  }
  // Writes only. Reading the plan is never sponsorship-gated — a lapsed church
  // must never take its congregation's Sunday away.
  if (!churchIsSponsored(church)) {
    return { ok: false, status: 402, code: CHURCH_LAPSED_CODE, error: CHURCH_LAPSED_ERROR };
  }

  let role: string | null = null;
  try {
    const roster = await fetchClerkOrgMemberships(church.orgId);
    role = roster.find((member) => member.userId === userId)?.role ?? null;
  } catch {
    // Fail closed: a Clerk outage must not let a plain staff member publish
    // what the whole congregation will see on Sunday.
    return {
      ok: false,
      status: 403,
      code: 'SERMON_TOOLS_REQUIRED',
      error: 'Could not confirm your role. Try again in a moment.',
    };
  }
  if (!capabilitiesForChurchRole(role).includes('sermon_tools')) {
    return {
      ok: false,
      status: 403,
      code: 'SERMON_TOOLS_REQUIRED',
      error: 'Your role does not include the teaching plan',
    };
  }

  return { ok: true, church };
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
  options: { from?: string; limit?: number } = {},
): Promise<ChurchServiceRow[]> {
  const { from, limit = 50 } = options;
  const where = from
    ? and(eq(ChurchServices.churchId, churchId), gte(ChurchServices.serviceDate, from))
    : eq(ChurchServices.churchId, churchId);

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
