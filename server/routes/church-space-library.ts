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
import {
  canManageSpaceStructure,
  requireSpaceAccess,
  SpaceAccessError,
} from '../utils/space-access';
import { isChurchOrgSpaceRow } from '../utils/channel-publish-cadence';
import {
  assertCanManageSpaceLibrary,
  ensureChurchLibrary,
  ensureSpaceLibrary,
  findChurchLibrary,
  findSpaceLibrary,
  scopesByItemIds,
  assertCanViewChurchLibrary,
  type LibraryItemRow,
  type LibraryItemScopeRow,
} from '../utils/church-library-access';
import { isGrantedSpaceLeader } from '../utils/church-space-leaders';
import {
  isLibraryFileStorageConfigured,
  sanitizeLibraryFileName,
  uploadLibraryFile,
  LIBRARY_FILE_MAX_BYTES,
} from '../utils/library-file-upload';

const app = new Hono();

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 1000;

function clean(value: unknown, max: number): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

type PinRow = typeof LibraryItemSpacePins.$inferSelect;

/** Pinned first in the curator's order, then the rest by recency. */
function sortShelf(items: { pinned: boolean; sortOrder: number; updatedAt: unknown }[]) {
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) return a.sortOrder - b.sortOrder;
    return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
  });
}

function serializeSpaceItem(
  row: LibraryItemRow,
  scopes: readonly LibraryItemScopeRow[],
  pin: PinRow | undefined,
  /** Forced true in the space-owned lane, where ownership is the library itself. */
  ownedOverride?: boolean,
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
    ownedByThisSpace: ownedOverride ?? scopes.some((s) => s.scopeKind === 'space'),
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

    const { space, role } = await requireSpaceAccess(spaceId, auth.userId);
    /* No church behind the room: it owns its shelf outright. A personal space
       still answers empty — a shelf is a thing a room shows other people. */
    if (!isChurchOrgSpaceRow(space) || !space.orgId) {
      if (space.type === 'personal') {
        return c.json({
          space: { id: space.id, title: space.title },
          items: [],
          canManage: false,
        });
      }

      const ownLibrary = await findSpaceLibrary(space.id);
      const ownItems = ownLibrary
        ? await db
            .select()
            .from(LibraryItems)
            .where(and(eq(LibraryItems.libraryId, ownLibrary.id), isNull(LibraryItems.archivedAt)))
            .orderBy(desc(LibraryItems.updatedAt))
        : [];
      const ownPins = new Map(
        (
          await db
            .select()
            .from(LibraryItemSpacePins)
            .where(eq(LibraryItemSpacePins.spaceId, space.id))
        ).map((p) => [p.libraryItemId, p]),
      );

      const ownSerialized = ownItems.map((item) =>
        serializeSpaceItem(item, [], ownPins.get(item.id), true),
      );
      sortShelf(ownSerialized);

      return c.json({
        space: { id: space.id, title: space.title },
        items: ownSerialized,
        canManage: canManageSpaceStructure(space, role),
      });
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
    sortShelf(serialized);

    return c.json({
      space: { id: space.id, title: space.title },
      items: serialized,
      /* Asked of the same chokepoint the write routes use. Deliberately not
         `seesLeaderOnly`: that is `sermon_tools`, so a teacher who may read
         leaders-only material still may not curate the shelf. */
      canManage: (await assertCanManageSpaceLibrary(auth.userId, space.id)).ok,
    });
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

      const library =
        gate.lane === 'church'
          ? await ensureChurchLibrary(gate.church.id, gate.church.name)
          : await ensureSpaceLibrary(gate.space.id, gate.space.title);
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
        /* Only the church lane needs a scope row. In the space lane the
           owning library *is* the scope, and a second statement of it could
           disagree with the first. */
        if (gate.lane === 'church') {
          await tx.insert(LibraryItemScopes).values({
            id: `libsc_${crypto.randomUUID()}`,
            libraryItemId: row.id,
            scopeKind: 'space',
            spaceId: gate.space.id,
            ministryKey: null,
            createdAt: timestamp,
          });
        }
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

      return c.json({
        success: true,
        item: serializeSpaceItem(row, [], undefined, gate.lane === 'space' ? true : undefined),
      });
    } catch (error) {
      const standardError = handleAPIError(error, {
        endpoint: '/api/church/spaces/[spaceId]/library/items/create',
        action: 'space_library_create',
      });
      return c.json({ error: standardError.message, code: standardError.code }, 500);
    }
  },
);

// ─── POST /api/church/spaces/:spaceId/library/items/upload ──────────────────
/**
 * A leader attaching a file to their own room — `create`'s sibling, sourced
 * from an upload rather than a URL.
 *
 * Scoping is not a field here for the same reason it is not one on `create`:
 * the room in the path is the scope, in both lanes. Nothing a leader can send
 * reaches the rest of the church.
 *
 * The upload runs before the insert, as the org lane does: an orphan object in
 * the bucket is a bounded cost, a row pointing at an object that never stored
 * is a resource nobody can open.
 */
app.post(
  '/api/church/spaces/:spaceId/library/items/upload',
  requireAuth,
  rateLimit('write'),
  async (c) => {
    try {
      const auth = getAuthenticatedAuth(c);

      if (!isLibraryFileStorageConfigured()) {
        return c.json(
          { error: 'File storage is not configured', code: 'STORAGE_UNAVAILABLE' },
          503,
        );
      }

      const gate = await assertCanManageSpaceLibrary(auth.userId, c.req.param('spaceId') ?? '');
      if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

      const formData = await c.req.formData();
      const file = formData.get('file');
      if (!(file instanceof File)) {
        return c.json({ error: 'A file is required', code: 'MISSING_FILE' }, 400);
      }
      if (file.size > LIBRARY_FILE_MAX_BYTES) {
        return c.json(
          { error: 'File is larger than 50MB — link to it instead', code: 'FILE_TOO_LARGE' },
          413,
        );
      }

      const fileName = sanitizeLibraryFileName(file.name || 'file');
      const library =
        gate.lane === 'church'
          ? await ensureChurchLibrary(gate.church.id, gate.church.name)
          : await ensureSpaceLibrary(gate.space.id, gate.space.title);
      const itemId = `libi_${crypto.randomUUID()}`;

      const bytes = Buffer.from(await file.arrayBuffer());
      const uploaded = await uploadLibraryFile({
        userId: auth.userId,
        itemId,
        fileName,
        bytes,
        mimeType: file.type || 'application/octet-stream',
      });
      if (!uploaded.ok) {
        return c.json({ error: uploaded.error, code: 'UPLOAD_FAILED' }, uploaded.status);
      }

      const titleField = formData.get('title');
      const descriptionField = formData.get('description');
      const timestamp = new Date();
      const row = {
        id: itemId,
        libraryId: library.id,
        kind: 'file',
        // Filename minus extension beats "file" when nobody typed a title.
        title:
          clean(typeof titleField === 'string' ? titleField : null, TITLE_MAX_LENGTH) ??
          fileName.replace(/\.[^.]+$/, '') ??
          fileName,
        description: clean(
          typeof descriptionField === 'string' ? descriptionField : null,
          DESCRIPTION_MAX_LENGTH,
        ),
        sourceUrl: null,
        sourceDomain: null,
        sourceSiteName: null,
        sourceImage: null,
        fileStorageKey: uploaded.storageKey,
        fileName,
        fileMime: file.type.split(';')[0].trim().toLowerCase() || null,
        fileBytes: bytes.length,
        access: 'members',
        createdByUserId: auth.userId,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
      };

      await db.transaction(async (tx) => {
        await tx.insert(LibraryItems).values(row);
        if (gate.lane === 'church') {
          await tx.insert(LibraryItemScopes).values({
            id: `libsc_${crypto.randomUUID()}`,
            libraryItemId: row.id,
            scopeKind: 'space',
            spaceId: gate.space.id,
            ministryKey: null,
            createdAt: timestamp,
          });
        }
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

      return c.json({
        success: true,
        item: serializeSpaceItem(row, [], undefined, gate.lane === 'space' ? true : undefined),
      });
    } catch (error) {
      const standardError = handleAPIError(error, {
        endpoint: '/api/church/spaces/[spaceId]/library/items/upload',
        action: 'space_library_upload',
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

      /* Must belong to the library this room curates from — otherwise a leader
         could pin a row off another church's (or another room's) shelf. */
      const library =
        gate.lane === 'church'
          ? await findChurchLibrary(gate.church.id)
          : await findSpaceLibrary(gate.space.id);
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

// ─── POST /api/church/spaces/:spaceId/library/items/archive ─────────────────
/**
 * Taking a resource off this room's shelf.
 *
 * Only what the room *owns*. An org-wide item is the church's, and a leader who
 * could archive one would be deleting it out from under every other room that
 * shows it — unpinning is what "not this one, not here" means for those, and
 * `pins/set` already says it.
 *
 * Soft, like both other lanes: a note that already cites the item degrades to a
 * dead-but-labelled chip rather than a 404.
 */
app.post(
  '/api/church/spaces/:spaceId/library/items/archive',
  requireAuth,
  rateLimit('write'),
  async (c) => {
    try {
      const auth = getAuthenticatedAuth(c);
      const spaceId = c.req.param('spaceId') ?? '';
      const gate = await assertCanManageSpaceLibrary(auth.userId, spaceId);
      if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

      const body = (await c.req.json().catch(() => ({}))) as { id?: string };
      const itemId = clean(body.id, 200);
      if (!itemId) return c.json({ error: 'id is required', code: 'BAD_REQUEST' }, 400);

      /* The room's own shelf, not the church's. A church-lane space still has
         one only once something has been put on it, so a missing library is a
         legitimate "nothing of yours to archive" rather than an error. */
      const library = await findSpaceLibrary(gate.space.id);
      const existing = library
        ? first(
            await db
              .select({ id: LibraryItems.id })
              .from(LibraryItems)
              .where(and(eq(LibraryItems.id, itemId), eq(LibraryItems.libraryId, library.id)))
              .limit(1),
          )
        : undefined;
      if (!existing) {
        return c.json(
          { error: 'That resource is not this space\'s to remove', code: 'ITEM_NOT_FOUND' },
          404,
        );
      }

      const now = new Date();
      await db
        .update(LibraryItems)
        .set({ archivedAt: now, updatedAt: now })
        .where(eq(LibraryItems.id, itemId));
      /* The pin row would otherwise keep ordering a shelf slot for an item that
         is no longer on it. */
      await db
        .delete(LibraryItemSpacePins)
        .where(
          and(
            eq(LibraryItemSpacePins.spaceId, gate.space.id),
            eq(LibraryItemSpacePins.libraryItemId, itemId),
          ),
        );

      return c.json({ success: true });
    } catch (error) {
      const standardError = handleAPIError(error, {
        endpoint: '/api/church/spaces/[spaceId]/library/items/archive',
        action: 'space_library_archive',
      });
      return c.json({ error: standardError.message, code: standardError.code }, 500);
    }
  },
);

export default app;
