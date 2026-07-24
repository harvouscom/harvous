import { describe, expect, it } from 'vitest';
import {
  EXPIRED_SPACE_PURGE_TABLES,
  SPACE_RECOVERY_WINDOW_MS,
  buildAssociationReactivationPatch,
  buildAssociationRemovalPatch,
  canPublishNoteIntoSpace,
  canRestoreDeletedSpace,
  evaluateLockedInviteRedemption,
  isExpiredSpacePurgeCandidate,
  removeMemberPreservingResponses,
  serializeInvitePreview,
  serializeSpaceMemberForViewer,
  safeMemberDisplayName,
  setSingularThreadPin,
  softDeleteSpacePatch,
} from '../shared-space-lifecycle';
import { canAttachNoteToSharedThread, threadAllowsPublicBroadcast } from '../../routes/threads';
import {
  resolveSyncCanonicalTarget,
  resolveSyncThreadPolicy,
  syncSharedSpaceLifecycleUpdateError,
  syncStudyEntryRequiresHttp,
} from '../../routes/sync';

describe('Generation 2B lifecycle policy', () => {
  it('resolves shared sync creates to My Home plus an association', () => {
    expect(resolveSyncCanonicalTarget('shared', 'space_shared', 'space_home')).toEqual({
      canonicalSpaceId: 'space_home',
      associationSpaceId: 'space_shared',
    });
    expect(resolveSyncCanonicalTarget('personal', 'space_personal', null)).toEqual({
      canonicalSpaceId: 'space_personal',
      associationSpaceId: null,
    });
  });

  it('clears placement metadata on removal and reactivation', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    expect(buildAssociationRemovalPatch('user_a', now)).toMatchObject({
      removedBy: 'user_a',
      isPinned: false,
      primaryCollection: null,
      secondaryCollections: null,
      collectionPinned: false,
      collectionUserOverride: false,
    });
    expect(buildAssociationReactivationPatch('user_a', now)).toMatchObject({
      removedAt: null,
      removedBy: null,
      isPinned: false,
      primaryCollection: null,
    });
  });

  it('pins a thread through a singular transaction service', () => {
    const source = setSingularThreadPin.toString();
    expect(source).toContain('isPinned: false');
    expect(source).toContain('spaceId');
  });

  it('preserves member responses while archiving authored associations', () => {
    const source = removeMemberPreservingResponses.toString();
    expect(source).not.toContain('delete(StudyThreadEntries)');
    expect(source).toContain('actorDisplayNameSnapshot');
  });

  it('removes email from every non-owner member serialization', () => {
    const member = {
      userId: 'user_a',
      role: 'member',
      joinedAt: new Date('2026-07-01T00:00:00Z'),
      firstName: 'Ada',
      lastName: 'Lovelace',
      displayName: 'Ada Lovelace',
      email: 'private@example.com',
      profileImageUrl: 'https://example.test/avatar.png',
      userColor: 'blue',
      nested: {
        role: 'member',
        email: 'nested@example.com',
        backupEmail: 'backup@example.com',
        displayName: 'leaked@example.com',
      },
    };
    expect(serializeSpaceMemberForViewer(member, false)).toEqual({
      userId: 'user_a',
      role: 'member',
      joinedAt: new Date('2026-07-01T00:00:00Z'),
      displayName: 'Ada L.',
      profileImageUrl: 'https://example.test/avatar.png',
      userColor: 'blue',
    });
    expect(JSON.stringify(serializeSpaceMemberForViewer(member, false))).not.toMatch(
      /private@example|nested@example|Lovelace/,
    );
    expect(serializeSpaceMemberForViewer(member, true)).toEqual(member);
    expect(safeMemberDisplayName({ snapshot: 'private@example.com' })).toBe('Member');
    expect(safeMemberDisplayName({ firstName: 'Ada', lastName: 'Lovelace' })).toBe('Ada L.');
  });

  it('limits invite previews to metadata, count, and host state', () => {
    expect(
      serializeInvitePreview({
        space: { id: 'space_a', title: 'Study' },
        owner: { displayName: 'Host' },
        memberCount: 3,
        isAlreadyMember: false,
        expiresAt: null,
        viewer: { canJoin: true },
        notePreviews: [{ id: 'note_private' }],
        threadPreviews: [{ id: 'thread_private' }],
        memberPreviews: [{ email: 'private@example.com' }],
      }),
    ).toEqual({
      space: { id: 'space_a', title: 'Study' },
      owner: { displayName: 'Host' },
      memberCount: 3,
      isAlreadyMember: false,
      expiresAt: null,
      viewer: { canJoin: true },
    });
  });

  it('enforces the 30-day recovery window and safe purge table set', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    const patch = softDeleteSpacePatch(now);
    expect(patch.recoveryUntil.getTime() - now.getTime()).toBe(SPACE_RECOVERY_WINDOW_MS);
    expect(canRestoreDeletedSpace(patch, new Date(now.getTime() + 1_000))).toBe(true);
    expect(canRestoreDeletedSpace(patch, new Date(patch.recoveryUntil.getTime() + 1))).toBe(false);
    expect(EXPIRED_SPACE_PURGE_TABLES).not.toContain('Notes');
    expect(EXPIRED_SPACE_PURGE_TABLES).not.toContain('NoteVersions');
    expect(EXPIRED_SPACE_PURGE_TABLES).toContain('StudyThreadEntries');
    expect(isExpiredSpacePurgeCandidate(patch, new Date(patch.recoveryUntil.getTime() + 1))).toBe(true);
    expect(
      isExpiredSpacePurgeCandidate(
        { ...patch, deletedAt: null, recoveryUntil: null, isActive: true },
        new Date(patch.recoveryUntil.getTime() + 1),
      ),
    ).toBe(false);
  });

  it('requires an active, unencrypted association for shared Thread attachment', () => {
    expect(
      canAttachNoteToSharedThread({
        associationActive: true,
        contentEncrypted: false,
        actorIsNoteAuthor: true,
        actorMayModerate: false,
      }),
    ).toBe(true);
    expect(
      canAttachNoteToSharedThread({
        associationActive: false,
        contentEncrypted: false,
        actorIsNoteAuthor: true,
        actorMayModerate: true,
      }),
    ).toBe(false);
    expect(
      canAttachNoteToSharedThread({
        associationActive: true,
        contentEncrypted: true,
        actorIsNoteAuthor: true,
        actorMayModerate: true,
      }),
    ).toBe(false);
  });

  it('restricts public-space publishing to owner or active leaders', () => {
    const base = {
      spaceType: 'public',
      spaceOwnerId: 'owner',
      actorId: 'member',
    };
    expect(canPublishNoteIntoSpace({ ...base, membershipRole: 'member' })).toBe(false);
    expect(canPublishNoteIntoSpace({ ...base, membershipRole: 'leader' })).toBe(true);
    expect(canPublishNoteIntoSpace({ ...base, actorId: 'owner', membershipRole: 'member' })).toBe(true);
  });

  it('rejects public shared Threads and delegates shared response sync to HTTP', () => {
    expect(threadAllowsPublicBroadcast('shared')).toBe(false);
    expect(threadAllowsPublicBroadcast('public')).toBe(false);
    expect(threadAllowsPublicBroadcast('personal')).toBe(true);
    expect(resolveSyncThreadPolicy('shared', { isPublic: true })).toEqual({
      ok: false,
      error: 'Shared-space Threads cannot be public',
    });
    expect(resolveSyncThreadPolicy('shared', { isPinned: true })).toMatchObject({
      ok: true,
      singularPin: true,
      isPublic: false,
    });
    expect(syncStudyEntryRequiresHttp('shared')).toBe(true);
    expect(syncStudyEntryRequiresHttp('personal')).toBe(false);
    expect(syncSharedSpaceLifecycleUpdateError('shared', { isActive: false })).toContain(
      'SHARED_SPACE_DELETE_HTTP_REQUIRED',
    );
    expect(syncSharedSpaceLifecycleUpdateError('public', { isActive: true })).toContain(
      'SHARED_SPACE_DELETE_HTTP_REQUIRED',
    );
    expect(syncSharedSpaceLifecycleUpdateError('personal', { isActive: false })).toBeNull();
  });

  it('rechecks every invite condition from locked transaction rows', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    const base = {
      invite: { revokedAt: null, expiresAt: new Date(now.getTime() + 1000), maxUses: 2, useCount: 0 },
      space: { deletedAt: null, type: 'shared' },
      alreadyMember: false,
      memberCount: 1,
      memberCap: 10,
      now,
    };
    expect(evaluateLockedInviteRedemption(base)).toBe('join');
    expect(evaluateLockedInviteRedemption({ ...base, space: { ...base.space, deletedAt: now } })).toBe('dead');
    expect(evaluateLockedInviteRedemption({ ...base, alreadyMember: true })).toBe('already-member');
    expect(evaluateLockedInviteRedemption({ ...base, memberCount: 10 })).toBe('full');
    expect(
      evaluateLockedInviteRedemption({
        ...base,
        invite: { ...base.invite, expiresAt: now },
      }),
    ).toBe('dead');
  });
});
