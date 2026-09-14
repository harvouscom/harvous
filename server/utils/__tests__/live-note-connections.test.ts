import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { linkedFromNoteIsLiveOwned, noteConnectionEndpointsLive } from '../live-note-connections';
import { parseCleanupOrphanNoteConnectionsArgs } from '../../scripts/cleanup-orphan-note-connections';

const render = (fragment: Parameters<PgDialect['sqlToQuery']>[0]) => new PgDialect().sqlToQuery(fragment).sql;

describe('noteConnectionEndpointsLive', () => {
  it('requires both ends to be notes that exist', () => {
    // A row with a deleted end listed a Thread whose id 404'd on GET /api/notes/:id/thread.
    const text = render(noteConnectionEndpointsLive());
    expect(text).toContain('"Notes"."id" = "NoteConnections"."fromNoteId"');
    expect(text).toContain('"Notes"."id" = "NoteConnections"."toNoteId"');
    expect(text.match(/EXISTS \(SELECT 1 FROM "Notes"/g)).toHaveLength(2);
  });

  it('requires both ends to belong to the connection owner, not merely exist', () => {
    const text = render(noteConnectionEndpointsLive());
    expect(text.match(/"Notes"."userId" = "NoteConnections"."userId"/g)).toHaveLength(2);
  });
});

describe('linkedFromNoteIsLiveOwned', () => {
  it('checks the source note against the outer note through an alias', () => {
    // Without the alias the inner "Notes" would shadow the outer one and compare a note to itself.
    const text = render(linkedFromNoteIsLiveOwned());
    expect(text).toContain('FROM "Notes" AS "linkedFrom"');
    expect(text).toContain('"linkedFrom"."id" = "Notes"."linkedFromNoteId"');
    expect(text).toContain('"linkedFrom"."userId" = "Notes"."userId"');
  });
});

describe('cleanup-orphan-note-connections args', () => {
  it('is a dry run unless --apply is passed', () => {
    expect(parseCleanupOrphanNoteConnectionsArgs([])).toEqual({ apply: false, userId: undefined });
    expect(parseCleanupOrphanNoteConnectionsArgs(['--userId=user_x', '--apply', '--production'])).toEqual({
      apply: true,
      userId: 'user_x',
    });
  });
});
