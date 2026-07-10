import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isActualSpaceOwner } from '../space-access';
import {
  SharedSpaceLifecycleError,
  assertSharedThreadNotePolicy,
  selectPinnedThreadWinner,
  type SharedThreadNotePolicyInput,
} from '../shared-space-lifecycle';
import { resolveCreateThreadAttachment } from '../space-note-associations';
import { assertInboxThreadBundleTarget } from '../../routes/inbox';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const policyInput = (
  overrides: Partial<SharedThreadNotePolicyInput> = {},
): SharedThreadNotePolicyInput => ({
  actorId: 'member',
  requireCurrent: true,
  space: {
    id: 'space_shared',
    type: 'shared',
    userId: 'owner',
    deletedAt: null,
  },
  membership: {
    spaceId: 'space_shared',
    userId: 'member',
    role: 'member',
  },
  thread: {
    id: 'thread_current',
    spaceId: 'space_shared',
    isPinned: true,
  },
  note: {
    id: 'note_member',
    userId: 'member',
    contentEncrypted: false,
  },
  association: {
    spaceId: 'space_shared',
    noteId: 'note_member',
    removedAt: null,
  },
  ...overrides,
});

describe('Generation 4B shared Thread authorization', () => {
  it('routes Inbox collaborative notes through canonical association policy', () => {
    const inbox = source('server/routes/inbox.ts');
    const start = inbox.indexOf("app.post('/api/inbox/add-to-harvous'");
    const end = inbox.indexOf('// ─── POST/GET /api/inbox/auto-archive', start);
    const route = inbox.slice(start, end);
    expect(route).toContain('await db.transaction(async (tx)');
    expect(route).toContain('assertCanAssociateCanonicalNote');
    expect(route).toContain('resolveCreateThreadAttachment');
    expect(route).toContain("title: 'My Home'");
    expect(route).toContain('buildSpaceNoteAssociation');
    expect(route).toContain('noteRows[index].threadId = collaborativeTarget');
    expect(route).toContain('assertInboxThreadBundleTarget');
    expect(route).not.toContain('spaceId: targetSpaceId || null');
  });

  it('allows only the actual owner to create a collaborative Inbox Thread bundle', () => {
    const sharedSpace = {
      userId: 'owner',
      type: 'shared',
      deletedAt: null,
    };
    expect(() =>
      assertInboxThreadBundleTarget({ actorId: 'owner', space: sharedSpace }),
    ).not.toThrow();
    expect(() =>
      assertInboxThreadBundleTarget({ actorId: 'member', space: sharedSpace }),
    ).toThrowError(
      expect.objectContaining({
        code: 'SHARED_SPACE_OWNER_REQUIRED',
        status: 403,
      }),
    );
  });

  it('rejects admin note creation into collaborative Threads', () => {
    const admin = source('server/routes/admin.ts');
    const start = admin.indexOf("app.post('/api/admin/threads/:threadId/notes'");
    const end = admin.indexOf('// ─── POST /api/admin/regenerate-note-tags', start);
    const route = admin.slice(start, end);
    expect(route).toContain("targetSpace.type === 'shared'");
    expect(route).toContain("targetSpace.type === 'public'");
    expect(route).toContain("'CANONICAL_SHARED_NOTE_FLOW_REQUIRED'");
    expect(route).toMatch(/CANONICAL_SHARED_NOTE_FLOW_REQUIRED'[\s\S]*?409/);
    expect(route).toContain('createInitialNoteVersion(tx');
  });

  it('does not leak hidden Thread counts in member space prefetch', () => {
    const spaces = source('server/routes/spaces.ts');
    const memberStart = spaces.indexOf('// Member path');
    const memberEnd = spaces.indexOf('// ─── POST /api/spaces/:spaceId/add-note', memberStart);
    const memberPrefetch = spaces.slice(memberStart, memberEnd);
    expect(memberPrefetch).toContain(
      'and(eq(Threads.spaceId, spaceId), eq(Threads.isPinned, true))',
    );
  });

  it('uses Spaces.userId, not membership role, for owner-only controls', () => {
    const space = { userId: 'owner' };
    expect(isActualSpaceOwner(space, 'owner')).toBe(true);
    expect(isActualSpaceOwner(space, 'leader')).toBe(false);
    expect(isActualSpaceOwner(space, 'member')).toBe(false);
    expect(isActualSpaceOwner(space, 'nonmember')).toBe(false);

    const threads = source('server/routes/threads.ts');
    const spaces = source('server/routes/spaces.ts');
    const sync = source('server/routes/sync.ts');
    expect(threads).toContain('isActualSpaceOwner(access.space, auth.userId)');
    expect(spaces).toContain('isActualSpaceOwner(accessInfo.space, auth.userId)');
    expect(sync).toContain('isActualSpaceOwner(space, userId)');
  });

  it('allows an active author to attach only to the current same-space Thread', () => {
    expect(() => assertSharedThreadNotePolicy(policyInput())).not.toThrow();
    for (const input of [
      policyInput({ thread: { id: 'old', spaceId: 'space_shared', isPinned: false } }),
      policyInput({ thread: { id: 'other', spaceId: 'space_other', isPinned: true } }),
      policyInput({ membership: null }),
      policyInput({
        association: {
          spaceId: 'space_shared',
          noteId: 'note_member',
          removedAt: new Date('2026-07-09T12:00:00Z'),
        },
      }),
      policyInput({ note: { id: 'note_member', userId: 'member', contentEncrypted: true } }),
      policyInput({ note: { id: 'note_other', userId: 'other', contentEncrypted: false } }),
      policyInput({
        space: {
          id: 'space_shared',
          type: 'shared',
          userId: 'owner',
          deletedAt: new Date('2026-07-09T12:00:00Z'),
        },
      }),
    ]) {
      expect(() => assertSharedThreadNotePolicy(input)).toThrowError(SharedSpaceLifecycleError);
    }
  });

  it('rejects stale shared compose while preserving personal Thread compatibility', () => {
    expect(() =>
      resolveCreateThreadAttachment({
        requestedThreadId: 'thread_old',
        targetSpaceId: 'space_shared',
        targetSpaceType: 'shared',
        actorId: 'member',
        noteAuthorId: 'member',
        thread: {
          id: 'thread_old',
          spaceId: 'space_shared',
          userId: 'owner',
          isPinned: false,
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'THREAD_NOT_CURRENT' }));

    expect(
      resolveCreateThreadAttachment({
        requestedThreadId: 'thread_personal',
        targetSpaceId: 'space_home',
        targetSpaceType: 'personal',
        actorId: 'member',
        noteAuthorId: 'member',
        thread: {
          id: 'thread_personal',
          spaceId: 'space_home',
          userId: 'member',
          isPinned: false,
        },
      }),
    ).toEqual({
      attachThreadId: 'thread_personal',
      canonicalThreadId: 'thread_personal',
    });
  });

  it('routes forged sync create, update, and delete through the shared policy', () => {
    const sync = source('server/routes/sync.ts');
    const start = sync.indexOf('async function assertSyncNoteThreadPolicy');
    const end = sync.indexOf('async function processTagMutation', start);
    const noteThreadPolicy = sync.slice(start, end);
    expect(noteThreadPolicy).toContain(
      'return authorizeNoteThreadMutationInTransaction(executor',
    );
    expect(noteThreadPolicy).toContain("operation === 'create'");
    expect(noteThreadPolicy).toContain("operation === 'update'");
    expect(noteThreadPolicy).toContain("operation === 'delete'");
    expect(noteThreadPolicy).toContain('await assertSyncNoteThreadPolicy');
    expect(noteThreadPolicy).not.toMatch(/insert\(NoteThreads\)[\s\S]*?returning\(\)\)!;\s*return/);
  });
});

describe('Generation 4B singular Thread pin deployment', () => {
  it('deterministically keeps the newest pinned Thread', () => {
    const winner = selectPinnedThreadWinner([
      {
        id: 'thread_old',
        createdAt: new Date('2026-07-01T12:00:00Z'),
        updatedAt: null,
      },
      {
        id: 'thread_new_b',
        createdAt: new Date('2026-07-09T12:00:00Z'),
        updatedAt: null,
      },
      {
        id: 'thread_new_a',
        createdAt: new Date('2026-07-09T12:00:00Z'),
        updatedAt: null,
      },
    ]);
    expect(winner?.id).toBe('thread_new_b');
  });

  it('verifies and repairs duplicates before the partial unique index is applied', () => {
    const schema = source('server/db/schema.ts');
    const verifier = source('server/scripts/verify-canonical-space-notes.ts');
    const repair = source('server/scripts/backfill-canonical-space-notes.ts');
    expect(schema).toContain("uniqueIndex('Threads_onePinnedPerSpace')");
    expect(schema).toContain('IS NOT NULL');
    expect(schema).toContain('isPinned} = true');
    expect(verifier).toContain('spaces with multiple pinned Threads');
    expect(repair).toContain('repairMultiplePinnedThreads');
    expect(repair).toContain('repair multiple pinned Threads before applying schema indexes');
  });
});

describe('Generation 4B DB error propagation', () => {
  it('does not turn member Thread query failures into empty pages', () => {
    const data = source('server/utils/dashboard-data.ts');
    const start = data.indexOf('export async function getNotesForThreadForMember');
    const end = data.indexOf('export function sharedThreadResultThreadId', start);
    const memberQuery = data.slice(start, end);
    expect(memberQuery).not.toContain('catch');
    expect(memberQuery).not.toContain('Error fetching notes for thread (member)');
  });
});
