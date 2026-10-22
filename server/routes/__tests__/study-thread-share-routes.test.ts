/**
 * Contract tests for public links on personal Threads (connected notes).
 *
 * Source assertions rather than a running server, matching shared-import-idempotency.test.ts.
 *
 * What they protect: a personal Thread has no row of its own, so its link lives in
 * `StudyThreadShares` and every reader walks the cluster. The rules each path must keep are the
 * ones every public path keeps — owner only, never a Thread in a shared space, never a single
 * note, never an encrypted note — plus the two that make one-press sharing safe: enable is
 * idempotent, and an unmigrated database reads as "nothing shared" instead of a 500.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const notesRoutes = () => source('server/routes/notes.ts');
const sharedRoutes = () => source('server/routes/shared.ts');
const util = () => source('server/utils/study-thread-share.ts');

function handlerBody(text: string, marker: string, next = '\nroute.'): string {
  const start = text.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThan(-1);
  const end = text.indexOf(next, start + 1);
  return text.slice(start, end === -1 ? undefined : end);
}

describe('owner endpoints — /api/notes/:id/thread/share', () => {
  const getBody = () => handlerBody(notesRoutes(), "route.get('/api/notes/:id/thread/share'");
  const postBody = () => handlerBody(notesRoutes(), "route.post('/api/notes/:id/thread/share'");

  it('requires sign-in on both, and rate-limits the write', () => {
    expect(getBody()).toContain('requireAuth');
    expect(postBody()).toContain("requireAuth, rateLimit('write')");
  });

  it('walks the Thread as its owner before reading or writing a link', () => {
    for (const body of [getBody(), postBody()]) {
      expect(body).toContain('resolvePersonalStudyThread(noteId, auth.userId');
    }
  });

  it('never caches the status read', () => {
    expect(getBody()).toContain("'Cache-Control': 'private, max-age=0, no-store'");
  });

  it('hands back the existing link on enable instead of minting a new one', () => {
    const body = postBody();
    expect(body).toContain("if (action === 'enable' && existing)");
    expect(body.indexOf("action === 'enable' && existing")).toBeLessThan(
      body.indexOf('createStudyThreadShare('),
    );
  });

  it('replaces rather than adds: every member is cleared before a new link is made', () => {
    const body = postBody();
    expect(body.indexOf('deleteStudyThreadShares(auth.userId, thread.nodeIds)')).toBeLessThan(
      body.indexOf('createStudyThreadShare('),
    );
  });

  it('always lets a link be turned off, even for a Thread that can no longer be shared', () => {
    const body = postBody();
    const refused = body.indexOf('if (!thread.ok)');
    const disable = body.indexOf("if (action === 'disable')", refused);
    expect(refused).toBeGreaterThan(-1);
    expect(disable, 'disable is not handled inside the refusal branch').toBeGreaterThan(refused);
    expect(disable).toBeLessThan(body.indexOf('return c.json({ success: false, error: thread.error'));
  });

  it('says links are not set up yet, rather than a 500, before the table exists', () => {
    expect(postBody()).toContain('isStudyThreadSharesTableMissing(error)');
    expect(postBody()).toContain("'THREAD_LINKS_UNAVAILABLE'");
  });
});

describe('resolvePersonalStudyThread — the rules every path shares', () => {
  it('refuses a Thread in a shared space and a Thread of one note', () => {
    const text = util();
    expect(text).toContain("space.type !== 'personal'");
    expect(text).toContain("code: 'THREAD_IN_SHARED_SPACE'");
    expect(text).toContain('graph.nodeIds.length < 2');
    expect(text).toContain("code: 'EMPTY_PACK'");
  });

  it('only ever reads the caller’s own note', () => {
    expect(util()).toContain('and(eq(Notes.id, noteId), eq(Notes.userId, userId))');
  });

  it('is what Discover snapshots a personal Thread through, so the two cannot drift', () => {
    expect(source('server/utils/discover-snapshot.ts')).toContain('resolvePersonalStudyThread(repNoteId, userId');
  });

  it('reads an unmigrated database as nothing shared', () => {
    const text = util();
    // Status, public read and the Settings list each guard the missing table.
    expect(text.match(/isStudyThreadSharesTableMissing\(error\)\) return/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('public read — GET /api/shared/thread/:shareToken', () => {
  const body = () => handlerBody(sharedRoutes(), "app.get('/api/shared/thread/:shareToken'", '\napp.');

  it('tries a Threads row first, then a personal Thread link', () => {
    const text = body();
    expect(text.indexOf('eq(Threads.shareToken, shareToken)')).toBeLessThan(
      text.indexOf('loadSharedStudyThread(shareToken)'),
    );
  });

  it('never shows an encrypted note, and only the owner’s notes', () => {
    const text = body();
    const cluster = text.slice(text.indexOf('loadSharedStudyThread(shareToken)'));
    expect(cluster).toContain('eq(Notes.userId, cluster.userId)');
    expect(cluster).toContain('eq(Notes.contentEncrypted, false)');
  });
});

describe('import — POST /api/shared/add-to-harvous from a personal Thread link', () => {
  const body = () => handlerBody(sharedRoutes(), "app.post('/api/shared/add-to-harvous'", '\napp.');

  it('falls back to the personal Thread when no Threads row matches', () => {
    expect(body()).toContain('sourceThreadRow ? null : await loadSharedStudyThread(shareToken)');
  });

  it('copies only non-encrypted notes from the owner', () => {
    const text = body();
    const cluster = text.slice(text.indexOf('if (sourceCluster) {'));
    expect(cluster).toContain('eq(Notes.userId, sourceCluster.userId)');
    expect(cluster).toContain('eq(Notes.contentEncrypted, false)');
  });

  it('copies the connections, or the copy would land as loose notes with no Thread', () => {
    const text = body();
    expect(text).toContain('tx.insert(NoteConnections)');
    // After the guard row, like every other insert in the transaction.
    expect(text.indexOf('tx.insert(Threads)')).toBeLessThan(text.indexOf('tx.insert(NoteConnections)'));
  });
});
