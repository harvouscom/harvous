/**
 * The church's Resource Library — the staff catalog, and the congregant read.
 *
 * Two lanes with deliberately different addressing, and the difference is the
 * security story:
 *
 *   **Staff lane** (`?orgId=`) — a curator or teacher naming the church they
 *   work for. Taking `orgId` from the request is safe here *because* every
 *   handler gates on it before touching data; the gate is what proves the
 *   caller belongs to that org.
 *
 *   **Congregant lane** (`GET /api/library/church`) — takes no org at all. The
 *   church is derived from the caller's own `connectedOrgId`. A congregant
 *   route that accepted an org id would be a lever for reading another
 *   church's shelf, and the rule that it never does is the same one
 *   `server/routes/church.ts` is contract-tested on.
 *
 * Curation is gated on `manage_library`; *reading* never is, for anyone. A
 * lapsed church keeps the library its people already have — losing a church's
 * study is never how a billing lapse should show up.
 */
import { Hono } from 'hono';
import {
  db,
  first,
  and,
  eq,
  desc,
  inArray,
  isNull,
  ResourceLibraries,
  LibraryItems,
  LibraryItemScopes,
  Spaces,
} from '../db';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { validateResourceUrl, extractDomain } from '@/utils/validation';
import { isChurchOrgSpaceRow } from '../utils/channel-publish-cadence';
import {
  uploadLibraryFile,
  isLibraryFileStorageConfigured,
  sanitizeLibraryFileName,
  LIBRARY_FILE_MAX_BYTES,
} from '../utils/library-file-upload';
import {
  assertCanManageChurchLibrary,
  assertCanViewChurchLibrary,
  ensureChurchLibrary,
  findChurchLibrary,
  resolveChurchLibraryViewer,
  scopesAdmitViewer,
  scopesByItemIds,
  WRITABLE_SCOPE_KINDS,
  type LibraryItemRow,
  type LibraryItemScopeRow,
} from '../utils/church-library-access';

const app = new Hono();

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 1000;
/** Enough for a real shelf; small enough that one bad actor cannot flood a read. */
const SCOPES_MAX = 40;

function clean(value: unknown, max: number): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * The congregant-safe shape.
 *
 * `access` ships — it is an audience label ("leaders only"), not a person, and
 * the UI needs it to explain why an item is where it is. `createdByUserId`,
 * `fileStorageKey`, and `archivedAt` do not: the first names a member of staff
 * to the congregation, and the second is the object key behind a signed URL.
 */
function serializeChurchItem(row: LibraryItemRow, scopes: readonly LibraryItemScopeRow[]) {
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
    scopes: scopes.map((s) => ({ scopeKind: s.scopeKind, spaceId: s.spaceId })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The staff view adds who put it there and whether it is archived. */
function serializeStaffItem(row: LibraryItemRow, scopes: readonly LibraryItemScopeRow[]) {
  return {
    ...serializeChurchItem(row, scopes),
    createdByUserId: row.createdByUserId,
    archivedAt: row.archivedAt,
  };
}

/** Live items in one library, newest activity first. */
async function listLibraryItems(libraryId: string): Promise<LibraryItemRow[]> {
  return db
    .select()
    .from(LibraryItems)
    .where(and(eq(LibraryItems.libraryId, libraryId), isNull(LibraryItems.archivedAt)))
    .orderBy(desc(LibraryItems.updatedAt), desc(LibraryItems.createdAt));
}

/**
 * Validate a requested scope set against this church.
 *
 * Every named space must be one of this church's own org spaces — otherwise a
 * curator could scope an item into a room belonging to somebody else, and it
 * would show up in that church's members' sidebars.
 */
async function resolveScopes(
  orgId: string,
  raw: unknown,
): Promise<
  | { ok: true; scopes: { scopeKind: 'org' | 'space'; spaceId: string | null }[] }
  | { ok: false; error: string; code: string }
> {
  if (raw === undefined) return { ok: true, scopes: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'scopes must be an array', code: 'BAD_REQUEST' };
  }
  if (raw.length > SCOPES_MAX) {
    return { ok: false, error: `At most ${SCOPES_MAX} scopes`, code: 'BAD_REQUEST' };
  }

  const scopes: { scopeKind: 'org' | 'space'; spaceId: string | null }[] = [];
  const spaceIds: string[] = [];

  for (const entry of raw) {
    const kind = String((entry as { scopeKind?: unknown })?.scopeKind ?? '');
    if (!WRITABLE_SCOPE_KINDS.includes(kind as 'org' | 'space')) {
      /*
        'ministry' lands here on purpose. The column exists so this table never
        needs a migration, but there is no ministry entity to key against — a
        free-text key written today is data no read path could group by.
      */
      return {
        ok: false,
        error: `Unsupported scope: ${kind || '(missing)'}`,
        code: 'SCOPE_KIND_UNSUPPORTED',
      };
    }
    if (kind === 'org') {
      scopes.push({ scopeKind: 'org', spaceId: null });
      continue;
    }
    const spaceId = clean((entry as { spaceId?: unknown })?.spaceId, 200);
    if (!spaceId) {
      return { ok: false, error: 'A space scope needs a spaceId', code: 'BAD_REQUEST' };
    }
    scopes.push({ scopeKind: 'space', spaceId });
    spaceIds.push(spaceId);
  }

  if (spaceIds.length > 0) {
    const rows = await db
      .select()
      .from(Spaces)
      .where(and(inArray(Spaces.id, spaceIds), isNull(Spaces.deletedAt)));
    const valid = new Set(
      rows.filter((row) => row.orgId === orgId && isChurchOrgSpaceRow(row)).map((row) => row.id),
    );
    const stranger = spaceIds.find((id) => !valid.has(id));
    if (stranger) {
      return {
        ok: false,
        error: 'That space is not one of your church’s rooms',
        code: 'SPACE_NOT_FOUND',
      };
    }
  }

  return { ok: true, scopes };
}

/** Replace an item's scope set wholesale, inside the caller's transaction. */
async function replaceScopes(
  tx: { delete: typeof db.delete; insert: typeof db.insert },
  itemId: string,
  scopes: readonly { scopeKind: 'org' | 'space'; spaceId: string | null }[],
): Promise<void> {
  await tx.delete(LibraryItemScopes).where(eq(LibraryItemScopes.libraryItemId, itemId));
  if (scopes.length === 0) return;
  const timestamp = new Date();
  await tx.insert(LibraryItemScopes).values(
    scopes.map((scope) => ({
      id: `libsc_${crypto.randomUUID()}`,
      libraryItemId: itemId,
      scopeKind: scope.scopeKind,
      spaceId: scope.spaceId,
      ministryKey: null,
      createdAt: timestamp,
    })),
  );
}

// ─── GET /api/church/library ────────────────────────────────────────────────
/**
 * The staff catalog: every live item, with its scopes and who added it.
 *
 * Gated on `sermon_tools` rather than `manage_library` — a teacher picking
 * resources for what they teach is not the person who decides what the church
 * keeps. Archived items are excluded here; pills that already cite one still
 * resolve through `resolveVisibleItem`.
 */
app.get('/api/church/library', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = (c.req.query('orgId') ?? '').trim();

    const gate = await assertCanViewChurchLibrary(auth.userId, orgId);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const library = await findChurchLibrary(gate.church.id);
    if (!library) {
      /* Lazily created on first save — an empty church has no row yet, and
         creating one on a read would write on a GET. */
      return c.json({ library: null, items: [] });
    }

    const items = await listLibraryItems(library.id);
    const scopes = await scopesByItemIds(items.map((i) => i.id));

    return c.json({
      library: { id: library.id, title: library.title },
      items: items.map((item) => serializeStaffItem(item, scopes.get(item.id) ?? [])),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/library',
      action: 'church_library_list',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/library/church ────────────────────────────────────────────────
/**
 * What the caller's own church has published to them.
 *
 * **Takes no orgId.** The church comes from the caller's `connectedOrgId`; the
 * viewer's memberships decide which space-scoped items are admitted, and
 * `access: 'leaders'` items are filtered out for anyone who is not staff.
 *
 * Never sponsorship-gated: this is the read a congregation keeps.
 */
app.get('/api/library/church', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const viewer = await resolveChurchLibraryViewer(auth.userId);
    if (viewer.kind === 'none') {
      return c.json({ connected: false, church: null, items: [] });
    }

    const library = await findChurchLibrary(viewer.church.id);
    if (!library) {
      return c.json({
        connected: true,
        church: { id: viewer.church.id, name: viewer.church.name },
        items: [],
      });
    }

    const items = await listLibraryItems(library.id);
    const scopes = await scopesByItemIds(items.map((i) => i.id));

    const visible = items.filter((item) => {
      if (item.access === 'leaders' && !viewer.seesLeaderOnly) return false;
      return scopesAdmitViewer(scopes.get(item.id) ?? [], viewer.memberSpaceIds, viewer.seesLeaderOnly);
    });

    return c.json({
      connected: true,
      church: { id: viewer.church.id, name: viewer.church.name },
      items: visible.map((item) => serializeChurchItem(item, scopes.get(item.id) ?? [])),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/library/church',
      action: 'church_library_union',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/library/items/create ──────────────────────────────────
app.post('/api/church/library/items/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      url?: string;
      title?: string;
      description?: string;
      siteName?: string;
      image?: string;
      access?: string;
      scopes?: unknown;
    };

    const gate = await assertCanManageChurchLibrary(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    /* Re-validated server-side even though the client previewed it: the preview
       is a convenience, not a gate, and nothing stops a direct POST. */
    const validation = validateResourceUrl(String(body.url ?? ''));
    if (!validation.isValid || !validation.normalizedUrl) {
      return c.json(
        { error: validation.error || 'Invalid URL', code: validation.code || 'INVALID_URL' },
        400,
      );
    }
    const sourceUrl = validation.normalizedUrl;

    const access = body.access === 'leaders' ? 'leaders' : 'members';
    const scopeResult = await resolveScopes(gate.church.orgId, body.scopes);
    if (!scopeResult.ok) {
      return c.json({ error: scopeResult.error, code: scopeResult.code }, 400);
    }

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
      access,
      createdByUserId: auth.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };

    await db.transaction(async (tx) => {
      await tx.insert(LibraryItems).values(row);
      await replaceScopes(tx, row.id, scopeResult.scopes);
    });

    return c.json({ success: true, item: serializeStaffItem(row, []) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/library/items/create',
      action: 'church_library_create',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/library/items/upload ──────────────────────────────────
/**
 * Attach a file as a church resource — the same row as `create`, sourced from an
 * upload instead of a URL.
 *
 * Multipart rather than JSON, so `scopes` arrives as a JSON string and is parsed
 * before it reaches `resolveScopes` — which still does the validating, since a
 * form field is no more trustworthy than a body field.
 *
 * The upload runs before the insert. A stored object with no row is a bounded
 * cost (an orphan in the bucket); a row pointing at an object that failed to
 * store is a resource nobody can open.
 */
app.post('/api/church/library/items/upload', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    if (!isLibraryFileStorageConfigured()) {
      return c.json({ error: 'File storage is not configured', code: 'STORAGE_UNAVAILABLE' }, 503);
    }

    const formData = await c.req.formData();
    const orgId = String(formData.get('orgId') ?? '').trim();
    const gate = await assertCanManageChurchLibrary(auth.userId, orgId);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

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

    const access = formData.get('access') === 'leaders' ? 'leaders' : 'members';
    const rawScopes = formData.get('scopes');
    let parsedScopes: unknown = undefined;
    if (typeof rawScopes === 'string' && rawScopes.trim()) {
      try {
        parsedScopes = JSON.parse(rawScopes);
      } catch {
        return c.json({ error: 'Invalid scopes', code: 'INVALID_SCOPES' }, 400);
      }
    }
    const scopeResult = await resolveScopes(gate.church.orgId, parsedScopes);
    if (!scopeResult.ok) {
      return c.json({ error: scopeResult.error, code: scopeResult.code }, 400);
    }

    const fileName = sanitizeLibraryFileName(file.name || 'file');
    const library = await ensureChurchLibrary(gate.church.id, gate.church.name);
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
      access,
      createdByUserId: auth.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    };

    await db.transaction(async (tx) => {
      await tx.insert(LibraryItems).values(row);
      await replaceScopes(tx, row.id, scopeResult.scopes);
    });

    return c.json({ success: true, item: serializeStaffItem(row, []) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/library/items/upload',
      action: 'church_library_upload',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/library/items/update ──────────────────────────────────
app.post('/api/church/library/items/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      id?: string;
      title?: string;
      description?: string | null;
      access?: string;
      scopes?: unknown;
    };

    const gate = await assertCanManageChurchLibrary(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const itemId = clean(body.id, 200);
    if (!itemId) return c.json({ error: 'id is required', code: 'BAD_REQUEST' }, 400);

    /* Scoped through the library, so an id from another church's shelf — or a
       personal one — reads as "not found" rather than confirming it exists. */
    const library = await findChurchLibrary(gate.church.id);
    const existing = library
      ? first(
          await db
            .select()
            .from(LibraryItems)
            .where(and(eq(LibraryItems.id, itemId), eq(LibraryItems.libraryId, library.id)))
            .limit(1),
        )
      : undefined;
    if (!existing) return c.json({ error: 'Resource not found', code: 'ITEM_NOT_FOUND' }, 404);

    const updates: Partial<LibraryItemRow> = { updatedAt: new Date() };
    if (body.title !== undefined) {
      const title = clean(body.title, TITLE_MAX_LENGTH);
      if (!title) return c.json({ error: 'A title is required', code: 'BAD_REQUEST' }, 400);
      updates.title = title;
    }
    if (body.description !== undefined) {
      updates.description = clean(body.description, DESCRIPTION_MAX_LENGTH);
    }
    if (body.access !== undefined) {
      updates.access = body.access === 'leaders' ? 'leaders' : 'members';
    }

    const scopeResult =
      body.scopes === undefined ? null : await resolveScopes(gate.church.orgId, body.scopes);
    if (scopeResult && !scopeResult.ok) {
      return c.json({ error: scopeResult.error, code: scopeResult.code }, 400);
    }

    await db.transaction(async (tx) => {
      await tx.update(LibraryItems).set(updates).where(eq(LibraryItems.id, itemId));
      if (scopeResult) await replaceScopes(tx, itemId, scopeResult.scopes);
    });

    const merged = { ...existing, ...updates } as LibraryItemRow;
    const scopes = (await scopesByItemIds([itemId])).get(itemId) ?? [];
    return c.json({ success: true, item: serializeStaffItem(merged, scopes) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/library/items/update',
      action: 'church_library_update',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/library/items/archive ─────────────────────────────────
/**
 * Soft archive, matching the personal library: items stay resolvable so a note
 * that already cites one degrades to a dead-but-labelled chip rather than a 404.
 */
app.post('/api/church/library/items/archive', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as { orgId?: string; id?: string };

    const gate = await assertCanManageChurchLibrary(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const itemId = clean(body.id, 200);
    if (!itemId) return c.json({ error: 'id is required', code: 'BAD_REQUEST' }, 400);

    const library = await findChurchLibrary(gate.church.id);
    const existing = library
      ? first(
          await db
            .select({ id: LibraryItems.id })
            .from(LibraryItems)
            .where(and(eq(LibraryItems.id, itemId), eq(LibraryItems.libraryId, library.id)))
            .limit(1),
        )
      : undefined;
    if (!existing) return c.json({ error: 'Resource not found', code: 'ITEM_NOT_FOUND' }, 404);

    await db
      .update(LibraryItems)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(LibraryItems.id, itemId));

    return c.json({ success: true });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/library/items/archive',
      action: 'church_library_archive',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
