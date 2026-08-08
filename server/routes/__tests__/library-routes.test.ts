import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('resource library route contracts', () => {
  const route = () => source('server/routes/library.ts');

  it('resolves ownership through the library rather than trusting the request', () => {
    const text = route();
    // The join is the whole permission model in v0 — an item is reachable only
    // via a library whose owner is the caller.
    expect(text).toContain('.innerJoin(ResourceLibraries, eq(LibraryItems.libraryId, ResourceLibraries.id))');
    expect(text).toContain("eq(ResourceLibraries.ownerKind, 'user')");
    expect(text).toContain('eq(ResourceLibraries.ownerId, userId)');
  });

  it('creates the library lazily and survives a concurrent first save', () => {
    const text = route();
    expect(text).toContain('async function ensurePersonalLibrary');
    expect(text).toContain('isUniqueViolationError');
    // Losing the unique-index race must re-read the winner, not throw or fork a
    // second library.
    expect(text).toContain('const raced = await findPersonalLibrary(userId)');
    expect(text.indexOf('isUniqueViolationError')).toBeLessThan(text.indexOf('const raced'));
  });

  it('reports no library instead of creating one on read', () => {
    const text = route();
    expect(text).toContain('if (!library) return c.json({ library: null, items: [] })');
    // GET must not call the ensure* path — reading is not a write.
    const getBlock = text.slice(text.indexOf("app.get('/api/library'"), text.indexOf("app.get('/api/library/items/:id'"));
    expect(getBlock).not.toContain('ensurePersonalLibrary');
  });

  it('re-validates and re-normalizes the URL server-side', () => {
    const text = route();
    // The client fetches OG metadata first, but `url` is the one field that
    // reaches other surfaces, so it is never taken on trust.
    expect(text).toContain("import { validateResourceUrl, extractDomain } from '@/utils/validation'");
    expect(text).toContain('const validation = validateResourceUrl(body?.url)');
    expect(text).toContain('const normalizedUrl = validation.normalizedUrl');
    expect(text).toContain('sourceUrl: normalizedUrl');
  });

  it('reports duplicates instead of refusing them', () => {
    const text = route();
    expect(text).toContain('duplicate: true');
    expect(text).toContain('duplicate: false');
    expect(text).toContain('eq(LibraryItems.sourceUrl, normalizedUrl)');
  });

  it('archives softly so existing pills still resolve', () => {
    const text = route();
    expect(text).toContain('archivedAt: timestamp');
    expect(text).not.toContain('db.delete(LibraryItems)');
    // The list hides archived rows; single-item resolve deliberately does not.
    expect(text).toContain('isNull(LibraryItems.archivedAt)');
  });

  it('fails closed with 404 rather than 403 on a foreign item', () => {
    const text = route();
    // 403 would confirm the id exists to someone who cannot see it.
    expect(text).not.toContain('}, 403)');
    expect(text).toContain("{ error: 'Library item not found', code: 'NOT_FOUND' }, 404");
  });

  it('requires auth everywhere and rate-limits every mutation', () => {
    const text = route();
    const handlers = text.match(/app\.(get|post)\([^)]*\)/g) ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    for (const handler of handlers) {
      expect(handler).toContain('requireAuth');
    }
    for (const handler of handlers.filter((h) => h.startsWith('app.post'))) {
      expect(handler).toContain("rateLimit('write')");
    }
  });

  it('writes only link and file items while other kinds are unbuilt', () => {
    const text = route();
    expect(text).toContain("kind: 'link'");
    expect(text).toContain("kind: 'file'");
    for (const unbuilt of ['note_ref', 'thread_ref', 'template_ref', "kind: 'pack'"]) {
      expect(text).not.toContain(unbuilt);
    }
  });

  /** One handler's source, from its `app.<verb>(` to the next one. */
  const handlerBody = (marker: string) => {
    const text = route();
    const start = text.indexOf(marker);
    expect(start, `${marker} not found`).toBeGreaterThan(-1);
    const next = text.indexOf('\napp.', start + 1);
    return text.slice(start, next === -1 ? undefined : next);
  };

  it('keeps file access mint-time and private', () => {
    const text = route();
    // The storage key never reaches the client; open goes through the signed
    // endpoint after an access check made at mint time.
    expect(text).toContain('fileStorageKey stays server-side');
    expect(text).toContain('signedLibraryFileUrl(item.fileStorageKey)');
  });

  /*
    The two halves of one item must agree on who may see it.

    They did not: `/file` was moved to `resolveVisibleItem` when uploads
    shipped, and `/items/:id` — the route that backs dock chips and `@` library
    mention pills — was left on `findOwnedItem`. A church resource could be
    downloaded but not resolved, so every chip and pill pointing at one 404'd
    for everybody except a personal owner who, for a church item, does not exist.

    The old test could not catch it: it sliced from the `/file` handler to the
    end of the file, so it was reading the *update* handler's `findOwnedItem`.
    Hence the per-handler slice above.
  */
  it.each([
    "app.get('/api/library/items/:id'",
    "app.get('/api/library/items/:id/file'",
  ])('resolves %s through the shared visibility check, not personal ownership', (marker) => {
    const body = handlerBody(marker);
    expect(body).toContain('resolveVisibleItem(auth.userId, id)');
    expect(body).not.toContain('findOwnedItem');
  });

  it('still gates writes on personal ownership', () => {
    // Reading a church item is a member's right; editing or archiving one is
    // not, and goes through the church lane's own `manage_library` routes.
    for (const marker of [
      "app.post('/api/library/items/update'",
      "app.post('/api/library/items/archive'",
    ]) {
      const body = handlerBody(marker);
      expect(body, marker).toContain('findOwnedItem');
      expect(body, marker).not.toContain('resolveVisibleItem');
    }
  });

  it('enforces the upload cap and delegates MIME policy to the storage util', () => {
    const text = route();
    expect(text).toContain('LIBRARY_FILE_MAX_BYTES');
    expect(text).toContain('uploadLibraryFile({');
    const upload = source('server/utils/library-file-upload.ts');
    expect(upload).toContain("export const LIBRARY_FILES_BUCKET = 'library-files'");
    expect(upload).toContain('50 * 1024 * 1024');
    // Uploads must target the private library bucket, never the public
    // note-attachments one (prose mentions of it in comments are fine).
    expect(upload).not.toContain("from(NOTE_ATTACHMENTS_BUCKET)");
    expect(upload).not.toContain(".from('note-attachments')");
  });

  it('is wired into the app', () => {
    const app = source('server/app.ts');
    expect(app).toContain("import library from './routes/library'");
    expect(app).toContain("app.route('/', library)");
  });
});

describe('resource library schema contracts', () => {
  const schema = () => source('server/db/schema.ts');

  it('shares one table shape across personal and church owners', () => {
    const text = schema();
    expect(text).toContain("export const ResourceLibraries = pgTable(");
    expect(text).toContain("ownerKind: text('ownerKind').notNull()");
    expect(text).toContain("ownerId: text('ownerId').notNull()");
  });

  it('constrains one library per owner — the lazy-creation race guard', () => {
    expect(schema()).toContain(
      "uniqueIndex('ResourceLibraries_owner_unique').on(table.ownerKind, table.ownerId)",
    );
  });

  it('carries the dormant access column so the church lane needs no backfill', () => {
    expect(schema()).toContain("access: text('access').notNull().default('members')");
  });

  it('registers both tables with the schema validator', () => {
    const validate = source('server/db/validate-schema.ts');
    for (const table of ['ResourceLibraries', 'LibraryItems']) {
      expect(validate).toContain(`'${table}'`);
    }
    expect(validate).toContain("ResourceLibraries: ['ResourceLibraries_owner_unique']");
  });

  it('exports both tables from the db barrel', () => {
    const index = source('server/db/index.ts');
    expect(index).toContain('ResourceLibraries');
    expect(index).toContain('LibraryItems');
  });
});
