/**
 * The one ordering every church-org gate composes.
 *
 * Order matters and deliberately differs from `assertChurchStaffOrgWrite` in
 * church-staff.ts, which checks sponsorship *before* staff membership and so
 * tells any signed-in stranger whether a given church has lapsed. That is
 * pre-existing; don't copy it. Here staff membership is proven first, and only
 * a real staff member ever learns the billing state.
 *
 * Written once, deliberately: the teaching plan, church settings, and (later)
 * space plans all need this exact sequence, and it is the kind of order that
 * goes subtly wrong on the second copy — the sibling named above is proof.
 * Callers supply a rule; nobody re-orders.
 */
import { fetchClerkOrgMemberships } from './clerk-org';
import { capabilitiesForChurchRole, type ChurchCapability } from './church-role-capabilities';
import { CHURCH_LAPSED_CODE, CHURCH_LAPSED_ERROR, churchIsSponsored } from './church-entitlement';
import { getActiveChurchByOrgId, isChurchStaffForChurch, type ChurchRow } from './church-staff';

export type ChurchOrgAccessResult =
  | { ok: true; church: ChurchRow }
  | { ok: false; status: 402 | 403 | 404 | 409; code: string; error: string };

export type ChurchOrgAccessRule = {
  capability: ChurchCapability;
  /** Denial code for both the role check and the fail-closed Clerk branch. */
  code: string;
  staffError: string;
  roleError: string;
  /**
   * Writes only. A lapsed church keeps every read — it must never take its
   * congregation's Sunday away, and its staff must still see what they set.
   */
  sponsorshipGated: boolean;
};

export async function resolveChurchOrgAccess(
  userId: string,
  orgId: string,
  rule: ChurchOrgAccessRule,
): Promise<ChurchOrgAccessResult> {
  const church = await getActiveChurchByOrgId(orgId);
  if (!church) {
    return { ok: false, status: 404, code: 'CHURCH_NOT_FOUND', error: 'Church not found' };
  }
  if (!church.isActive) {
    return { ok: false, status: 409, code: 'CHURCH_INACTIVE', error: 'Church is not active' };
  }
  // `isChurchStaffForChurch`, not the …ForOrg wrapper: the church row is already
  // in hand, and the wrapper would look it up again on every church request.
  if (!(await isChurchStaffForChurch(userId, church))) {
    return { ok: false, status: 403, code: 'CHURCH_STAFF_REQUIRED', error: rule.staffError };
  }
  if (rule.sponsorshipGated && !churchIsSponsored(church)) {
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
      code: rule.code,
      error: 'Could not confirm your role. Try again in a moment.',
    };
  }
  if (!capabilitiesForChurchRole(role).includes(rule.capability)) {
    return { ok: false, status: 403, code: rule.code, error: rule.roleError };
  }

  return { ok: true, church };
}
