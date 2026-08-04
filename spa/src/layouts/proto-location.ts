/**
 * Where the user is: which **parent** (My Home, a church, …) and which space
 * inside it.
 *
 * This replaces a pair of mutually-exclusive nullables — `activeSpaceId` and
 * `activeChurchOrgId` — that together encoded one question. Nothing in the old
 * types stopped `(spaceId, orgId)` from disagreeing, so each setter manually
 * nulled the other and callers passed a `keepChurch` flag to opt out of that
 * nulling. Adding a third parent kind would have meant a third nullable, a third
 * nulling rule, and a `keepSchool` flag.
 *
 * Here the illegal combinations aren't representable, and a new parent kind is
 * one more variant of `SpaceParent`.
 */

/** A space's container. Add a variant here to introduce a new kind of parent. */
export type SpaceParent =
  | { kind: 'home' }
  | { kind: 'church'; orgId: string };
// future: | { kind: 'school'; orgId: string }

export type SpaceParentKind = SpaceParent['kind'];

export type ProtoLocation = {
  parent: SpaceParent;
  /** `null` = the parent's own hub (My Home dashboard / My Church hub). */
  spaceId: string | null;
};

export const HOME_PARENT: SpaceParent = { kind: 'home' };

/** My Home with no space open — the default location and the reset target. */
export const HOME_LOCATION: ProtoLocation = { parent: HOME_PARENT, spaceId: null };

export function churchParent(orgId: string): SpaceParent {
  return { kind: 'church', orgId };
}

/** The org id when this parent has one; `null` for My Home. */
export function parentOrgId(parent: SpaceParent): string | null {
  return parent.kind === 'church' ? parent.orgId : null;
}

export function isSameParent(a: SpaceParent, b: SpaceParent): boolean {
  if (a.kind !== b.kind) return false;
  return parentOrgId(a) === parentOrgId(b);
}

export function isSameLocation(a: ProtoLocation, b: ProtoLocation): boolean {
  return a.spaceId === b.spaceId && isSameParent(a.parent, b.parent);
}

/**
 * A space's parent, derived from the space itself.
 *
 * This is what retires `keepChurch`: opening a ministry channel puts you in
 * church context because that is where the channel lives, not because the call
 * site remembered to pass a flag. Anything without an `orgId` is personal, and
 * therefore lives under My Home.
 */
export function parentForSpace(
  space: { orgId?: string | null } | null | undefined,
): SpaceParent {
  const orgId = space?.orgId?.trim();
  return orgId ? churchParent(orgId) : HOME_PARENT;
}

/** Location for a space, with its parent derived. `null` space → the parent's hub. */
export function locationForSpace(
  space: { id: string; orgId?: string | null } | null | undefined,
): ProtoLocation {
  if (!space) return HOME_LOCATION;
  return { parent: parentForSpace(space), spaceId: space.id };
}

/**
 * Rebuild a location from the legacy stored pair.
 *
 * Storage still holds `activeSpaceId` + `activeChurchOrgId` (see
 * proto-sidebar-nav-store.ts), so sessions written before this refactor keep
 * working. An org id with no space is a church hub; an org id with a space is a
 * space inside that church.
 */
export function locationFromStoredPair(input: {
  activeSpaceId?: string | null;
  activeChurchOrgId?: string | null;
}): ProtoLocation {
  const orgId = input.activeChurchOrgId?.trim() || null;
  return {
    parent: orgId ? churchParent(orgId) : HOME_PARENT,
    spaceId: input.activeSpaceId?.trim() || null,
  };
}

/** Flatten a location back to the stored pair. Inverse of `locationFromStoredPair`. */
export function storedPairFromLocation(location: ProtoLocation): {
  activeSpaceId: string | null;
  activeChurchOrgId: string | null;
} {
  return {
    activeSpaceId: location.spaceId,
    activeChurchOrgId: parentOrgId(location.parent),
  };
}
