/**
 * One space's shelf — what a room surfaces from the church's library.
 *
 * The space lane exists because the person who knows which commentary Youth
 * should read is the person who runs Youth, and they are usually not staff.
 * `assertCanManageSpaceLibrary` widens to a granted leader of *this* space,
 * exactly as the space teaching plan does — that is the whole reason granted
 * leaders exist.
 *
 * Two things a leader deliberately cannot do:
 *   - **Create an org-wide item.** Scoping is forced to this space; a leader
 *     curating their own room must not be able to change what the rest of the
 *     church sees.
 *   - **Edit an org item's own fields.** They can un-pin one from their space
 *     (`pinned: false`), which is a statement about their room, not about the
 *     item.
 *
 * Addressed by `spaceId` in the path with the church derived from the space —
 * the church-space-plan pattern — so a caller can never name a church that does
 * not own the room they are editing.
 */
import { Hono } from 'hono';
import {
  db,
  first,
  and,
  eq,
  desc,
  isNull,
  Churches,
  LibraryItems,
  LibraryItemScopes,
  LibraryItemSpacePins,
} from '../db';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { validateResourceUrl, extractDomain } from '@/utils/validation';
import { requireSpaceAccess, SpaceAccessError } from '../utils/space-access';
import { isChurchOrgSpaceRow } from '../utils/channel-publish-cadence';
import {
  assertCanManageSpaceLibrary,
  ensureChurchLibrary,
  findChurchLibrary,
  scopesByItemIds,
  assertCanViewChurchLibrary,
  type LibraryItemRow,
  type LibraryItemScopeRow,
} from '../utils/church-library-access';
import { isGrantedSpaceLeader } from '../utils/church-space-leaders';

const app = new Hono();

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 1000;

function clean(value: unknown, max: number): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

type PinRow = typeof LibraryItemSpacePins.$inferSelect;

function serializeSpaceItem(
  row: LibraryItemRow,
  scopes: readonly LibraryItemScopeRow[],
  pin: PinRow | undefined,
) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    sourceUrl: row.sourceUrl,
    sourceDomain: row.sourceDomain,
    sourceSiteName: row.sourceSiteName,
    sourceImage: row.sourceImage,
    fileName: row.fileName,
    fileMime: row.fileMime,
    fileBytes: row.fileBytes,
    access: row.access,
    /** True when this space itself scoped the item, vs inheriting it org-wide. */
    ownedByThisSpace: scopes.some((s) => s.scopeKind === 'space'),
    pinned: pin?.pinned ?? false,
    sortOrder: pin?.sortOrder ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── GET /api/spaces/:spaceId/library ───────────────────────────────────────
/**
 * What this room offers: its own items plus the church's org-wide ones.
 *
 * Pinned first in the leader's order, then the rest by recency — a leader's
 * ordering is a teaching decision and should not be re-sorted by activity.
 * `pinned: false` rows suppress an org-wide default without touching it.
 *
 * Read gate is space membership. Not sponsorship-gated.
 */
app.get('/api/spaces/:spaceId/library', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceId = c.req.param('spaceId') ?? '';

    const { space } = await requireSpaceAccess(spaceId, auth.userId);
    /* A personal or non-church space has no church library behind it. Empty
       rather than an error: the caller asked a reasonable question. */
    if (!isChurchOrgSpaceRow(space) || !space.orgId) {
      return c.json({ space: { id: space.id, title: space.title }, items: [] });
    }

    const staff = await assertCanViewChurchLibrary(auth.userId, space.orgId);
    const seesLeaderOnly = staff.ok || (await isGrantedSpaceLeader(auth.userId, space.id));

    /*
      Resolved from the space's org, not from the staff gate: a congregant
      member has no staff gate to resolve a church id from, and they are the
      majority of readers here.
    */
    const churchLibrary = await findChurchLibraryForOrg(space.orgId);

    /** Items this room scoped for itself, as opposed to inheriting org-wide. */
    const scopedIds = (
      await db
        .select({ itemId: LibraryItemScopes.libraryItemId })
        .from(LibraryItemScopes)
        .where(and(eq(LibraryItemScopes.scopeKind, 'space'), eq(LibraryItemScopes.spaceId, space.id)))
    ).map((r) => r.itemId);

    const orgItems = churchLibrary
      ? await db
          .select()
          .from(LibraryItems)
          .where(and(eq(LibraryItems.libraryId, churchLibrary.id), isNull(LibraryItems.archivedAt)))
          .orderBy(desc(LibraryItems.updatedAt))
      : [];

    const scopes = await scopesByItemIds(orgItems.map((i) => i.id));
    const pins = churchLibrary
      ? await db
          .select()
          .from(LibraryItemSpacePins)
          .where(eq(LibraryItemSpacePins.spaceId, space.id))
      : [];
    const pinById = new Map(pins.map((p) => [p.libraryItemId, p]));

    const visible = orgItems.filter((item) => {
      if (item.access === 'leaders' && !seesLeaderOnly) return false;
      const itemScopes = scopes.get(item.id) ?? [];
      const orgWide = itemScopes.length === 0 || itemScopes.some((s) => s.scopeKind === 'org');
      const thisSpace = scopedIds.includes(item.id);
      if (!orgWide && !thisSpace) return false;
      /* An explicit un-pin hides an org default here without editing it. */
      const pin = pinById.get(item.id);
      if (orgWide && !thisSpace && pin && !pin.pinned) return false;
      return true;
    });

    const serialized = visible.map((item) =>
      serializeSpaceItem(item, scopes.get(item.id) ?? [], pinById.get(item.id)),
    );
    serialized.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.pinned && b.pinned) return a.sortOrder - b.sortOrder;
      return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
    });

    return c.json({ space: { id: space.id, title: space.title }, items: serialized });
  } catch (error) {
    if (error instanceof SpaceAccessError) {
      return c.json({ error: error.message, code: 'SPACE_ACCESS' }, error.status);
    }
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/library',
      action: 'space_library_list',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** The church library that owns a given org's items, or null. */
async function findChurchLibraryForOrg(orgId: string) {
  const church = first(
    await db
      .select({ id: Churches.id })
      .from(Churches)
      .where(and(eq(Churches.orgId, orgId), eq(Churches.isActive, true)))
      .limit(1),
  );
  return church ? findChurchLibrary(church.id) : null;
}

// ─── POST /api/church/spaces/:spaceId/library/items/create ──────────────────
/**
 * A leader adding a resource for their own room.
 *
 * Scope is forced to this space rather than taken from the body: a leader who
 * could pass `scopeKind: 'org'` would be able to publish to the whole church
 * from a room they happen to run.
 */
app.post(
  '/api/church/spaces/:spaceId/library/items/create',
  requireAuth,
  rateLimit('write'),
  async (c) => {
    try {
      const auth = getAuthenticatedAuth(c);
      const gate = await assertCanManageSpaceLibrary(auth.userId, c.req.param('spaceId') ?? '');
      if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

      const body = (await c.req.json().catch(() => ({}))) as {
        url?: string;
        title?: string;
        description?: string;
        siteName?: string;
        image?: string;
        access?: string;
      };

      const validation = validateResourceUrl(String(body.url ?? ''));
      if (!validation.isValid || !validation.normalizedUrl) {
        return c.json(
          { error: validation.error || 'Invalid URL', code: validation.code || 'INVALID_URL' },
          400,
        );
      }
      const sourceUrl = validation.normalizedUrl;

      const library = await ensureChurchLibrary(gate.church.id, gate.church.name);
      const timestamp = new Date();
      const row = {
        id: `libi_${crypto.randomUUID()}`,
        libraryId: library.id,
        kind: 'link',
        title: clean(body.title, TITLE_MAX_LENGTH) ?? extractDomain(sourceUrl) ?? sourceUrl,
        description: clean(body.description, DESCRIPTION_MAX_LENGTH),
        sourceUrl,
        sourceDomain: extractDomain(sourceUrl),
        sourceSiteName: clean(body.siteName, TITLE_MAX_LENGTH),
        sourceImage: clean(body.image, 2000),
        fileStorageKey: null,
        fileName: null,
        fileMime: null,
        fileBytes: null,
        access: body.access === 'leaders' ? 'leaders' : 'members',
        createdByUserId: auth.userId,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
      };

      await db.transaction(async (tx) => {
        await tx.insert(LibraryItems).values(row);
        await tx.insert(LibraryItemScopes).values({
          id: `libsc_${crypto.randomUUID()}`,
          libraryItemId: row.id,
          scopeKind: 'space',
          spaceId: gate.space.id,
          ministryKey: null,
          createdAt: timestamp,
        });
        /* Its own room's item starts pinned — a leader who added it meant it
           to be seen, and making them pin it twice is a step with no decision
           in it. */
        await tx.insert(LibraryItemSpacePins).values({
          id: `libp_${crypto.randomUUID()}`,
          spaceId: gate.space.id,
          libraryItemId: row.id,
          pinned: true,
          sortOrder: 0,
          pinnedByUserId: auth.userId,
          pinnedAt: timestamp,
        });
      });

      return c.json({ success: true, item: serializeSpaceItem(row, [], undefined) });
    } catch (error) {
      const standardError = handleAPIError(error, {
        endpoint: '/api/church/spaces/[spaceId]/library/items/create',
        action: 'space_library_create',
      });
      return c.json({ error: standardError.message, code: standardError.code }, 500);
    }
  },
);

// ─── POST /api/church/spaces/:spaceId/library/pins/set ──────────────────────
/**
 * What this room surfaces, and in what order.
 *
 * `pinned: false` is a real row, not a delete: it is how a leader says "not
 * this one, not here" about an org-wide item they cannot edit.
 */
app.post(
  '/api/church/spaces/:spaceId/library/pins/set',
  requireAuth,
  rateLimit('write'),
  async (c) => {
    try {
      const auth = getAuthenticatedAuth(c);
      const gate = await assertCanManageSpaceLibrary(auth.userId, c.req.param('spaceId') ?? '');
      if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

      const body = (await c.req.json().catch(() => ({}))) as {
        itemId?: string;
        pinned?: boolean;
        sortOrder?: number;
      };
      const itemId = clean(body.itemId, 200);
      if (!itemId) return c.json({ error: 'itemId is required', code: 'BAD_REQUEST' }, 400);

      /* Must be this church's item — otherwise a leader could pin a row from
         another church's shelf into their room. */
      const library = await findChurchLibrary(gate.church.id);
      const item = library
        ? first(
            await db
              .select({ id: LibraryItems.id })
              .from(LibraryItems)
              .where(and(eq(LibraryItems.id, itemId), eq(LibraryItems.libraryId, library.id)))
              .limit(1),
          )
        : undefined;
      if (!item) return c.json({ error: 'Resource not found', code: 'ITEM_NOT_FOUND' }, 404);

      const pinned = body.pinned !== false;
      const sortOrder = Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0;
      const timestamp = new Date();

      await db
        .insert(LibraryItemSpacePins)
        .values({
          id: `libp_${crypto.randomUUID()}`,
          spaceId: gate.space.id,
          libraryItemId: itemId,
          pinned,
          sortOrder,
          pinnedByUserId: auth.userId,
          pinnedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: [LibraryItemSpacePins.spaceId, LibraryItemSpacePins.libraryItemId],
          set: { pinned, sortOrder, pinnedByUserId: auth.userId, pinnedAt: timestamp },
        });

      return c.json({ success: true });
    } catch (error) {
      const standardError = handleAPIError(error, {
        endpoint: '/api/church/spaces/[spaceId]/library/pins/set',
        action: 'space_library_pin',
      });
      return c.json({ error: standardError.message, code: standardError.code }, 500);
    }
  },
);

export default app;
