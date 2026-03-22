/**
 * Space permission helpers — Drizzle port of src/utils/space-permissions.ts
 */

import { db, first, Spaces, Members, eq, and } from '../db';

export type SpaceRole = 'owner' | 'member';

/**
 * Typed error thrown by requireSpaceAccess when a space is not found or
 * the user lacks permission. Route handlers can catch this and convert
 * to the appropriate Hono c.json() response.
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

export async function isSpaceOwner(spaceId: string, userId: string): Promise<boolean> {
  const space = first(await db.select()
    .from(Spaces)
    .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)))
    .limit(1));
  return !!space;
}

export async function isSpaceMember(spaceId: string, userId: string): Promise<boolean> {
  const space = first(await db.select()
    .from(Spaces)
    .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)))
    .limit(1));
  if (space) return true;

  const member = first(await db.select()
    .from(Members)
    .where(and(eq(Members.spaceId, spaceId), eq(Members.userId, userId)))
    .limit(1));
  return !!member;
}

export async function getSpaceRole(spaceId: string, userId: string): Promise<SpaceRole | null> {
  const space = first(await db.select()
    .from(Spaces)
    .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)))
    .limit(1));
  if (space) return 'owner';

  const member = first(await db.select()
    .from(Members)
    .where(and(eq(Members.spaceId, spaceId), eq(Members.userId, userId)))
    .limit(1));
  if (member) return 'member';

  return null;
}

export async function requireSpaceAccess(
  spaceId: string,
  userId: string,
  requireOwner: boolean = false
): Promise<{ role: SpaceRole; space: any }> {
  const space = first(await db.select()
    .from(Spaces)
    .where(eq(Spaces.id, spaceId))
    .limit(1));

  if (!space) {
    throw new SpaceAccessError(404, 'Space not found');
  }

  const isOwner = space.userId === userId;
  if (isOwner) {
    return { role: 'owner', space };
  }

  if (requireOwner) {
    throw new SpaceAccessError(403, 'Only space owners can perform this action');
  }

  const member = first(await db.select()
    .from(Members)
    .where(and(eq(Members.spaceId, spaceId), eq(Members.userId, userId)))
    .limit(1));

  if (member) {
    return { role: 'member', space };
  }

  throw new SpaceAccessError(403, 'You do not have access to this space');
}

export async function getUserSpaces(userId: string) {
  const ownedSpaces = await db.select()
    .from(Spaces)
    .where(eq(Spaces.userId, userId))
    ;

  const memberships = await db.select()
    .from(Members)
    .where(eq(Members.userId, userId))
    ;

  const memberSpaceIds = memberships.map(m => m.spaceId);

  let memberSpaces: any[] = [];
  if (memberSpaceIds.length > 0) {
    memberSpaces = await db.select()
      .from(Spaces)
      .where(
        and(
          ...memberSpaceIds.map(id => eq(Spaces.id, id))
        )
      )
      ;
  }

  return {
    ownedSpaces,
    memberSpaces,
    allSpaces: [...ownedSpaces, ...memberSpaces],
  };
}
