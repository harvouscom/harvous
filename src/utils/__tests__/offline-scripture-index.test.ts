import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearScriptureIndexLocal,
  getScriptureIndexLocal,
  saveScriptureIndexLocal,
} from '../offline-scripture-index';
import { offlineDB } from '../offline-db';

/**
 * The mirror exists for one reason: reading is the thing that has to keep working without a
 * network, and the margin markers are derived from an index that lives on the server. These
 * assert the round trip a plane ride depends on.
 */
describe('offline scripture index mirror', () => {
  const userId = 'user-1';
  const otherUserId = 'user-2';
  const spaceId = 'space-1';

  const books = [
    {
      bookOrder: 44,
      passages: [
        {
          passageKey: '44:8:1:11',
          displayRef: 'Romans 8:1-11',
          bookOrder: 44,
          chapter: 8,
          verseStart: 1,
          verseEnd: 11,
          notes: [
            { id: 'n1', title: 'No Condemnation', updatedAt: '2026-08-09T00:00:00.000Z', createdAt: '2026-08-09T00:00:00.000Z' },
          ],
        },
      ],
    },
  ];

  beforeEach(async () => {
    await offlineDB.scriptureIndexCache.clear();
  });

  it('round-trips the index it was given', async () => {
    await saveScriptureIndexLocal(userId, spaceId, books);

    expect(await getScriptureIndexLocal(userId, spaceId)).toEqual(books);
  });

  it('keeps one space and one user apart', async () => {
    await saveScriptureIndexLocal(userId, spaceId, books);

    expect(await getScriptureIndexLocal(otherUserId, spaceId)).toBeNull();
    expect(await getScriptureIndexLocal(userId, 'space-2')).toBeNull();
  });

  it('overwrites rather than accumulating, so a deleted note cannot linger', async () => {
    await saveScriptureIndexLocal(userId, spaceId, books);
    await saveScriptureIndexLocal(userId, spaceId, []);

    expect(await getScriptureIndexLocal(userId, spaceId)).toEqual([]);
    expect(await offlineDB.scriptureIndexCache.count()).toBe(1);
  });

  it('clears on request, so stale dots cannot outlive their notes', async () => {
    await saveScriptureIndexLocal(userId, spaceId, books);
    await clearScriptureIndexLocal(userId, spaceId);

    expect(await getScriptureIndexLocal(userId, spaceId)).toBeNull();
  });

  it('returns null rather than throwing when nothing was ever mirrored', async () => {
    expect(await getScriptureIndexLocal(userId, spaceId)).toBeNull();
    expect(await getScriptureIndexLocal('', '')).toBeNull();
  });

});
