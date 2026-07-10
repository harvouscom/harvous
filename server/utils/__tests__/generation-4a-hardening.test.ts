import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SpaceNoteAssociationError,
  resolveCreateThreadAttachment,
} from '../space-note-associations';

const routeSource = (name: string) =>
  readFileSync(resolve(process.cwd(), 'server', 'routes', `${name}.ts`), 'utf8');

describe('Generation 4A canonical copy privacy', () => {
  it('starts independent copies in My Home without source organization', () => {
    const spaces = routeSource('spaces');
    const copyStart = spaces.indexOf("route.post('/api/spaces/:spaceId/copy-notes'");
    const copyEnd = spaces.indexOf("route.post('/api/spaces/:spaceId/pin-item'", copyStart);
    const copyRoute = spaces.slice(copyStart, copyEnd);

    expect(copyRoute).toContain("threadId: 'thread_unorganized'");
    expect(copyRoute).toContain('spaceId: canonicalCopySpaceId');
    expect(copyRoute).toContain('primaryCollection: null');
    expect(copyRoute).toContain('secondaryCollections: null');
    expect(copyRoute).toContain('isPinned: false');
    expect(copyRoute).toContain('order: 0');
    expect(copyRoute).toContain('studyThreadTitle: null');
    expect(copyRoute).not.toContain('primaryCollection: source.primaryCollection');
    expect(copyRoute).not.toContain('secondaryCollections: source.secondaryCollections');
  });
});

describe('Generation 4A transactional Thread attachment', () => {
  it('keeps shared canonical organization unorganized while attaching to the target Thread', () => {
    expect(
      resolveCreateThreadAttachment({
        requestedThreadId: 'thread_shared',
        targetSpaceId: 'space_shared',
        targetSpaceType: 'shared',
        actorId: 'user_a',
        noteAuthorId: 'user_a',
        thread: {
          id: 'thread_shared',
          spaceId: 'space_shared',
          userId: 'space_owner',
          isPinned: true,
        },
      }),
    ).toEqual({
      attachThreadId: 'thread_shared',
      canonicalThreadId: 'thread_unorganized',
    });
  });

  it('rejects a Thread outside the shared target', () => {
    expect(() =>
      resolveCreateThreadAttachment({
        requestedThreadId: 'thread_other',
        targetSpaceId: 'space_shared',
        targetSpaceType: 'shared',
        actorId: 'user_a',
        noteAuthorId: 'user_a',
        thread: {
          id: 'thread_other',
          spaceId: 'space_other',
          userId: 'user_a',
          isPinned: true,
        },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<SpaceNoteAssociationError>>({
        code: 'THREAD_NOT_IN_TARGET_SPACE',
      }),
    );
  });

  it('preserves personal Thread creation behavior', () => {
    expect(
      resolveCreateThreadAttachment({
        requestedThreadId: 'thread_personal',
        targetSpaceId: 'space_home',
        targetSpaceType: 'personal',
        actorId: 'user_a',
        noteAuthorId: 'user_a',
        thread: {
          id: 'thread_personal',
          spaceId: 'space_home',
          userId: 'user_a',
        },
      }),
    ).toEqual({
      attachThreadId: 'thread_personal',
      canonicalThreadId: 'thread_personal',
    });
  });

  it('writes note, version, association, and Thread junction in one transaction', () => {
    const notes = routeSource('notes');
    const createStart = notes.indexOf("route.post('/api/notes/create'");
    const transactionStart = notes.indexOf('const newNote = await db.transaction(async (tx) => {', createStart);
    const transactionEnd = notes.indexOf('// Mirror create-from-highlight', transactionStart);
    const createTransaction = notes.slice(transactionStart, transactionEnd);

    expect(transactionStart).toBeGreaterThan(createStart);
    expect(createTransaction).toMatch(/tx\s*\.\s*insert\(Notes\)/);
    expect(createTransaction).toContain('createInitialNoteVersion(tx');
    expect(createTransaction).toContain('tx.insert(SpaceNotes)');
    expect(createTransaction).toContain('tx.insert(NoteThreads)');
    expect(createTransaction).not.toMatch(/db\s*\.\s*insert\(NoteThreads\)/);
    expect(notes.slice(transactionEnd, notes.indexOf('// Non-critical: XP', transactionEnd))).not.toContain(
      'Error adding note to specific thread',
    );
  });
});
