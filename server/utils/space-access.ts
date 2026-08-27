/**
 * Space access + capability helpers for the Shared Spaces rails.
 *
 * Supersedes space-permissions.ts (v1 sharing, which read the frozen Members
 * table). Roles come from SpaceMemberships; the owner has a membership row too,
 * while Spaces.userId remains the creator/billing anchor.
 *
 * Role order: owner > leader > member. 'leader' is schema-ready but dormant in
 * the foundation UI (activates with Group Leader / church org).
 *
 * Church-org: a space with orgId set is owned/sponsored by that church
 * (Churches.orgId). Spaces.userId stays the creating staff member. Staff
 * authoring = SpaceMemberships (creator 'owner', other staff 'leader' via
 * admin sync-staff). Access stays pure-DB — never heal from Clerk at read
 * time. Congregants follow ministry channels (type='public'+orgId) as
 * role='member' via followMinistryChannel; canAuthorInSpace denies them
 * authoring. Church Shared Spaces use type='shared'+orgId.
 */

import { db, first, Spaces, SpaceMemberships, eq, and, now } from '../db';

export type SpaceRole = 'owner' | 'leader' | 'member';
export type SpaceType = 'personal' | 'shared' | 'public';
export type SpaceRow = typeof Spaces.$inferSelect;

const ROLE_RANK: Record<SpaceRole, number> = { owner: 3, leader: 2, member: 1 };

/**
 * Typed error thrown by requireSpaceAccess when a space is not found or the
 * user lacks permission. Route handlers catch this and convert to c.json().
 */
export class SpaceAccessError extends Error {
  constructor(
    public status: 403 | 404,
    message: string,
    public code: string = status === 404 ? 'NOT_FOUND' : 'FORBIDDEN',
  ) {
    super(message);
    this.name = 'SpaceAccessError';
  }
}

function normalizeRole(role: string | null | undefined): SpaceRole | null {
  return role === 'owner' || role === 'leader' || role === 'member' ? role : null;
}

/**
 * Whether a role may author content (notes/threads/folders) in a space.
 * personal → owner only; shared → any member; public → owner/leader only
 * (broadcast model: members follow and copy, they don't post).
 */
export function canAuthorInSpace(space: Pick<SpaceRow, 'type'>, role: SpaceRole): boolean {
  switch (space.type as SpaceType) {
    case 'personal':
      return role === 'owner';
    case 'shared':
      return true;
    case 'public':
      return ROLE_RANK[role] >= ROLE_RANK.leader;
    default:
      return false;
  }
}

/**
 * Whether a note's shared-space associations must be collapsed to the one space being
 * read in, rather than reported in full.
 *
 * The privacy rule: a member reading a note inside one space must not learn the author's
 * *other* audiences. Which spaces you have shared something into is yours to know.
 *
 * The author is not a stranger to their own note, though, and this used to fire for them
 * too — so opening your own note inside a shared space reported exactly one association
 * and the editor's destination row had nothing to render from.
 *
 * Pure and separately tested because it is a disclosure decision: it should be readable
 * as one rule rather than inferred from a ternary in the middle of a response body.
 */
export function shouldCollapseAssociationsToReadContext(input: {
  /** True when the note is being read inside a shared or public space. */
  isSharedReadContext: boolean;
  /** The note's canonical author. */
  noteAuthorUserId: string;
  viewerUserId: string;
}): boolean {
  if (!input.isSharedReadContext) return false;
  return input.noteAuthorUserId !== input.viewerUserId;
}

/** Owner/leader creates folders, threads, and connect-link clusters; members compose and attach. */
export function canManageSpaceStructure(space: Pick<SpaceRow, 'type'>, role: SpaceRole): boolean {
  if (space.type === 'personal') return role === 'owner';
  return ROLE_RANK[role] >= ROLE_RANK.leader;
}

/** Church-owned/sponsored space (ministry channel or church Shared Space). */
export function isOrgOwnedSpace(space: Pick<SpaceRow, 'orgId'>): boolean {
  return space.orgId != null;
}

/** Shared Thread structure is reserved for the canonical Spaces.userId owner. */
export function isActualSpaceOwner(
  space: Pick<SpaceRow, 'userId'> | null | undefined,
  actorId: string,
): boolean {
  return Boolean(space && space.userId === actorId);
}

export function isSpaceActive<T extends Pick<SpaceRow, 'deletedAt'>>(
  space: T | null | undefined,
): space is T {
  return Boolean(space && !space.deletedAt);
}

export async function requireSpaceAccess(
  spaceId: string,
  userId: string,
  opts?: { minRole?: SpaceRole },
): Promise<{ role: SpaceRole; space: SpaceRow }> {
  const space = first(await db.select().from(Spaces).where(eq(Spaces.id, spaceId)).limit(1));

  if (!isSpaceActive(space)) {
    throw new SpaceAccessError(404, 'Space not found');
  }

  let role: SpaceRole | null = null;

  if (space.type === 'personal') {
    // Personal spaces have no membership rows; the creator is the only person in them.
    role = space.userId === userId ? 'owner' : null;
  } else {
    const membership = first(
      await db
        .select()
        .from(SpaceMemberships)
        .where(and(eq(SpaceMemberships.spaceId, spaceId), eq(SpaceMemberships.userId, userId)))
        .limit(1),
    );
    role = normalizeRole(membership?.role);

    if (!role && space.userId === userId) {
      // Heal-on-read: the creator must always hold the owner row (guards
      // against a partially-completed create). Insert it rather than 403ing.
      const ts = now();
      await db
        .insert(SpaceMemberships)
        .values({
          id: `smem_${crypto.randomUUID()}`,
          spaceId,
          userId,
          role: 'owner',
          joinedAt: ts,
          createdAt: ts,
        })
        .onConflictDoNothing();
      role = 'owner';
    }
  }

  if (!role) {
    throw new SpaceAccessError(403, 'You do not have access to this space');
  }

  const minRole = opts?.minRole ?? 'member';
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new SpaceAccessError(
      403,
      minRole === 'owner'
        ? 'Only space owners can perform this action'
        : 'You do not have permission to perform this action',
    );
  }

  return { role, space };
}
