/**
 * Space Permission Helpers
 *
 * Provides functions to check user permissions for collaborative shared spaces.
 * Centralizes permission logic for consistency across all space-related endpoints.
 */

import { db, Spaces, Members, eq, and, or } from 'astro:db';
import { forbiddenResponse, notFoundResponse } from './api-responses';

export type SpaceRole = 'owner' | 'member';

interface SpaceAccessResult {
  hasAccess: boolean;
  role: SpaceRole | null;
  space?: any;
}

/**
 * Check if user is the owner of a space
 */
export async function isSpaceOwner(spaceId: string, userId: string): Promise<boolean> {
  const space = await db.select()
    .from(Spaces)
    .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)))
    .get();

  return !!space;
}

/**
 * Check if user is a member (or owner) of a space
 */
export async function isSpaceMember(spaceId: string, userId: string): Promise<boolean> {
  // Check if user is the owner
  const space = await db.select()
    .from(Spaces)
    .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)))
    .get();

  if (space) {
    return true;
  }

  // Check if user is in Members table
  const member = await db.select()
    .from(Members)
    .where(and(eq(Members.spaceId, spaceId), eq(Members.userId, userId)))
    .get();

  return !!member;
}

/**
 * Get user's role in a space
 * Returns 'owner' if user created the space, 'member' if in Members table, null otherwise
 */
export async function getSpaceRole(spaceId: string, userId: string): Promise<SpaceRole | null> {
  // Check if user is the owner
  const space = await db.select()
    .from(Spaces)
    .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)))
    .get();

  if (space) {
    return 'owner';
  }

  // Check if user is in Members table
  const member = await db.select()
    .from(Members)
    .where(and(eq(Members.spaceId, spaceId), eq(Members.userId, userId)))
    .get();

  if (member) {
    return 'member';
  }

  return null;
}

/**
 * Verify user has access to space and return role + space data
 * Throws 403/404 errors if no access
 *
 * @param spaceId - The space ID to check
 * @param userId - The user ID to verify
 * @param requireOwner - If true, only owners can access (default: false)
 * @returns Object with role and space data
 * @throws Response if user doesn't have access
 */
export async function requireSpaceAccess(
  spaceId: string,
  userId: string,
  requireOwner: boolean = false
): Promise<{ role: SpaceRole, space: any }> {
  // First get the space
  const space = await db.select()
    .from(Spaces)
    .where(eq(Spaces.id, spaceId))
    .get();

  if (!space) {
    throw notFoundResponse('Space');
  }

  // Check if user is the owner
  const isOwner = space.userId === userId;

  if (isOwner) {
    return { role: 'owner', space };
  }

  // If owner is required and user is not owner, deny
  if (requireOwner) {
    throw forbiddenResponse('Only space owners can perform this action');
  }

  // Check if user is a member
  const member = await db.select()
    .from(Members)
    .where(and(eq(Members.spaceId, spaceId), eq(Members.userId, userId)))
    .get();

  if (member) {
    return { role: 'member', space };
  }

  // User has no access
  throw forbiddenResponse('You do not have access to this space');
}

/**
 * Get all spaces where user is owner or member
 * Useful for listing user's accessible spaces
 */
export async function getUserSpaces(userId: string) {
  // Get spaces where user is owner
  const ownedSpaces = await db.select()
    .from(Spaces)
    .where(eq(Spaces.userId, userId))
    .all();

  // Get spaces where user is member
  const memberships = await db.select()
    .from(Members)
    .where(eq(Members.userId, userId))
    .all();

  const memberSpaceIds = memberships.map(m => m.spaceId);

  let memberSpaces = [];
  if (memberSpaceIds.length > 0) {
    memberSpaces = await db.select()
      .from(Spaces)
      .where(
        and(
          ...memberSpaceIds.map(id => eq(Spaces.id, id))
        )
      )
      .all();
  }

  return {
    ownedSpaces,
    memberSpaces,
    allSpaces: [...ownedSpaces, ...memberSpaces]
  };
}
