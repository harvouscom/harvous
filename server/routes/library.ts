/**
 * Resource Library — personal libraries, link items.
 *
 * A library is a catalog of study resources belonging to one owner. Personal
 * ('user') and church ('church') libraries share these tables and these
 * surfaces; only the permission check differs. Today only the personal lane is
 * reachable — every endpoint here resolves the caller's own library and refuses
 * anything else. Church-owned libraries, scopes, and per-space pins land next
 * (see docs/future/RESOURCE_LIBRARY.md).
 *
 * Not to be confused with /api/resource/*, which serves bookmark *notes*
 * (`Notes.noteType = 'resource'` + ResourceMetadata). Different product, kept
 * deliberately: a library item is a catalog entry, not a note.
 *
 * Endpoints:
 *   GET  /api/library
 *   GET  /api/library/items/:id
 *   GET  /api/library/items/:id/file
 *   POST /api/library/items/create
 *   POST /api/library/items/upload
 *   POST /api/library/items/update
 *   POST /api/library/items/archive
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import {
  db,
  first,
  ResourceLibraries,
  LibraryItems,
  eq,
  and,
  isNull,
  desc,
} from '../db';
import { now } from '../db/dates';
import { isUniqueViolationError } from '../utils/db-errors';
import {
  uploadLibraryFile,
  signedLibraryFileUrl,
  isLibraryFileStorageConfigured,
  sanitizeLibraryFileName,
  LIBRARY_FILE_MAX_BYTES,
} from '../utils/library-file-upload';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit } from '@/utils/rate-limit';
import { validateResourceUrl, extractDomain } from '@/utils/validation';

const app = new Hono();

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 1000;
const DEFAULT_PERSONAL_LIBRARY_TITLE = 'My Library';

type LibraryRow = typeof ResourceLibraries.$inferSelect;
type LibraryItemRow = typeof LibraryItems.$inferSelect;

function serializeItem(row: LibraryItemRow) {
  return {
    id: row.id,
    libraryId: row.libraryId,
    kind: row.kind,
    title: row.title,
    description: row.description,
    sourceUrl: row.sourceUrl,
    sourceDomain: row.sourceDomain,
    sourceSiteName: row.sourceSiteName,
    sourceImage: row.sourceImage,
    // fileStorageKey stays server-side — clients open files via /items/:id/file.
    fileName: row.fileName,
    fileMime: row.fileMime,
    fileBytes: row.fileBytes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The caller's personal library, or null when they haven't saved anything yet. */
async function findPersonalLibrary(userId: string): Promise<LibraryRow | null> {
  return (
    first(
      await db
        .select()
        .from(ResourceLibraries)
        .where(and(eq(ResourceLibraries.ownerKind, 'user'), eq(ResourceLibraries.ownerId, userId)))
        .limit(1),
    ) ?? null
  );
}

/**
 * The caller's personal library, creating it on first use.
 *
 * Two clients saving their first item at once both see no library and both
 * insert. The unique index on (ownerKind, ownerId) rejects the loser, who then
 * re-reads the winner's row — an account never ends up with two libraries.
 */
async function ensurePersonalLibrary(userId: string): Promise<LibraryRow> {
  const existing = await findPersonalLibrary(userId);
  if (existing) return existing;

  const timestamp = now();
  const row: LibraryRow = {
    id: `lib_${crypto.randomUUID()}`,
    ownerKind: 'user',
    ownerId: userId,
    title: DEFAULT_PERSONAL_LIBRARY_TITLE,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    await db.insert(ResourceLibraries).values(row);
    return row;
  } catch (error) {
    if (!isUniqueViolationError(error)) throw error;
    const raced = await findPersonalLibrary(userId);
    if (!raced) throw error;
    return raced;
  }
}

/**
 * A library item the caller owns, or null.
 *
 * Ownership is resolved through the library rather than trusted from the
 * request, so this is also the check that keeps one user's items out of
 * another's dock chips and mention pills. Archived items still resolve —
 * pills that already cite them should degrade gracefully, not 404.
 */
async function findOwnedItem(userId: string, itemId: string): Promise<LibraryItemRow | null> {
  return (
    first(
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
    )?.item ?? null
  );
}

function normalizeTitle(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  const chosen = text || fallback;
  return chosen.slice(0, TITLE_MAX_LENGTH);
}

function normalizeDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, DESCRIPTION_MAX_LENGTH) : null;
}

function normalizeOptionalText(value: unknown, maxLength = TITLE_MAX_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

/** GET /api/library — the caller's library and its live items. */
app.get('/api/library', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const library = await findPersonalLibrary(auth.userId);
    if (!library) return c.json({ library: null, items: [] });

    const items = await db
      .select()
      .from(LibraryItems)
      .where(and(eq(LibraryItems.libraryId, library.id), isNull(LibraryItems.archivedAt)))
      .orderBy(desc(LibraryItems.updatedAt), desc(LibraryItems.createdAt));

    return c.json({
      library: { id: library.id, ownerKind: library.ownerKind, title: library.title },
      items: items.map(serializeItem),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/library',
      action: 'list_library_items',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * GET /api/library/items/:id — resolve a single item.
 *
 * Backs dock chips and `@` library mention pills. A pill carries only an id and
 * a frozen label, so this is where a stale or foreign reference fails closed.
 */
app.get('/api/library/items/:id', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const id = requireParam(c, 'id');

    const item = await findOwnedItem(auth.userId, id);
    if (!item) return c.json({ error: 'Library item not found', code: 'NOT_FOUND' }, 404);

    return c.json({ item: serializeItem(item), archived: item.archivedAt !== null });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/library/items/[id]',
      action: 'get_library_item',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * POST /api/library/items/create — save a link.
 *
 * The client fetches OG metadata from /api/resource/metadata first and posts
 * what it got; the URL is re-validated and re-normalized here regardless, since
 * a client-supplied `url` is the one field that reaches other surfaces.
 */
app.post('/api/library/items/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();

    const validation = validateResourceUrl(body?.url);
    if (!validation.isValid || !validation.normalizedUrl) {
      return c.json(
        { error: validation.error || 'Invalid URL', code: validation.code || 'INVALID_URL' },
        400,
      );
    }

    const normalizedUrl = validation.normalizedUrl;
    const domain = extractDomain(normalizedUrl);
    const library = await ensurePersonalLibrary(auth.userId);

    // Soft duplicate check, mirroring /api/resource/check-duplicate: report the
    // existing item instead of refusing, and let the client decide.
    const duplicate = first(
      await db
        .select()
        .from(LibraryItems)
        .where(
          and(
            eq(LibraryItems.libraryId, library.id),
            eq(LibraryItems.sourceUrl, normalizedUrl),
            isNull(LibraryItems.archivedAt),
          ),
        )
        .limit(1),
    );
    if (duplicate) {
      return c.json({ success: true, duplicate: true, item: serializeItem(duplicate) });
    }

    const timestamp = now();
    const row: LibraryItemRow = {
      id: `libi_${crypto.randomUUID()}`,
      libraryId: library.id,
      kind: 'link',
      title: normalizeTitle(body?.title, domain || normalizedUrl),
      description: normalizeDescription(body?.description),
      sourceUrl: normalizedUrl,
      sourceDomain: domain,
      sourceSiteName: normalizeOptionalText(body?.siteName),
      sourceImage: normalizeOptionalText(body?.image, 2048),
      fileStorageKey: null,
      fileName: null,
      fileMime: null,
      fileBytes: null,
      access: 'members',
      createdByUserId: auth.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };

    await db.insert(LibraryItems).values(row);

    return c.json({ success: true, duplicate: false, item: serializeItem(row) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/library/items/create',
      action: 'create_library_item',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * POST /api/library/items/upload — attach a file as a new library item.
 *
 * Multipart: `file` (required), `title` (optional; defaults to the filename).
 * The storage object is written under a key containing the item id, so the row
 * and the object reference each other from birth.
 */
app.post('/api/library/items/upload', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    if (!isLibraryFileStorageConfigured()) {
      return c.json({ error: 'File storage is not configured', code: 'STORAGE_UNAVAILABLE' }, 503);
    }

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
    const titleField = formData.get('title');
    const library = await ensurePersonalLibrary(auth.userId);
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

    const timestamp = now();
    const row: LibraryItemRow = {
      id: itemId,
      libraryId: library.id,
      kind: 'file',
      title: normalizeTitle(typeof titleField === 'string' ? titleField : '', fileName),
      description: null,
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

    await db.insert(LibraryItems).values(row);

    return c.json({ success: true, item: serializeItem(row) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/library/items/upload',
      action: 'upload_library_file',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * GET /api/library/items/:id/file — mint a short-lived download URL.
 *
 * The owner check happens here, at mint time, which is what lets the bucket
 * stay private with no client-role storage policies at all.
 */
app.get('/api/library/items/:id/file', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const id = requireParam(c, 'id');

    const item = await findOwnedItem(auth.userId, id);
    if (!item) return c.json({ error: 'Library item not found', code: 'NOT_FOUND' }, 404);
    if (item.kind !== 'file' || !item.fileStorageKey) {
      return c.json({ error: 'Item has no file', code: 'NOT_A_FILE' }, 400);
    }

    const url = await signedLibraryFileUrl(item.fileStorageKey);
    if (!url) {
      return c.json({ error: 'File storage is not configured', code: 'STORAGE_UNAVAILABLE' }, 503);
    }

    return c.json({ url, fileName: item.fileName, fileMime: item.fileMime });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/library/items/[id]/file',
      action: 'sign_library_file',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** POST /api/library/items/update — rename or re-describe an item. */
app.post('/api/library/items/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();

    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return c.json({ error: 'Item id is required', code: 'MISSING_ID' }, 400);

    const item = await findOwnedItem(auth.userId, id);
    if (!item) return c.json({ error: 'Library item not found', code: 'NOT_FOUND' }, 404);

    const updates: Partial<LibraryItemRow> = { updatedAt: now() };
    if (body?.title !== undefined) updates.title = normalizeTitle(body.title, item.title);
    if (body?.description !== undefined) updates.description = normalizeDescription(body.description);

    await db.update(LibraryItems).set(updates).where(eq(LibraryItems.id, id));

    return c.json({ success: true, item: serializeItem({ ...item, ...updates }) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/library/items/update',
      action: 'update_library_item',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/**
 * POST /api/library/items/archive — remove an item from the library.
 *
 * Soft, so a mention pill or dock chip that already cites the item still
 * resolves to a title rather than a dead id.
 */
app.post('/api/library/items/archive', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await c.req.json();

    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return c.json({ error: 'Item id is required', code: 'MISSING_ID' }, 400);

    const item = await findOwnedItem(auth.userId, id);
    if (!item) return c.json({ error: 'Library item not found', code: 'NOT_FOUND' }, 404);

    if (item.archivedAt) return c.json({ success: true, alreadyArchived: true });

    const timestamp = now();
    await db
      .update(LibraryItems)
      .set({ archivedAt: timestamp, updatedAt: timestamp })
      .where(eq(LibraryItems.id, id));

    return c.json({ success: true, alreadyArchived: false });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/library/items/archive',
      action: 'archive_library_item',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
