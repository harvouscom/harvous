/**
 * Contract tests for the reads behind Settings › Sharing.
 *
 * Source assertions rather than a running server, the house pattern in discover-routes.test.ts.
 * What they protect is who the page can see: every row is the viewer's own, and the one new read —
 * notes you put into shared spaces — must never become a way to list a room's other notes or
 * its members.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routes = () => readFileSync(resolve(process.cwd(), 'server/routes/user.ts'), 'utf8');

/** Source of one handler, from its `app.<verb>(` to the next one. */
function handlerBody(text: string, marker: string): string {
  const start = text.indexOf(marker);
  expect(start, `${marker} not found`).toBeGreaterThan(-1);
  const next = text.indexOf('\napp.', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

describe('GET /api/profile/my-shared-space-notes', () => {
  const marker = "app.get('/api/profile/my-shared-space-notes'";

  it('requires a signed-in viewer and lists only their own notes', () => {
    const body = handlerBody(routes(), marker);
    expect(body).toContain('requireAuth');
    expect(body).toContain('eq(Notes.userId, auth.userId)');
  });

  it('lists only associations still standing, in shared spaces that still exist', () => {
    // A removed association is one the author already took back; a deleted space is gone.
    const body = handlerBody(routes(), marker);
    expect(body).toContain('isNull(SpaceNotes.removedAt)');
    expect(body).toContain("ne(Spaces.type, 'personal')");
    expect(body).toContain('isNull(Spaces.deletedAt)');
  });

  it('says nothing about who else is in the space', () => {
    const body = handlerBody(routes(), marker);
    expect(body).not.toContain('SpaceMemberships');
    expect(body).not.toContain('addedBy');
  });

  it('never lets the browser cache it', () => {
    // Stale here means a row offering to remove a note from a space it already left.
    expect(handlerBody(routes(), marker)).toContain('no-store');
  });

  it('never previews a locked note’s body', () => {
    expect(handlerBody(routes(), marker)).toContain('row.contentEncrypted');
  });
});

describe('when each thing was shared', () => {
  it('stamps a public link with when the link was made, not when the note was last edited', () => {
    const body = handlerBody(routes(), "app.get('/api/profile/my-sharing'");
    expect(body).toContain('sharedAt: n.shareTokenCreatedAt');
  });

  it('stamps a space you joined with when you joined it', () => {
    const body = handlerBody(routes(), "app.get('/api/profile/my-shared-spaces'");
    expect(body).toContain('SpaceMemberships.joinedAt');
    expect(body).toContain('createdAt: space.createdAt');
  });
});
