/**
 * Contract tests for the note history routes, asserted against source like review-routes.test.ts:
 * the property that matters is that every history route applies the plan window.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function historyRoutes(): string {
  const notes = source('server/routes/notes.ts');
  const start = notes.indexOf("route.get('/api/notes/:noteId/versions'");
  const end = notes.indexOf("route.get('/api/notes/:noteId/activity'");
  return notes.slice(start, end);
}

function handler(routes: string, registration: string): string {
  const start = routes.indexOf(registration);
  const next = routes.indexOf('\nroute.', start + registration.length);
  return routes.slice(start, next === -1 ? undefined : next);
}

describe('note history routes', () => {
  const routes = historyRoutes();
  const list = handler(routes, "route.get('/api/notes/:noteId/versions',");
  const one = handler(routes, "route.get('/api/notes/:noteId/versions/:versionId',");
  const restore = handler(routes, "route.post('/api/notes/:noteId/versions/:versionId/restore',");

  it('finds all three routes', () => {
    for (const body of [list, one, restore]) expect(body.length).toBeGreaterThan(0);
  });

  it('keeps history author-only', () => {
    for (const body of [list, one]) expect(body).toContain("'NOT_NOTE_AUTHOR'");
    expect(source('server/utils/note-version-service.ts')).toContain(
      'assertCanAccessNoteVersions(historical.authorId, input.actorId)',
    );
  });

  it('applies the plan window on every route', () => {
    for (const body of [list, one, restore]) expect(body).toContain('resolveHistoryVisibleSince');
  });

  it('refuses a locked version with the standard Plus body', () => {
    for (const body of [one, restore]) expect(body).toContain("featureRequiredBody('full_history')");
  });

  it('re-checks the window inside the restore transaction', () => {
    expect(restore).toContain('visibleSince,');
    expect(source('server/utils/note-version-service.ts')).toContain('throw new NoteHistoryLockedError()');
  });

  it('never reads version bodies to build the list', () => {
    expect(source('server/utils/note-history-window.ts')).not.toContain('NoteVersions.content,');
    expect(list).not.toContain('NoteVersions.content');
  });
});
