/**
 * Clerk Organizations REST client + staff-sync planning for church orgs.
 *
 * First Clerk Organizations runtime code in the codebase. Read-only: this
 * module only GETs org data — it never creates or mutates Clerk orgs (the
 * pilot flow creates orgs manually in the Clerk dashboard).
 *
 * Church model (see docs/future/CHURCH_ORG_AND_CURRICULUM.md): the Clerk org
 * holds ONLY church staff/volunteers (≤20); congregants are never Clerk org
 * members. Staff sync maps every org member to SpaceMemberships role
 * 'leader' on the church's org-owned spaces — 'owner' remains exclusively
 * the Spaces.userId row, and 'member' rows (future congregant followers)
 * are never touched.
 *
 * Uses raw fetch + CLERK_SECRET_KEY (the syncSharedSpacesAddOnFromClerk
 * precedent in tier-limits.ts). Fails closed when the key is missing —
 * these are admin-only pipes with no silent fallback.
 */

export type ClerkOrgSummary = { id: string; name: string; slug: string | null };
export type ClerkOrgMember = { userId: string; role: string };

export class ClerkOrgError extends Error {
  constructor(
    public code: 'CLERK_KEY_MISSING' | 'CLERK_UNAVAILABLE' | 'CLERK_ORGS_NOT_ENABLED',
    message: string,
  ) {
    super(message);
    this.name = 'ClerkOrgError';
  }
}

/**
 * Clerk answers 403 organization_not_enabled_* when the Organizations
 * feature is off for the instance — an operational prerequisite (enable it
 * in the Clerk dashboard), not an outage. Surface it distinctly.
 */
function classifyClerkFailure(status: number): ClerkOrgError {
  if (status === 403) {
    return new ClerkOrgError(
      'CLERK_ORGS_NOT_ENABLED',
      'Clerk Organizations is not enabled for this instance — enable it in the Clerk dashboard',
    );
  }
  return new ClerkOrgError('CLERK_UNAVAILABLE', `Clerk request returned ${status}`);
}

export function isValidClerkOrgId(orgId: string): boolean {
  return /^org_[A-Za-z0-9]+$/.test(orgId);
}

function clerkSecretKey(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new ClerkOrgError('CLERK_KEY_MISSING', 'Missing env CLERK_SECRET_KEY');
  return key;
}

/**
 * Fetch one organization. 404 (unknown org) and 400 (id Clerk rejects) both
 * → null — for the register flow either means "no such org"; other non-OK →
 * ClerkOrgError.
 */
export async function fetchClerkOrganization(orgId: string): Promise<ClerkOrgSummary | null> {
  const key = clerkSecretKey();
  let response: Response;
  try {
    response = await fetch(`https://api.clerk.com/v1/organizations/${orgId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    throw new ClerkOrgError('CLERK_UNAVAILABLE', `Clerk organization fetch failed: ${error}`);
  }
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) {
    throw classifyClerkFailure(response.status);
  }
  const data = (await response.json()) as { id?: string; name?: string; slug?: string | null };
  if (!data.id || !data.name) {
    throw new ClerkOrgError('CLERK_UNAVAILABLE', 'Clerk organization response missing id/name');
  }
  return { id: data.id, name: data.name, slug: data.slug ?? null };
}

type ClerkMembershipRow = {
  role?: string;
  public_user_data?: { user_id?: string } | null;
};

const MEMBERSHIPS_PAGE_SIZE = 100;

/**
 * Fetch all memberships of an org (paginated; staff is ≤20 in practice, the
 * loop is defensive). Consumes only `role` + `public_user_data.user_id`;
 * rows without public_user_data are skipped.
 */
export async function fetchClerkOrgMemberships(orgId: string): Promise<ClerkOrgMember[]> {
  const key = clerkSecretKey();
  const members: ClerkOrgMember[] = [];
  let offset = 0;

  for (;;) {
    let response: Response;
    try {
      response = await fetch(
        `https://api.clerk.com/v1/organizations/${orgId}/memberships?limit=${MEMBERSHIPS_PAGE_SIZE}&offset=${offset}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        },
      );
    } catch (error) {
      throw new ClerkOrgError('CLERK_UNAVAILABLE', `Clerk memberships fetch failed: ${error}`);
    }
    if (!response.ok) {
      throw classifyClerkFailure(response.status);
    }
    const payload = (await response.json()) as { data?: ClerkMembershipRow[]; total_count?: number };
    const rows = Array.isArray(payload.data) ? payload.data : [];

    for (const row of rows) {
      const userId = row.public_user_data?.user_id;
      if (!userId) continue;
      members.push({ userId, role: row.role ?? 'org:member' });
    }

    offset += rows.length;
    const total = typeof payload.total_count === 'number' ? payload.total_count : offset;
    if (rows.length < MEMBERSHIPS_PAGE_SIZE || offset >= total) break;
  }

  return members;
}

export type StaffSyncPlan = {
  /** Staff (not the space owner) with no membership row yet → insert role 'leader'. */
  toInsertLeaders: string[];
  /** Staff whose existing row is role 'member' → promote to 'leader'. */
  toPromoteToLeader: string[];
  /** Existing 'leader' rows for people no longer in the Clerk org → delete. */
  toRemove: string[];
  /** The Spaces.userId owner has no membership row → insert role 'owner'. */
  healOwnerRow: boolean;
  warnings: string[];
};

/**
 * Pure planner for one space. Invariants: the owner row is never demoted or
 * removed (owner = Spaces.userId, exclusively); existing role 'member' rows
 * are never touched — they are (future) congregant followers, not staff.
 */
export function computeStaffSyncPlan(input: {
  spaceOwnerUserId: string;
  staff: ClerkOrgMember[];
  existing: { userId: string; role: string }[];
}): StaffSyncPlan {
  const staffIds = new Set(input.staff.map((m) => m.userId));
  const existingByUser = new Map(input.existing.map((row) => [row.userId, row.role]));
  const warnings: string[] = [];

  const toInsertLeaders: string[] = [];
  const toPromoteToLeader: string[] = [];
  for (const staffId of staffIds) {
    if (staffId === input.spaceOwnerUserId) continue; // owner row handled separately
    const existingRole = existingByUser.get(staffId);
    if (existingRole === undefined) toInsertLeaders.push(staffId);
    else if (existingRole === 'member') toPromoteToLeader.push(staffId);
    // 'leader' and 'owner' rows are already correct / never demoted
  }

  const toRemove: string[] = [];
  for (const row of input.existing) {
    if (row.role !== 'leader') continue; // never touch 'owner' or 'member' rows
    if (row.userId === input.spaceOwnerUserId) continue;
    if (!staffIds.has(row.userId)) toRemove.push(row.userId);
  }

  const healOwnerRow = !existingByUser.has(input.spaceOwnerUserId);
  if (!staffIds.has(input.spaceOwnerUserId)) {
    warnings.push(`Space owner ${input.spaceOwnerUserId} is not a member of the Clerk org`);
  }

  return { toInsertLeaders, toPromoteToLeader, toRemove, healOwnerRow, warnings };
}
