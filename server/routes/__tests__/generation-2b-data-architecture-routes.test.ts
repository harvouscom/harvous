import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Generation 2B data architecture route contracts', () => {
  it('versions every remaining active server note writer atomically', () => {
    for (const path of [
      'server/routes/inbox.ts',
      'server/routes/featured.ts',
      'server/routes/admin.ts',
    ]) {
      const route = source(path);
      expect(route).toContain('db.transaction(async (tx)');
      expect(route).toContain('createInitialNoteVersion(tx');
    }
    expect(source('server/routes/inbox.ts')).toContain("source: 'inbox-thread-add'");
    expect(source('server/routes/featured.ts')).toContain("source: 'featured-votd'");
    expect(source('server/routes/admin.ts')).toContain("source: 'admin-thread-create'");
  });

  it('centralizes hidden shared Thread reads and locking junction mutations', () => {
    const lifecycle = source('server/utils/shared-space-lifecycle.ts');
    const threads = source('server/routes/threads.ts');
    const notes = source('server/routes/notes.ts');
    const search = source('server/routes/search.ts');
    const sync = source('server/routes/sync.ts');
    expect(lifecycle).toContain('export async function requireThreadReadAccess');
    expect(lifecycle).toContain('export async function authorizeNoteThreadMutationInTransaction');
    expect(threads.match(/readableThreadOrNull\(/g)?.length).toBeGreaterThanOrEqual(5);
    expect(
      threads.match(
        /if \(!readAccess\) return c\.json\(\{ error: 'Thread not found' \}, 404\)/g,
      )?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(notes).toContain('viewerIsSharedOwner ? undefined : eq(Threads.isPinned, true)');
    expect(search).toContain('await requireThreadReadAccess(db');
    expect(search).toContain("eq(Threads.isPinned, true)");
    expect(notes.match(/authorizeNoteThreadMutationInTransaction\(tx/g)?.length).toBe(2);
    expect(sync).toContain('authorizeNoteThreadMutationInTransaction(executor');
    expect(sync).toMatch(/from\(NoteThreads\)[\s\S]*?for\('update'\)/);
  });

  it('uses one fail-closed migration target identity for every staged command', () => {
    for (const path of [
      'server/scripts/add-shared-spaces-schema.ts',
      'server/scripts/preflight-canonical-space-notes.ts',
      'server/scripts/backfill-canonical-space-notes.ts',
      'server/scripts/verify-canonical-space-notes.ts',
      'server/scripts/shared-spaces-db-push.ts',
    ]) {
      expect(source(path)).toContain('loadSharedSpacesMigrationIdentity');
      expect(source(path)).toContain('logSharedSpacesMigrationIdentity');
    }
    expect(source('server/scripts/backfill-canonical-space-notes.ts')).not.toContain(
      "from '../db/client'",
    );
  });

  it('creates imported notes, version 1, and durable highlight bindings atomically', () => {
    const user = source('server/routes/user.ts');
    const importStart = user.indexOf("app.post('/api/user/import'");
    const importEnd = user.indexOf('// ─── GET /api/profile/my-sharing', importStart);
    const importRoute = user.slice(importStart, importEnd);
    expect(importRoute).toContain('await db.transaction(async (tx)');
    expect(importRoute).toContain('createInitialNoteVersion(tx');
    expect(importRoute).toContain('buildLegacyAnchorMigrationPatch');
    expect(importRoute).toContain('resolvedVersionId: initialVersion.id');
    expect(importRoute).not.toContain('await db.insert(Notes)');
  });

  it('creates every scripture child with immutable version pointers in one transaction', () => {
    const scripture = source('server/utils/process-scripture-references.ts');
    const helperStart = scripture.indexOf('async function createCanonicalScriptureChild');
    const helperEnd = scripture.indexOf('async function resolveParentThreadIds', helperStart);
    const helper = scripture.slice(helperStart, helperEnd);
    expect(helper).toContain('return db.transaction(async (tx)');
    expect(helper).toContain('.insert(Notes)');
    expect(helper).toContain('createInitialNoteVersion(tx');
    expect(helper).toContain('.insert(ScriptureMetadata)');
    expect(scripture.match(/await createCanonicalScriptureChild\(/g)).toHaveLength(2);
    expect(scripture).not.toContain('Auto-tag fire-and-forget');
  });

  it('re-resolves durable anchors in the canonical mutation transaction', () => {
    const versions = source('server/utils/note-version-service.ts');
    expect(versions).toContain('reresolveDurableAnchorsInTransaction');
    expect(versions).toMatch(
      /if \(shouldCheckpoint\) \{\s+await reresolveDurableAnchorsInTransaction\(tx,/,
    );
    expect(versions).toContain('resolvedVersionId: nextVersion.id');
  });

  it('deletes shared Threads through the same transaction service in HTTP and sync', () => {
    const threads = source('server/routes/threads.ts');
    const sync = source('server/routes/sync.ts');
    const lifecycle = source('server/utils/shared-space-lifecycle.ts');
    expect(threads).toContain('deleteThreadInTransaction(tx, { threadId, actorId: auth.userId })');
    expect(sync).toContain('deleteThreadInTransaction(tx, { threadId: entityId, actorId: userId })');
    expect(lifecycle).toContain("if (!shared && affectedNoteIds.length > 0)");
    expect(lifecycle).toContain('await tx.delete(NoteThreads)');
    expect(lifecycle).toContain('await tx\n    .delete(Threads)');
  });

  it('requires expectedVersion for sync canonical content updates', () => {
    const sync = source('server/routes/sync.ts');
    expect(sync).toContain('syncCanonicalUpdateRequiresExpectedVersion(data)');
    expect(sync).toContain('NOTE_VERSION_REQUIRED: canonical sync updates require expectedVersion');
    expect(sync).toContain(
      'expectedVersion: Number.isInteger(data.expectedVersion) ? data.expectedVersion : undefined',
    );
    expect(sync).toContain('const versionError = noteVersionErrorResponse(error)');
  });

  it('locks Thread, space, membership, notes, and associations before attachment', () => {
    const threads = source('server/routes/threads.ts');
    const start = threads.indexOf('async function attachNotesToSharedThread');
    const end = threads.indexOf('// ─── Helpers', start);
    const helper = threads.slice(start, end);
    expect(helper).toContain('await db.transaction(async (tx)');
    expect(helper.match(/\.for\('update'\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(helper).toContain('assertSharedThreadNotePolicy');
    expect(helper).toContain('await tx\n      .insert(NoteThreads)');
  });

  it('clears legacy shared organization and shared Thread placement during backfill', () => {
    const backfill = source('server/scripts/backfill-canonical-space-notes.ts');
    expect(backfill).toContain("threadId: 'thread_unorganized'");
    expect(backfill).toContain('primaryCollection: null');
    expect(backfill).toContain('secondaryCollections: null');
    expect(backfill).toContain('collectionPinned: false');
    expect(backfill).toContain('collectionUserOverride: false');
    expect(backfill).toContain('collectionLastAutoUpdatedAt: null');
    expect(backfill).toContain('eq(Threads.spaceId, candidate.sharedSpaceId)');
    expect(backfill).toContain('resolvedVersionId: patch.noteVersionId');
  });

  it('preserves recoverable deleted-space associations and schedules bounded purge', () => {
    const verifier = source('server/scripts/verify-canonical-space-notes.ts');
    const config = source('netlify.toml');
    const pkg = source('package.json');
    expect(verifier).toContain('s."recoveryUntil" <= now()');
    expect(verifier).toContain('s."isActive" = true');
    expect(config).toContain('[functions."purge-shared-spaces"]');
    expect(config).toContain('schedule = "@daily"');
    expect(pkg).toContain('netlify/functions/purge-shared-spaces.cjs');
  });

  it('stores safe copy attribution and hides unpinned Threads from members', () => {
    const spaces = source('server/routes/spaces.ts');
    expect(spaces).toContain("foreignAuthorDisplayNames.get(source.userId) ?? 'Member'");
    expect(spaces.match(/visibleSharedThreadsForViewer\(/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
