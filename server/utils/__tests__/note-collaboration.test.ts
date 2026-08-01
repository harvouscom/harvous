import { describe, expect, it } from 'vitest';
import { canEditNoteAsCollaborator } from '../note-collaboration';

const AUTHOR = 'user_author';
const MEMBER = 'user_member';

function note(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'note_1',
    userId: AUTHOR,
    contentEncrypted: false,
    coEditEnabled: false,
    threadId: 'thread_1',
    addedBy: 'user',
    ...overrides,
  } as any;
}

describe('canEditNoteAsCollaborator', () => {
  it('lets the author write their own note, opted in or not', () => {
    for (const coEditEnabled of [false, true]) {
      expect(
        canEditNoteAsCollaborator({
          note: note({ coEditEnabled }),
          actorId: AUTHOR,
          sharedSpaceIdsActorBelongsTo: [],
        }),
      ).toEqual({ allowed: true, role: 'author', viaSpaceId: null });
    }
  });

  it('denies a non-author until the note is opted in', () => {
    expect(
      canEditNoteAsCollaborator({
        note: note(),
        actorId: MEMBER,
        sharedSpaceIdsActorBelongsTo: ['space_a'],
      }),
    ).toEqual({ allowed: false, code: 'NOT_AUTHOR' });
  });

  it('grants a member of a shared space the note lives in', () => {
    expect(
      canEditNoteAsCollaborator({
        note: note({ coEditEnabled: true }),
        actorId: MEMBER,
        sharedSpaceIdsActorBelongsTo: ['space_a', 'space_b'],
      }),
    ).toEqual({ allowed: true, role: 'collaborator', viaSpaceId: 'space_a' });
  });

  it('denies when the actor shares no space with the note', () => {
    // The caller resolves the intersection; an empty list is how "removed
    // association", "left the space", and "soft-deleted space" all arrive here.
    expect(
      canEditNoteAsCollaborator({
        note: note({ coEditEnabled: true }),
        actorId: MEMBER,
        sharedSpaceIdsActorBelongsTo: [],
      }),
    ).toEqual({ allowed: false, code: 'NO_SHARED_SPACE' });
  });

  it('never lets a collaborator touch a locked note', () => {
    // Locked notes are end-to-end encrypted; co-editing them is not a policy
    // choice we could make, it's cryptographically meaningless.
    expect(
      canEditNoteAsCollaborator({
        note: note({ coEditEnabled: true, contentEncrypted: true }),
        actorId: MEMBER,
        sharedSpaceIdsActorBelongsTo: ['space_a'],
      }),
    ).toEqual({ allowed: false, code: 'ENCRYPTED' });
  });

  it('keeps the author writing their own locked note', () => {
    // Encryption blocks collaborators, not the person holding the key.
    expect(
      canEditNoteAsCollaborator({
        note: note({ contentEncrypted: true }),
        actorId: AUTHOR,
        sharedSpaceIdsActorBelongsTo: [],
      }),
    ).toEqual({ allowed: true, role: 'author', viaSpaceId: null });
  });

  it('keeps onboarding notes read-only for the author too', () => {
    const onboarding = note({ threadId: 'thread_onboarding_welcome', addedBy: 'system' });
    expect(
      canEditNoteAsCollaborator({
        note: onboarding,
        actorId: AUTHOR,
        sharedSpaceIdsActorBelongsTo: [],
      }),
    ).toEqual({ allowed: false, code: 'ONBOARDING' });
    expect(
      canEditNoteAsCollaborator({
        note: { ...onboarding, coEditEnabled: true },
        actorId: MEMBER,
        sharedSpaceIdsActorBelongsTo: ['space_a'],
      }),
    ).toEqual({ allowed: false, code: 'ONBOARDING' });
  });
});
