/**
 * The family's Bible: book names, from the members who chose to add theirs. This is the privacy
 * contract — it fails if the file reaches for chapters, anything written, or returns a person.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({}));

import { FAMILY_BIBLE_SHARED, FAMILY_BIBLE_UNSHARED, sharersFrom } from '../family-bible-books';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('family bible books — the never-list', () => {
  const text = code(source('server/utils/family-bible-books.ts'));

  it.each([
    'ReadingEvents.chapter',
    'ScriptureMetadata.chapter',
    'Notes.title',
    'Notes.content',
    'StudyThreadEntries',
    'Highlights',
    'ReviewItems',
    'ReviewEvents',
    'SearchEvents',
    'NoteVisitEvents',
  ])('never reads %s', (forbidden) => {
    expect(text).not.toContain(forbidden);
  });

  it('reads book names only', () => {
    expect(text).toContain('selectDistinct({ book: ReadingEvents.book })');
    expect(text).toContain('selectDistinct({ book: ScriptureMetadata.book })');
  });

  it('never counts a glance as reading', () => {
    expect(text).toContain("const READ_BUCKETS = ['read', 'study'];");
  });
});

describe('the space route, for a Family Space', () => {
  const routes = source('server/routes/spaces.ts');
  const start = routes.indexOf("route.get('/api/spaces/:spaceId/bible-coverage'");
  const body = routes.slice(start, routes.indexOf('\nroute.', start + 1));

  it('returns books and your own choice, and nobody else', () => {
    expect(body).toContain("kind: 'family', books, youShare: sharers.has(auth.userId)");
    expect(body).not.toMatch(/sharers\s*[,}]/);
  });

  it('has no "our" for a personal space', () => {
    expect(body).toContain("access.space.type === 'personal'");
    expect(body).toContain('404');
  });
});

describe('sharersFrom', () => {
  const shared = (who: string) => ({ actorUserId: who, kind: FAMILY_BIBLE_SHARED });
  const unshared = (who: string) => ({ actorUserId: who, kind: FAMILY_BIBLE_UNSHARED });

  it('counts nobody until they choose', () => {
    expect(sharersFrom(['a', 'b'], [])).toEqual(new Set());
  });

  it('takes each person’s latest choice', () => {
    // Newest first: b took theirs back after adding them; a added theirs after taking them out.
    const events = [unshared('b'), shared('a'), shared('b'), unshared('a')];
    expect(sharersFrom(['a', 'b'], events)).toEqual(new Set(['a']));
  });

  it('drops someone who has left', () => {
    expect(sharersFrom(['a'], [shared('gone'), shared('a')])).toEqual(new Set(['a']));
  });

  it('ignores an event with no actor', () => {
    expect(sharersFrom(['a'], [{ actorUserId: null, kind: FAMILY_BIBLE_SHARED }])).toEqual(new Set());
  });
});
