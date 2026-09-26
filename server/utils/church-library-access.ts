/**
 * Who may read, curate, and open a church's Resource Library.
 *
 * The personal library asks one question — "is this yours?" — answered by
 * `findOwnedItem` in server/routes/library.ts. A church library asks three at
 * once, and they are orthogonal (RESOURCE_LIBRARY.md §7):
 *
 *   audience  `LibraryItems.access` — 'members' or 'leaders'
 *   scope     `LibraryItemScopes`   — the whole church, or one space
 *   standing  connected congregant, staff, or granted leader of that space
 *
 * All three are resolved here rather than at each call site, because the
 * failure mode of getting one wrong is a church's leaders-only material
 * appearing in a congregant's sidebar. One chokepoint is auditable; five
 * hand-rolled joins are not.
 *
 * Reads are never sponsorship-gated. A church whose pilot lapsed keeps the
 * library its people already have — same bargain org note templates strike
 * (server/routes/note-templates.ts). Only curation stops.
 */
import {
  db,
  first,
  and,
  eq,
  inArray,
  isNull,
  ResourceLibraries,
  LibraryItems,
  LibraryItemScopes,
  ChurchMinistries,
  SpaceMemberships,
  Spaces,
  Churches,
  UserMetadata,
} from '../db';
import { resolveChurchOrgAccess, type ChurchOrgAccessResult } from './church-org-access';
import { isChurchOrgSpaceRow } from './channel-publish-cadence';
import { isGrantedSpaceLeader } from './church-space-leaders';
import { canManageSpaceStructure, requireSpaceAccess, type SpaceRole } from './space-access';

type LibraryRow = typeof ResourceLibraries.$inferSelect;
export type LibraryItemRow = typeof LibraryItems.$inferSelect;
export type LibraryItemScopeRow = typeof LibraryItemScopes.$inferSelect;

/** What the routes write. `'ministry'` carries a `ChurchMinistries.id` in `ministryKey`. */
export const WRITABLE_SCOPE_KINDS = ['org', 'space', 'ministry'] as const;
export type WritableScopeKind = (typeof WRITABLE_SCOPE_KINDS)[number];

/**
 * The caller's home church org, or null when they have not connected one.
 *
 * Read from the caller's own row, never from a request parameter — this is the
 * line that makes every congregant route in this file unable to be pointed at
 * a church the caller does not belong to.
 */
async function connectedOrgIdFor(userId: string): Promise<string | null> {
  const row = first(
    await db
      .select({ connectedOrgId: UserMetadata.connectedOrgId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1),
  );
  return row?.connectedOrgId ?? null;
}

function libraryTitleFor(churchName: string): string {
  return `${churchName} Library`;
}

/** A church's library, or null before anything has been saved into it. */
export async function findChurchLibrary(churchId: string): Promise<LibraryRow | null> {
  return (
    first(
      await db
        .select()
        .from(ResourceLibraries)
        .where(
          and(eq(ResourceLibraries.ownerKind, 'church'), eq(ResourceLibraries.ownerId, churchId)),
        )
        .limit(1),
    ) ?? null
  );
}

/**
 * A church's library, created on first use.
 *
 * Same race shape as the personal one: two curators saving at once both see
 * nothing and both insert; the unique index on (ownerKind, ownerId) rejects the
 * loser, who re-reads the winner's row. A church never ends up with two.
 */
export async function ensureChurchLibrary(
  churchId: string,
  churchName: string,
): Promise<LibraryRow> {
  const existing = await findChurchLibrary(churchId);
  if (existing) return existing;

  const timestamp = new Date();
  const row: LibraryRow = {
    id: `lib_${crypto.randomUUID()}`,
    ownerKind: 'church',
    ownerId: churchId,
    title: libraryTitleFor(churchName),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    await db.insert(ResourceLibraries).values(row);
    return row;
  } catch (error) {
    const raced = await findChurchLibrary(churchId);
    if (!raced) throw error;
    return raced;
  }
}

/** A space's own library, or null before anything has been saved into it. */
export async function findSpaceLibrary(spaceId: string): Promise<LibraryRow | null> {
  return (
    first(
      await db
        .select()
        .from(ResourceLibraries)
        .where(and(eq(ResourceLibraries.ownerKind, 'space'), eq(ResourceLibraries.ownerId, spaceId)))
        .limit(1),
    ) ?? null
  );
}

/**
 * A space's own library, created on first use.
 *
 * Same lazy-create race as the church and personal ones: the unique index on
 * (ownerKind, ownerId) rejects the loser, who re-reads the winner's row.
 */
export async function ensureSpaceLibrary(
  spaceId: string,
  spaceTitle: string,
): Promise<LibraryRow> {
  const existing = await findSpaceLibrary(spaceId);
  if (existing) return existing;

  const timestamp = new Date();
  const row: LibraryRow = {
    id: `lib_${crypto.randomUUID()}`,
    ownerKind: 'space',
    ownerId: spaceId,
    title: libraryTitleFor(spaceTitle),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    await db.insert(ResourceLibraries).values(row);
    return row;
  } catch (error) {
    const raced = await findSpaceLibrary(spaceId);
    if (!raced) throw error;
    return raced;
  }
}

/** Curating the library: add, edit, scope, archive, and review suggestions. */
export async function assertCanManageChurchLibrary(
  userId: string,
  orgId: string,
): Promise<ChurchOrgAccessResult> {
  return resolveChurchOrgAccess(userId, orgId, {
    capability: 'manage_library',
    code: 'LIBRARY_ROLE_REQUIRED',
    staffError: 'Only church staff can manage this library',
    roleError: 'A pastor or admin curates this library',
    /* Writes stop when a church lapses; the reads below deliberately do not. */
    sponsorshipGated: true,
  });
}

/**
 * Staff browsing the library — the picker behind a sermon's resources, and the
 * manager's own list.
 *
 * Gated on `sermon_tools`, not `manage_library`: a teacher attaches resources
 * to what they teach without being the person who decides what is in the
 * catalog. Never sponsorship-gated.
 */
export async function assertCanViewChurchLibrary(
  userId: string,
  orgId: string,
): Promise<ChurchOrgAccessResult> {
  return resolveChurchOrgAccess(userId, orgId, {
    capability: 'sermon_tools',
    code: 'LIBRARY_STAFF_REQUIRED',
    staffError: 'Only church staff can see this library',
    roleError: 'This library is for church staff',
    sponsorshipGated: false,
  });
}

export type SpaceLibraryAccess =
  | {
      ok: true;
      /** Items live in the church's library, scoped to this room. */
      lane: 'church';
      church: { id: string; name: string; orgId: string };
      space: typeof Spaces.$inferSelect;
    }
  | {
      ok: true;
      /** Items live in the room's own library — no church behind it. */
      lane: 'space';
      church: null;
      space: typeof Spaces.$inferSelect;
    }
  | { ok: false; status: 403 | 404; error: string; code: string };

/**
 * Curating one space's shelf, in whichever lane the room has.
 *
 * A church room curates *the church's* items scoped to it: widened OR, cloned
 * from the space plan's gate — church-wide `manage_library`, **or** a granted
 * leader of this exact space. A volunteer who runs Youth curates Youth's
 * resources without a Clerk seat and without any church capability;
 * `isGrantedSpaceLeader` is the whole of what they hold, and it must never grow
 * into "is this person important".
 *
 * A Shared Space with no church behind it owns its shelf outright, and the
 * question collapses to the one the rest of the room's structure already asks:
 * `canManageSpaceStructure`. Whoever creates that room's folders and threads
 * stocks its shelf — resources are structure, not a separate privilege.
 *
 * Personal spaces get neither. A shelf is a thing a room shows other people.
 */
export async function assertCanManageSpaceLibrary(
  userId: string,
  spaceId: string,
): Promise<SpaceLibraryAccess> {
  const trimmed = spaceId.trim();
  const refusal = {
    ok: false as const,
    status: 404 as const,
    error: 'Space not found',
    code: 'SPACE_NOT_FOUND',
  };
  if (!trimmed) return refusal;

  const space = first(
    await db
      .select()
      .from(Spaces)
      .where(and(eq(Spaces.id, trimmed), isNull(Spaces.deletedAt)))
      .limit(1),
  );
  if (!space || !space.isActive) return refusal;

  /* No church behind the room: its own lane, gated by who runs the room.
     404 for a personal space rather than 403, so a probe cannot tell "not
     yours" from "does not exist". */
  if (!isChurchOrgSpaceRow(space) || !space.orgId) {
    if (space.type === 'personal') return refusal;

    let role: SpaceRole | null = null;
    try {
      ({ role } = await requireSpaceAccess(space.id, userId));
    } catch {
      /* Not a member — same refusal a stranger gets for a room that is not
         theirs, and deliberately indistinguishable from one that is gone. */
      return refusal;
    }
    if (!canManageSpaceStructure(space, role)) {
      return {
        ok: false,
        status: 403,
        error: 'Only this space’s leaders can change its resources',
        code: 'LIBRARY_SPACE_ROLE_REQUIRED',
      };
    }
    return { ok: true, lane: 'space', church: null, space };
  }

  const church = first(
    await db
      .select({ id: Churches.id, name: Churches.name, orgId: Churches.orgId })
      .from(Churches)
      .where(and(eq(Churches.orgId, space.orgId), eq(Churches.isActive, true)))
      .limit(1),
  );
  if (!church) return refusal;

  const viaCapability = await assertCanManageChurchLibrary(userId, space.orgId);
  if (viaCapability.ok) return { ok: true, lane: 'church', church, space };

  if (await isGrantedSpaceLeader(userId, space.id)) {
    return { ok: true, lane: 'church', church, space };
  }

  return {
    ok: false,
    status: 403,
    error: 'Only this space’s leaders can change its resources',
    code: 'LIBRARY_SPACE_ROLE_REQUIRED',
  };
}

/**
 * Every church-org space the caller belongs to — the space scopes they can see — and the live
 * ministries those spaces are in, which are the ministry scopes they can see. Belonging to a
 * ministry is being in one of its groups or following one of its channels; an archived ministry
 * counts for nobody.
 */
async function memberScopesForChurch(
  userId: string,
  orgId: string,
): Promise<{ memberSpaceIds: string[]; memberMinistryIds: string[] }> {
  const rows = await db
    .select({ spaceId: SpaceMemberships.spaceId, ministryId: Spaces.ministryId })
    .from(SpaceMemberships)
    .innerJoin(Spaces, eq(Spaces.id, SpaceMemberships.spaceId))
    .where(and(eq(SpaceMemberships.userId, userId), eq(Spaces.orgId, orgId), isNull(Spaces.deletedAt)));
  const ministryIds = [...new Set(rows.map((r) => r.ministryId).filter((id): id is string => Boolean(id)))];
  const live = ministryIds.length
    ? await db
        .select({ id: ChurchMinistries.id })
        .from(ChurchMinistries)
        .where(and(inArray(ChurchMinistries.id, ministryIds), eq(ChurchMinistries.orgId, orgId), isNull(ChurchMinistries.archivedAt)))
    : [];
  return { memberSpaceIds: rows.map((r) => r.spaceId), memberMinistryIds: live.map((m) => m.id) };
}

export type ChurchLibraryViewer =
  | { kind: 'none' }
  | {
      kind: 'congregant' | 'staff';
      church: { id: string; name: string; orgId: string };
      /** Space ids whose scoped items this viewer may see. */
      memberSpaceIds: string[];
      /** Live ministries this viewer belongs to, through a group or a followed channel. */
      memberMinistryIds: string[];
      /** Staff and granted leaders see `access: 'leaders'` items. */
      seesLeaderOnly: boolean;
    };

/**
 * What the caller may see of their own church's library.
 *
 * The church is derived from the caller (`connectedOrgIdFor`), never taken from
 * a request parameter — the same rule every congregant route in this codebase
 * follows, and the reason none of them can be pointed at another church.
 */
export async function resolveChurchLibraryViewer(userId: string): Promise<ChurchLibraryViewer> {
  const orgId = await connectedOrgIdFor(userId);
  if (!orgId) return { kind: 'none' };

  const church = first(
    await db
      .select({ id: Churches.id, name: Churches.name, orgId: Churches.orgId })
      .from(Churches)
      .where(and(eq(Churches.orgId, orgId), eq(Churches.isActive, true)))
      .limit(1),
  );
  if (!church) return { kind: 'none' };

  const staff = await assertCanViewChurchLibrary(userId, orgId);
  const { memberSpaceIds, memberMinistryIds } = await memberScopesForChurch(userId, orgId);
  return {
    kind: staff.ok ? 'staff' : 'congregant',
    church,
    memberSpaceIds,
    memberMinistryIds,
    seesLeaderOnly: staff.ok,
  };
}

/**
 * Does this viewer's standing admit an item, given its scopes?
 *
 * An item with **no** scope rows is org-wide — that is the shape a suggestion
 * approval and a plain "add to the library" produce, and treating an unscoped
 * item as invisible would make the common case the broken one.
 */
export function scopesAdmitViewer(
  scopes: readonly Pick<LibraryItemScopeRow, 'scopeKind' | 'spaceId' | 'ministryKey'>[],
  memberSpaceIds: readonly string[],
  isStaff: boolean,
  memberMinistryIds: readonly string[] = [],
): boolean {
  if (scopes.length === 0) return true;
  if (scopes.some((s) => s.scopeKind === 'org')) return true;
  /* Staff see the whole catalog: they are the people asked "do we have
     anything on this?", and an answer that depends on which spaces they
     happen to have joined is not an answer. */
  if (isStaff) return true;
  return scopes.some(
    (s) =>
      (s.scopeKind === 'space' && s.spaceId != null && memberSpaceIds.includes(s.spaceId)) ||
      (s.scopeKind === 'ministry' && s.ministryKey != null && memberMinistryIds.includes(s.ministryKey)),
  );
}

/** Scope rows for a batch of items, keyed by item id. */
export async function scopesByItemIds(
  itemIds: readonly string[],
): Promise<Map<string, LibraryItemScopeRow[]>> {
  const out = new Map<string, LibraryItemScopeRow[]>();
  if (itemIds.length === 0) return out;
  const rows = await db
    .select()
    .from(LibraryItemScopes)
    .where(inArray(LibraryItemScopes.libraryItemId, [...itemIds]));
  for (const row of rows) {
    const list = out.get(row.libraryItemId);
    if (list) list.push(row);
    else out.set(row.libraryItemId, [row]);
  }
  return out;
}

/**
 * One item the caller may open, or null — the read chokepoint for every shared
 * surface (dock chips, mention pills, signed file URLs).
 *
 * Personal ownership is checked first and cheaply, because that is the
 * overwhelming majority of resolutions and it needs no church lookup at all.
 */
export async function resolveVisibleItem(
  userId: string,
  itemId: string,
): Promise<LibraryItemRow | null> {
  const owned = first(
    await db
      .select({ item: LibraryItems })
      .from(LibraryItems)
      .innerJoin(ResourceLibraries, eq(LibraryItems.libraryId, ResourceLibraries.id))
      .where(
        and(
          eq(LibraryItems.id, itemId),
          eq(ResourceLibraries.ownerKind, 'user'),
          eq(ResourceLibraries.ownerId, userId),
        ),
      )
      .limit(1),
  )?.item;
  if (owned) return owned;

  /* A room's own shelf. Membership in that room is the whole check — a
     space-owned item carries no audience or scope rows, because the room it
     belongs to is already the answer to both. */
  const spaceOwned = first(
    await db
      .select({ item: LibraryItems, spaceId: ResourceLibraries.ownerId })
      .from(LibraryItems)
      .innerJoin(ResourceLibraries, eq(LibraryItems.libraryId, ResourceLibraries.id))
      .where(and(eq(LibraryItems.id, itemId), eq(ResourceLibraries.ownerKind, 'space')))
      .limit(1),
  );
  if (spaceOwned) {
    const membership = first(
      await db
        .select({ id: SpaceMemberships.id })
        .from(SpaceMemberships)
        .where(
          and(
            eq(SpaceMemberships.spaceId, spaceOwned.spaceId),
            eq(SpaceMemberships.userId, userId),
          ),
        )
        .limit(1),
    );
    return membership ? spaceOwned.item : null;
  }

  const viewer = await resolveChurchLibraryViewer(userId);
  if (viewer.kind === 'none') return null;

  const candidate = first(
    await db
      .select({ item: LibraryItems })
      .from(LibraryItems)
      .innerJoin(ResourceLibraries, eq(LibraryItems.libraryId, ResourceLibraries.id))
      .where(
        and(
          eq(LibraryItems.id, itemId),
          eq(ResourceLibraries.ownerKind, 'church'),
          eq(ResourceLibraries.ownerId, viewer.church.id),
        ),
      )
      .limit(1),
  )?.item;
  if (!candidate) return null;

  const scopes = (await scopesByItemIds([candidate.id])).get(candidate.id) ?? [];

  /* Leaders-only: staff, or a granted leader of a room the item shows in. The room shelf already
     showed those leaders the item (church-space-library.ts); opening it used to 404 for them. */
  if (candidate.access === 'leaders' && !viewer.seesLeaderOnly) {
    return (await grantedLeaderSeesItem(userId, viewer.church.orgId, scopes)) ? candidate : null;
  }

  if (!scopesAdmitViewer(scopes, viewer.memberSpaceIds, viewer.seesLeaderOnly, viewer.memberMinistryIds)) return null;

  return candidate;
}

/**
 * Whether this person is a granted leader of a room where an item with these scopes shows: an
 * org-wide item shows in every room, a space-scoped one in its room, a ministry-scoped one in
 * every room of that ministry.
 */
async function grantedLeaderSeesItem(
  userId: string,
  orgId: string,
  scopes: readonly LibraryItemScopeRow[],
): Promise<boolean> {
  const rooms = await db
    .select({ spaceId: Spaces.id, ministryId: Spaces.ministryId })
    .from(SpaceMemberships)
    .innerJoin(Spaces, eq(Spaces.id, SpaceMemberships.spaceId))
    .where(
      and(
        eq(SpaceMemberships.userId, userId),
        eq(SpaceMemberships.role, 'leader'),
        eq(SpaceMemberships.grantSource, 'grant'),
        eq(Spaces.orgId, orgId),
        isNull(Spaces.deletedAt),
      ),
    );
  if (rooms.length === 0) return false;
  if (scopes.length === 0 || scopes.some((s) => s.scopeKind === 'org')) return true;
  return rooms.some((room) =>
    scopes.some(
      (s) =>
        (s.scopeKind === 'space' && s.spaceId === room.spaceId) ||
        (s.scopeKind === 'ministry' && room.ministryId != null && s.ministryKey === room.ministryId),
    ),
  );
}
