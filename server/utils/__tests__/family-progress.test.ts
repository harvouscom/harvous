/**
 * What a parent sees of a child's study: counts, a coarse bucket, and book names. This test
 * is the privacy contract — it fails if the progress file reaches for anything a child
 * wrote, their Review, their searches, or their recall, and if the route adds a field the
 * child's mirror card doesn't also show.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({}));

import { lastActiveBucket } from '../family-progress';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/** Strip comments so the docblock's own list of forbidden things doesn't trip the scan. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('family progress — the never-list', () => {
  const text = code(source('server/utils/family-progress.ts'));

  it.each([
    'Notes.title',
    'Notes.content',
    'ReadingEvents.chapter,', // which chapters stays private; only a distinct count is read
    'ReviewItems',
    'ReviewEvents',
    'SearchEvents',
    'RecallEvents',
    'Threads',
    'Highlights',
    'SpaceNotes',
    'NoteVisitEvents.noteId',
  ])('never reads %s', (forbidden) => {
    expect(text).not.toContain(forbidden);
  });

  it('counts chapters without returning them', () => {
    expect(text).toContain('count(distinct (${ReadingEvents.bookOrder}, ${ReadingEvents.chapter}))');
  });

  it('never counts a glance as reading', () => {
    expect(text).toContain("const READ_BUCKETS = ['read', 'study'];");
  });
});

describe('family progress route', () => {
  const routes = source('server/routes/family.ts');
  const start = routes.indexOf("app.get('/api/family/progress'");
  const body = routes.slice(start, routes.indexOf('\napp.', start + 1) === -1 ? undefined : routes.indexOf('\napp.', start + 1));

  it('builds entries from an allowlist', () => {
    const entry = body.slice(body.indexOf('entries: progress.map'), body.indexOf('})),', body.indexOf('entries: progress.map')));
    const fields = [...entry.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort();
    expect(fields).toEqual(['booksRead', 'chaptersRead', 'displayName', 'lastActive', 'notesWritten', 'userId']);
  });

  it('shows parents children only, a child only themself, and an adult nothing', () => {
    expect(body).toContain("mine.me.role === 'parent'");
    expect(body).toContain("eq(FamilyMembers.role, 'child')");
    expect(body).toContain("mine.me.role === 'child'");
    expect(body).toContain('subjects = [auth.userId]');
  });
});

describe('lastActiveBucket', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600 * 1000);
  it.each([
    [null, 'never'],
    [ago(2), 'day'],
    [ago(30), 'week'],
    [ago(24 * 10), 'month'],
    [ago(24 * 45), 'earlier'],
  ] as const)('%s → %s', (at, expected) => {
    expect(lastActiveBucket(at, now)).toBe(expected);
  });
});
