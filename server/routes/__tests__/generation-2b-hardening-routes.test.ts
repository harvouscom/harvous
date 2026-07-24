import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeSource = (name: string) =>
  readFileSync(resolve(process.cwd(), 'server', 'routes', `${name}.ts`), 'utf8');

describe('Generation 2B route hardening', () => {
  it('requires unencrypted public note reads and blocks shared Thread tokens', () => {
    const shared = routeSource('shared');
    const threads = routeSource('threads');
    expect(shared).toContain(
      'eq(Notes.shareToken, shareToken), eq(Notes.isPublic, true), eq(Notes.contentEncrypted, false)',
    );
    expect(shared).toContain("contextSpace.type !== 'personal'");
    expect(threads).toContain('SHARED_THREAD_NOT_PUBLIC');
    expect(threads).toContain('threadAllowsPublicBroadcast');
  });

  it('keeps imported Thread structure and canonical versions in one transaction', () => {
    const shared = routeSource('shared');
    const transactionStart = shared.indexOf(
      'await db.transaction(async (tx) => {',
      shared.indexOf("app.post('/api/shared/add-to-harvous'"),
    );
    const threadInsert = shared.indexOf('await tx.insert(Threads)', transactionStart);
    const versionInsert = shared.indexOf('await createInitialNoteVersion(tx', transactionStart);
    const postCommitStart = shared.indexOf('const warnings: string[]', versionInsert);
    expect(transactionStart).toBeGreaterThan(-1);
    expect(threadInsert).toBeGreaterThan(transactionStart);
    expect(versionInsert).toBeGreaterThan(threadInsert);
    expect(postCommitStart).toBeGreaterThan(versionInsert);
    expect(shared.slice(transactionStart, postCommitStart)).toContain('tx.insert(NoteThreads)');
    expect(shared.slice(transactionStart, postCommitStart)).toMatch(
      /tx\s*\.\s*insert\(NoteScriptureReferences\)/,
    );
    expect(shared.slice(transactionStart, postCommitStart)).not.toContain('await db.insert(Threads)');
    expect(shared).toContain('durable import succeeded; scripture postprocessing failed');
    expect(shared).toContain('warnings');
    expect(shared).toContain('eq(Notes.copiedFromNoteId, sourceNote.id)');
  });

  it('uses authoritative sync lifecycle and response paths', () => {
    const sync = routeSource('sync');
    expect(sync).toContain('softDeleteSharedSpaceInTransaction');
    expect(sync).toContain('setSingularThreadPin');
    expect(sync).toContain('SHARED_STUDY_THREAD_HTTP_REQUIRED');
    expect(sync).toContain('SHARED_SPACE_DELETE_HTTP_REQUIRED');
    expect(sync).toContain('normalizeSharedNoteOrganizationMutation');
    expect(sync).toMatch(/update\(SpaceNotes\)/);
    expect(sync).toContain('data.order !== undefined && !sharedOrganizationTarget');
    expect(sync).toContain('data.primaryCollection !== undefined && !sharedOrganizationTarget');
    expect(sync).toContain('primaryCollection: isSharedTarget ? null : createPrimary');
    expect(sync).not.toContain(
      "await db.update(Spaces).set({ isActive: false, updatedAt: nowISO() }).where(and(eq(Spaces.id, entityId), eq(Spaces.userId, userId)));\n    return { success: true, entityId, serverId: entityId };",
    );
  });

  it('authorizes tags and note processing through explicit shared context', () => {
    const notes = routeSource('notes');
    const tagsStart = notes.indexOf("route.get('/api/notes/:id/tags'");
    const detailsStart = notes.indexOf("route.get('/api/notes/:id/details'");
    const processingStart = notes.indexOf("route.post('/api/notes/:id/process-scripture-references'");
    const tags = notes.slice(tagsStart, detailsStart);
    expect(tags).toContain('resolveNoteReadContext');
    expect(tags).toContain('canExposeCanonicalTagInContext');
    const details = notes.slice(detailsStart, processingStart);
    expect(details).toContain('const noteTags = readContext.isShared');
    expect(details).toContain('? []');
    expect(details).toContain('organization: contextOrganization');
    const visitEnd = notes.indexOf("route.get('/api/notes/:noteId/share'");
    const processingAndVisit = notes.slice(processingStart, visitEnd);
    expect(processingAndVisit).toContain('explicitContextSpaceId');
    expect(processingAndVisit).toContain('resolveNoteReadContext');
    expect(processingAndVisit).not.toContain('threadWithSpace');
  });

  it('mutates contextual organization through SpaceNotes only', () => {
    const spaces = routeSource('spaces');
    const endpointStart = spaces.indexOf(
      "route.patch('/api/spaces/:spaceId/notes/:noteId'",
    );
    const endpointEnd = spaces.indexOf(
      "route.get('/api/spaces/:spaceId/folder-registry'",
      endpointStart,
    );
    const endpoint = spaces.slice(endpointStart, endpointEnd);
    expect(endpointStart).toBeGreaterThan(-1);
    expect(endpoint).toContain('SpaceMemberships');
    expect(endpoint).toContain('isNull(SpaceNotes.removedAt)');
    expect(endpoint).toContain('note.contentEncrypted');
    expect(endpoint).toContain('space.userId !== auth.userId');
    expect(endpoint).toContain('update(SpaceNotes)');
    expect(endpoint).not.toContain('update(Notes)');
    expect(endpoint).toContain('organization,');
  });

  it('locks and rechecks invite and purge candidates before mutation', () => {
    const spaces = routeSource('spaces');
    const lifecycle = readFileSync(
      resolve(process.cwd(), 'server', 'utils', 'shared-space-lifecycle.ts'),
      'utf8',
    );
    const redeemStart = spaces.indexOf("route.post('/api/spaces/invites/:token/redeem'");
    const redeemEnd = spaces.indexOf("route.get('/api/spaces/:spaceId/members'");
    const redeem = spaces.slice(redeemStart, redeemEnd);
    expect(redeem).toContain(".for('update')");
    expect(redeem).toContain('evaluateLockedInviteRedemption');
    expect(lifecycle).toContain('isExpiredSpacePurgeCandidate(locked, now)');
    expect(lifecycle).toContain('.limit(limit)');
    expect(lifecycle).not.toContain('delete(Notes)');
    expect(lifecycle).not.toContain('delete(NoteVersions)');
  });

  it('executes bounded retention after canonical version creation', () => {
    const versionService = readFileSync(
      resolve(process.cwd(), 'server', 'utils', 'note-version-service.ts'),
      'utf8',
    );
    const retentionCalls = versionService.match(
      /await pruneCanonicalNoteVersionsInTransaction\(/g,
    );
    expect(retentionCalls?.length).toBeGreaterThanOrEqual(3);
    expect(versionService).toContain('.offset(NOTE_VERSION_RETENTION_LATEST_COUNT)');
    expect(versionService).toContain('referencedVersionIds.has(input.id)');
    expect(versionService).toContain("input.source === 'restore'");
  });
});
