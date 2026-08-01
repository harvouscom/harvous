import { describe, expect, it } from 'vitest';
import { canEditNoteAsCollaborator } from '../note-collaboration';

const AUTHOR = 'user_author';
const MEMBER = 'user_member';

function note(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'note_1',
    userId: AUTHOR,
    contentEncrypted: false,
    threadId: 'thread_1',
    addedBy: 'user',
    ...overrides,
  } as any;
}

describe('canEditNoteAsCollaborator', () => {
  it('lets the author write their own note whether or not any space grants edit', () => {
    expect(
      canEditNoteAsCollaborator({
        note: note(),
        actorId: AUTHOR,
        sharedSpaceIdsActorBelongsTo: [],
      }),
    ).toEqual({ allowed: true, role: 'author', viaSpaceId: null });
    expect(
      canEditNoteAsCollaborator({
        note: note(),
        actorId: AUTHOR,
        sharedSpaceIdsActorBelongsTo: ['space_family'],
      }),
    ).toEqual({ allowed: true, role: 'author', viaSpaceId: null });
  });

  it('denies a member when no association grants them edit', () => {
    // Caller only passes spaces where SpaceNotes.coEditEnabled is true AND the
    // actor is a member — empty means Family OFF / left the space / etc.
    expect(
      canEditNoteAsCollaborator({
        note: note(),
        actorId: MEMBER,
        sharedSpaceIdsActorBelongsTo: [],
      }),
    ).toEqual({ allowed: false, code: 'NO_SHARED_SPACE' });
  });

  it('grants a member of a space where co-edit is on', () => {
    expect(
      canEditNoteAsCollaborator({
        note: note(),
        actorId: MEMBER,
        sharedSpaceIdsActorBelongsTo: ['space_family'],
      }),
    ).toEqual({ allowed: true, role: 'collaborator', viaSpaceId: 'space_family' });
  });

  it('uses the first granting space as viaSpaceId when several are on', () => {
    expect(
      canEditNoteAsCollaborator({
        note: note(),
        actorId: MEMBER,
        sharedSpaceIdsActorBelongsTo: ['space_family', 'space_group'],
      }),
    ).toEqual({ allowed: true, role: 'collaborator', viaSpaceId: 'space_family' });
  });

  it('never lets a collaborator touch a locked note', () => {
    expect(
      canEditNoteAsCollaborator({
        note: note({ contentEncrypted: true }),
        actorId: MEMBER,
        sharedSpaceIdsActorBelongsTo: ['space_family'],
      }),
    ).toEqual({ allowed: false, code: 'ENCRYPTED' });
  });

  it('keeps the author writing their own locked note', () => {
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
        note: onboarding,
        actorId: MEMBER,
        sharedSpaceIdsActorBelongsTo: ['space_family'],
      }),
    ).toEqual({ allowed: false, code: 'ONBOARDING' });
  });
});
