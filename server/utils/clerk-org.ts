/**
 * Clerk Organizations REST client + staff-sync planning for church orgs.
 *
 * First Clerk Organizations runtime code in the codebase. Orgs themselves are
 * still created by hand in the Clerk dashboard (the concierge pilot flow) —
 * this module never creates or deletes an organization. It does manage the
 * **roster** of an existing org, so a church can invite and remove its own
 * staff instead of routing every change through a Harvous admin.
 *
 * Church model (see docs/future/CHURCH_ORG_AND_CURRICULUM.md): the Clerk org
 * holds ONLY church staff/volunteers (≤20); congregants are never Clerk org
 * members. Staff sync maps every org member to SpaceMemberships role
 * 'leader' on the church's org-owned spaces — 'owner' remains exclusively
 * the Spaces.userId row, and 'member' rows (future congregant followers)
 * are never touched.
 *
 * Uses raw fetch + CLERK_SECRET_KEY. Fails closed when the key is missing —
 * these are admin-only pipes with no silent fallback.
 */

export type ClerkOrgSummary = { id: string; name: string; slug: string | null; memberCount?: number };
export type ClerkOrgMember = { userId: string; role: string };

/**
 * Standard Clerk Organizations membership ceiling (free / non-Enhanced).
 * Church base always includes this many staff seats; Unlimited staff add-on
 * (+ Clerk Enhanced app-wide) is the future unlock path.
 */
export const CLERK_ORG_STAFF_CAP = 20;

/** True when a Clerk org roster fits the Harvous church base staff cap. */
export function isWithinClerkOrgStaffCap(memberCount: number): boolean {
  return memberCount <= CLERK_ORG_STAFF_CAP;
}

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

type ClerkOrgRow = {
  id?: string;
  name?: string;
  slug?: string | null;
  members_count?: number;
};

/**
 * List all organizations on the instance (admin picker). Read-only.
 * Churches are onboarded manually, so this is expected to stay small.
 */
export async function fetchClerkOrganizations(): Promise<ClerkOrgSummary[]> {
  const key = clerkSecretKey();
  const orgs: ClerkOrgSummary[] = [];
  let offset = 0;

  for (;;) {
    let response: Response;
    try {
      response = await fetch(
        `https://api.clerk.com/v1/organizations?limit=${ORGS_PAGE_SIZE}&offset=${offset}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        },
      );
    } catch (error) {
      throw new ClerkOrgError('CLERK_UNAVAILABLE', `Clerk organizations fetch failed: ${error}`);
    }
    if (!response.ok) throw classifyClerkFailure(response.status);

    const payload = (await response.json()) as { data?: ClerkOrgRow[]; total_count?: number };
    const rows = Array.isArray(payload.data) ? payload.data : [];

    for (const row of rows) {
      if (!row.id || !row.name) continue;
      orgs.push({
        id: row.id,
        name: row.name,
        slug: row.slug ?? null,
        memberCount: typeof row.members_count === 'number' ? row.members_count : undefined,
      });
    }

    offset += rows.length;
    const total = typeof payload.total_count === 'number' ? payload.total_count : offset;
    if (rows.length < ORGS_PAGE_SIZE || offset >= total) break;
  }

  return orgs;
}

type ClerkMembershipRow = {
  role?: string;
  public_user_data?: { user_id?: string } | null;
};

const MEMBERSHIPS_PAGE_SIZE = 100;
const ORGS_PAGE_SIZE = 100;

/**
 * How long a fetched roster is reused.
 *
 * The roster is the source of every church capability, so this is deliberately
 * short — a role change made in another process (or in the Clerk dashboard)
 * must take effect on its own, without a deploy. Roster writes made *here*
 * evict eagerly, so the window only ever covers changes this process did not
 * make.
 */
const ORG_ROSTER_CACHE_TTL_MS = 30_000;

/** Promises, not values: a burst of concurrent gates shares one HTTP request. */
const orgRosterCache = new Map<string, { members: Promise<ClerkOrgMember[]>; expiresAt: number }>();

/**
 * Drop the memoized roster for an org. Called by every roster write below, so
 * a role change this process made is visible to the next gate immediately.
 */
export function invalidateClerkOrgMemberships(orgId: string): void {
  orgRosterCache.delete(orgId);
}

/**
 * Fetch all memberships of an org (paginated; staff is ≤20 in practice, the
 * loop is defensive). Consumes only `role` + `public_user_data.user_id`;
 * rows without public_user_data are skipped.
 *
 * Memoized for `ORG_ROSTER_CACHE_TTL_MS`, because this is the hottest Clerk
 * call in the church surfaces and it was being made several times to render one
 * pane: `resolveChurchOrgAccess` alone asked twice (once through
 * `isChurchStaffForOrg`, once for the role), and staff-status, the plan, church
 * settings and templates each asked again on top of that. Every one of those is
 * the same list of at most twenty people.
 */
export async function fetchClerkOrgMemberships(orgId: string): Promise<ClerkOrgMember[]> {
  const cached = orgRosterCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) return cached.members;

  const pending = fetchClerkOrgMembershipsUncached(orgId);
  orgRosterCache.set(orgId, { members: pending, expiresAt: Date.now() + ORG_ROSTER_CACHE_TTL_MS });
  /*
    Never cache a failure. `isChurchStaffForOrg` turns a Clerk outage into
    "not staff", so a cached rejection would lock a pastor out of their own
    church for the rest of the TTL.
  */
  pending.catch(() => orgRosterCache.delete(orgId));
  return pending;
}

async function fetchClerkOrgMembershipsUncached(orgId: string): Promise<ClerkOrgMember[]> {
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

// ─── Roster writes (church self-serve staff management) ─────────────────────

/** Clerk org roles Harvous understands. Anything else is treated as plain staff. */
export const CLERK_ORG_ADMIN_ROLE = 'org:admin';
export const CLERK_ORG_MEMBER_ROLE = 'org:member';

/** Only an org admin may change the roster — a leader can publish, not staff up. */
export function isClerkOrgAdminRole(role: string | null | undefined): boolean {
  return role === CLERK_ORG_ADMIN_ROLE;
}

export type ClerkOrgInvitation = {
  id: string;
  emailAddress: string;
  role: string;
  status: string;
  createdAt: number | null;
};

type ClerkInvitationRow = {
  id?: string;
  email_address?: string;
  role?: string;
  status?: string;
  created_at?: number;
};

async function clerkFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = clerkSecretKey();
  try {
    return await fetch(`https://api.clerk.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ClerkOrgError('CLERK_UNAVAILABLE', `Clerk request failed: ${error}`);
  }
}

/**
 * Pending invitations for an org. These count against the staff cap: an org at
 * 18 members with 3 outstanding invites is already over 20 once they accept.
 */
export async function fetchClerkOrgPendingInvitations(
  orgId: string,
): Promise<ClerkOrgInvitation[]> {
  const response = await clerkFetch(
    `/organizations/${orgId}/invitations?status=pending&limit=${MEMBERSHIPS_PAGE_SIZE}`,
  );
  if (!response.ok) throw classifyClerkFailure(response.status);
  const payload = (await response.json()) as { data?: ClerkInvitationRow[] };
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows
    .filter((row): row is ClerkInvitationRow & { id: string; email_address: string } =>
      Boolean(row.id && row.email_address),
    )
    .map((row) => ({
      id: row.id,
      emailAddress: row.email_address,
      role: row.role ?? CLERK_ORG_MEMBER_ROLE,
      status: row.status ?? 'pending',
      createdAt: typeof row.created_at === 'number' ? row.created_at : null,
    }));
}

/** Invite one person to the staff org. `inviterUserId` must be an org admin. */
export async function createClerkOrgInvitation(input: {
  orgId: string;
  emailAddress: string;
  inviterUserId: string;
  role?: string;
}): Promise<ClerkOrgInvitation> {
  const response = await clerkFetch(`/organizations/${input.orgId}/invitations`, {
    method: 'POST',
    body: JSON.stringify({
      email_address: input.emailAddress,
      inviter_user_id: input.inviterUserId,
      role: input.role ?? CLERK_ORG_MEMBER_ROLE,
    }),
  });
  if (!response.ok) {
    // Clerk answers 400 for "already a member" / "already invited" — surface it
    // as a distinct, actionable failure rather than a generic outage.
    if (response.status === 400 || response.status === 422) {
      const body = (await response.json().catch(() => null)) as
        | { errors?: Array<{ message?: string; long_message?: string }> }
        | null;
      const message =
        body?.errors?.[0]?.long_message ?? body?.errors?.[0]?.message ?? 'Clerk rejected the invitation';
      throw new ClerkOrgInviteError(message);
    }
    throw classifyClerkFailure(response.status);
  }
  const row = (await response.json()) as ClerkInvitationRow;
  return {
    id: row.id ?? '',
    emailAddress: row.email_address ?? input.emailAddress,
    role: row.role ?? CLERK_ORG_MEMBER_ROLE,
    status: row.status ?? 'pending',
    createdAt: typeof row.created_at === 'number' ? row.created_at : null,
  };
}

/** A rejected invitation (already a member, already invited, bad address). */
export class ClerkOrgInviteError extends Error {
  readonly code = 'CLERK_INVITE_REJECTED';
  constructor(message: string) {
    super(message);
    this.name = 'ClerkOrgInviteError';
  }
}

export async function revokeClerkOrgInvitation(input: {
  orgId: string;
  invitationId: string;
  requestingUserId: string;
}): Promise<void> {
  const response = await clerkFetch(
    `/organizations/${input.orgId}/invitations/${input.invitationId}/revoke`,
    { method: 'POST', body: JSON.stringify({ requesting_user_id: input.requestingUserId }) },
  );
  if (!response.ok && response.status !== 404) throw classifyClerkFailure(response.status);
}

/**
 * Remove someone from the staff org. Harvous membership rows are reconciled
 * separately by syncChurchStaffForOrg — this only touches Clerk.
 */
/**
 * Change a staff member's Clerk org role.
 *
 * Roles are the source of every church capability (see
 * church-role-capabilities.ts), so this is the one write that can hand someone
 * the teaching plan or take it away. Clerk is the record; Harvous never stores
 * a role of its own to drift from it.
 */
export async function updateClerkOrgMemberRole(
  orgId: string,
  userId: string,
  role: string,
): Promise<void> {
  const response = await clerkFetch(`/organizations/${orgId}/memberships/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
  // Before the throw: a PATCH that Clerk applied and then failed to acknowledge
  // must not leave a stale roster memoized behind it.
  invalidateClerkOrgMemberships(orgId);
  if (!response.ok) throw classifyClerkFailure(response.status);
}

export async function removeClerkOrgMember(orgId: string, userId: string): Promise<void> {
  const response = await clerkFetch(`/organizations/${orgId}/memberships/${userId}`, {
    method: 'DELETE',
  });
  invalidateClerkOrgMemberships(orgId);
  if (!response.ok && response.status !== 404) throw classifyClerkFailure(response.status);
}

/**
 * Whether one more invitation fits under the staff cap, counting pending
 * invites as if they were already accepted. Pure so the boundary is testable.
 */
export function canInviteMoreStaff(input: {
  memberCount: number;
  pendingInviteCount: number;
  adding?: number;
}): boolean {
  const adding = input.adding ?? 1;
  return input.memberCount + input.pendingInviteCount + adding <= CLERK_ORG_STAFF_CAP;
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
 * are never touched — they are (future) congregant followers, not staff; and
 * **granted leaders are never reaped** (see `grantSource` below).
 */
export function computeStaffSyncPlan(input: {
  spaceOwnerUserId: string;
  staff: ClerkOrgMember[];
  existing: { userId: string; role: string; grantSource?: string | null }[];
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
    /*
      A granted leader is a volunteer who was explicitly given this one space —
      they are not in the Clerk roster and never will be, so reaping them here
      would silently undo the grant on the next webhook. NULL reads as
      'staff_sync', which is what every row predating grants is.
    */
    if (row.grantSource === 'grant') continue;
    if (!staffIds.has(row.userId)) toRemove.push(row.userId);
  }

  const healOwnerRow = !existingByUser.has(input.spaceOwnerUserId);
  if (!staffIds.has(input.spaceOwnerUserId)) {
    warnings.push(`Space owner ${input.spaceOwnerUserId} is not a member of the Clerk org`);
  }

  return { toInsertLeaders, toPromoteToLeader, toRemove, healOwnerRow, warnings };
}
