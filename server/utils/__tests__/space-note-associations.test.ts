import { describe, expect, it } from 'vitest';
import {
  SpaceNoteAssociationError,
  assessLegacyAssociationCandidate,
  assertCanAssociateCanonicalNote,
  buildSpaceNoteAssociation,
  buildSpaceNoteReactivationPatch,
  buildSpaceNoteRemovalPatch,
  isActiveSpaceNote,
  isSpaceRecoveryStateValid,
} from '../space-note-associations';

const note = { id: 'note_1', userId: 'user_author', contentEncrypted: false };
const space = {
  id: 'space_1',
  type: 'shared',
  userId: 'user_owner',
  deletedAt: null,
  recoveryUntil: null,
};
const membership = { id: 'smem_1', spaceId: 'space_1', userId: 'user_author', role: 'member' };

describe('canonical space-note association policy', () => {
  it('allows an unencrypted author note for a shared-space member', () => {
    expect(() =>
      assertCanAssociateCanonicalNote({ note, space, membership, actorId: 'user_author' }),
    ).not.toThrow();
  });

  it.each([
    {
      expected: 'NOT_NOTE_AUTHOR',
      input: { note, space, membership, actorId: 'user_other' },
    },
    {
      expected: 'ENCRYPTED_NOTE',
      input: { note: { ...note, contentEncrypted: true }, space, membership, actorId: 'user_author' },
    },
    {
      expected: 'INVALID_SPACE_TYPE',
      input: { note, space: { ...space, type: 'personal' }, membership, actorId: 'user_author' },
    },
    {
      expected: 'NOT_SPACE_MEMBER',
      input: { note, space, membership: null, actorId: 'user_author' },
    },
    {
      expected: 'ROLE_CANNOT_ASSOCIATE',
      input: {
        note,
        space: { ...space, type: 'public' },
        membership,
        actorId: 'user_author',
      },
    },
    {
      expected: 'SPACE_DELETED',
      input: {
        note,
        space: {
          ...space,
          deletedAt: new Date('2026-07-01T00:00:00Z'),
          recoveryUntil: new Date('2026-07-31T00:00:00Z'),
        },
        membership,
        actorId: 'user_author',
      },
    },
  ])('rejects invalid associations with $expected', ({ input, expected }) => {
    try {
      assertCanAssociateCanonicalNote(input);
      throw new Error('expected association policy to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(SpaceNoteAssociationError);
      expect((error as SpaceNoteAssociationError).code).toBe(expected);
    }
  });

  it('serializes deduplicated per-space organization metadata', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    expect(
      buildSpaceNoteAssociation({
        id: 'snote_1',
        spaceId: 'space_1',
        noteId: 'note_1',
        actorId: 'user_author',
        now,
        organization: {
          isPinned: true,
          primaryCollection: '  Romans ',
          secondaryCollections: ['Prayer', ' Prayer ', ''],
          collectionPinned: true,
          order: 4,
        },
      }),
    ).toMatchObject({
      isPinned: true,
      primaryCollection: 'Romans',
      secondaryCollections: JSON.stringify(['Prayer']),
      collectionPinned: true,
      order: 4,
      removedAt: null,
    });
  });

  it('clears archived placement by default when reactivating', () => {
    const patch = buildSpaceNoteReactivationPatch({
      actorId: 'user_author',
      now: new Date('2026-07-09T12:00:00Z'),
    });
    expect(patch).toMatchObject({
      removedAt: null,
      removedBy: null,
      isPinned: false,
      primaryCollection: null,
      secondaryCollections: null,
      order: 0,
    });
  });

  it('allows removal only by the note author or space owner', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    expect(
      buildSpaceNoteRemovalPatch({
        actorId: 'user_author',
        noteAuthorId: 'user_author',
        spaceId: 'space_1',
        spaceOwnerId: 'user_owner',
        membership,
        now,
      }),
    ).toEqual({ removedBy: 'user_author', removedAt: now, updatedAt: now });
    expect(() =>
      buildSpaceNoteRemovalPatch({
        actorId: 'user_member',
        noteAuthorId: 'user_author',
        spaceId: 'space_1',
        spaceOwnerId: 'user_owner',
        membership: { id: 'smem_2', spaceId: 'space_1', userId: 'user_member', role: 'member' },
        now,
      }),
    ).toThrowError(SpaceNoteAssociationError);
  });

  it('rejects a forged owner membership bound to another actor or space', () => {
    expect(() =>
      buildSpaceNoteRemovalPatch({
        actorId: 'user_member',
        noteAuthorId: 'user_author',
        spaceId: 'space_1',
        spaceOwnerId: 'user_owner',
        membership: { id: 'smem_owner', spaceId: 'space_other', userId: 'user_owner', role: 'owner' },
        now: new Date('2026-07-09T12:00:00Z'),
      }),
    ).toThrowError('Membership does not match actor and space');
  });

  it('rejects a matching forged owner role for public association and removal', () => {
    const forgedOwner = { id: 'smem_forged', spaceId: 'space_1', userId: 'user_author', role: 'owner' };
    expect(() =>
      assertCanAssociateCanonicalNote({
        note,
        space: { ...space, type: 'public' },
        membership: forgedOwner,
        actorId: 'user_author',
      }),
    ).toThrowError('This membership role cannot add notes to the space');
    expect(() =>
      buildSpaceNoteRemovalPatch({
        actorId: 'user_author',
        noteAuthorId: 'user_other',
        spaceId: 'space_1',
        spaceOwnerId: 'user_owner',
        membership: forgedOwner,
        now: new Date('2026-07-09T12:00:00Z'),
      }),
    ).toThrowError('Only the note author or space owner can remove this note');
  });

  it('allows public authorship only for Spaces.userId or a verified leader', () => {
    expect(() =>
      assertCanAssociateCanonicalNote({
        note: { ...note, userId: 'user_owner' },
        space: { ...space, type: 'public' },
        membership: null,
        actorId: 'user_owner',
      }),
    ).not.toThrow();
    expect(() =>
      assertCanAssociateCanonicalNote({
        note,
        space: { ...space, type: 'public' },
        membership: { ...membership, role: 'leader' },
        actorId: 'user_author',
      }),
    ).not.toThrow();
    expect(
      buildSpaceNoteRemovalPatch({
        actorId: 'user_owner',
        noteAuthorId: 'user_author',
        spaceId: 'space_1',
        spaceOwnerId: 'user_owner',
        membership: null,
        now: new Date('2026-07-09T12:00:00Z'),
      }).removedBy,
    ).toBe('user_owner');
  });

  it('supports owner fallback and reports invalid legacy migration candidates', () => {
    expect(
      assessLegacyAssociationCandidate({
        note: { ...note, userId: 'user_owner' },
        space,
        membership: null,
      }),
    ).toBe('eligible');
    expect(assessLegacyAssociationCandidate({ note, space, membership: null })).toBe('missing-membership');
    expect(
      assessLegacyAssociationCandidate({
        note,
        space: {
          ...space,
          deletedAt: new Date('2026-07-01T00:00:00Z'),
          recoveryUntil: new Date('2026-07-31T00:00:00Z'),
        },
        membership,
      }),
    ).toBe('deleted-space');
  });

  it('requires an exact 30-day recovery window only for deleted non-personal spaces', () => {
    expect(isSpaceRecoveryStateValid(space)).toBe(true);
    expect(
      isSpaceRecoveryStateValid({
        type: 'shared',
        deletedAt: new Date('2026-07-01T00:00:00Z'),
        recoveryUntil: new Date('2026-07-31T00:00:00Z'),
      }),
    ).toBe(true);
    expect(
      isSpaceRecoveryStateValid({
        type: 'shared',
        deletedAt: null,
        recoveryUntil: new Date('2026-07-31T00:00:00Z'),
      }),
    ).toBe(false);
  });

  it('defines active strictly as removedAt null', () => {
    expect(isActiveSpaceNote({ removedAt: null })).toBe(true);
    expect(isActiveSpaceNote({ removedAt: new Date() })).toBe(false);
  });
});
