import { describe, it, expect, vi, beforeEach } from 'vitest';

const sharedRows: { value: unknown[] } = { value: [] };

vi.mock('../../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db')>();
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => sharedRows.value,
  };
  return { ...actual, db: { ...actual.db, select: () => chain } };
});

import { refuseLockToggle } from '../note-lock-guards';

describe('refuseLockToggle', () => {
  beforeEach(() => {
    sharedRows.value = [];
  });

  it('ignores saves that do not change the lock', async () => {
    expect(await refuseLockToggle({ noteId: 'n', requested: undefined, current: true, actorRole: 'collaborator' })).toBeNull();
    expect(await refuseLockToggle({ noteId: 'n', requested: true, current: true, actorRole: 'collaborator' })).toBeNull();
  });

  it('lets only the author lock or unlock', async () => {
    const refusal = await refuseLockToggle({ noteId: 'n', requested: true, current: false, actorRole: 'collaborator' });
    expect(refusal).toMatchObject({ status: 403, code: 'LOCK_AUTHOR_ONLY' });
    const unlock = await refuseLockToggle({ noteId: 'n', requested: false, current: true, actorRole: 'collaborator' });
    expect(unlock).toMatchObject({ status: 403 });
  });

  it('refuses to lock a note that lives in a shared space', async () => {
    sharedRows.value = [{ id: 'sn_1' }];
    const refusal = await refuseLockToggle({ noteId: 'n', requested: true, current: false, actorRole: 'author' });
    expect(refusal).toMatchObject({ status: 409, code: 'LOCKED_NOTE_IN_SHARED_SPACE' });
  });

  it('allows the author to lock a private note, and to unlock any of theirs', async () => {
    expect(await refuseLockToggle({ noteId: 'n', requested: true, current: false, actorRole: 'author' })).toBeNull();
    sharedRows.value = [{ id: 'sn_1' }];
    expect(await refuseLockToggle({ noteId: 'n', requested: false, current: true, actorRole: 'author' })).toBeNull();
  });
});
