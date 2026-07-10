import { describe, expect, it } from 'vitest';
import {
  ActiveSharedAssociationEncryptionError,
  NoteVersionConflictError,
  assertCanonicalEncryptionAllowed,
  assertExpectedNoteVersion,
  buildRestoreVersionContent,
  noteVersionErrorResponse,
  resolveLockedCanonicalMutation,
  resolveLockedEncryptionState,
  resolveCanonicalCreateScope,
  shouldForceNoteVersionCheckpoint,
} from '../note-version-service';
import { NoteVersionAccessError } from '../note-versioning';

describe('canonical note version service policy', () => {
  it('resolves omitted encryption from the transaction-locked note', () => {
    expect(resolveLockedEncryptionState(undefined, true)).toBe(true);
    expect(resolveLockedEncryptionState(undefined, false)).toBe(false);
    expect(resolveLockedEncryptionState(false, true)).toBe(false);
  });
  it('keeps personal creates private and re-homes shared creates', () => {
    expect(
      resolveCanonicalCreateScope({
        targetSpace: { id: 'space_personal', type: 'personal' },
        myHomeSpaceId: 'space_home',
      }),
    ).toEqual({ canonicalSpaceId: 'space_personal', associationSpaceId: null });
    expect(
      resolveCanonicalCreateScope({
        targetSpace: { id: 'space_shared', type: 'shared' },
        myHomeSpaceId: 'space_home',
      }),
    ).toEqual({ canonicalSpaceId: 'space_home', associationSpaceId: 'space_shared' });
    expect(resolveCanonicalCreateScope({ targetSpace: null, myHomeSpaceId: null })).toEqual({
      canonicalSpaceId: null,
      associationSpaceId: null,
    });
  });

  it('requires My Home for shared canonical creation', () => {
    expect(() =>
      resolveCanonicalCreateScope({
        targetSpace: { id: 'space_shared', type: 'shared' },
        myHomeSpaceId: null,
      }),
    ).toThrow('My Home is required');
  });

  it('accepts compatible saves and rejects stale expectedVersion values', () => {
    expect(() => assertExpectedNoteVersion(undefined, 4)).not.toThrow();
    expect(() => assertExpectedNoteVersion(4, 4)).not.toThrow();
    expect(() => assertExpectedNoteVersion(3, 4)).toThrowError(NoteVersionConflictError);
    expect(noteVersionErrorResponse(new NoteVersionConflictError(3, 4))).toEqual({
      status: 409,
      code: 'NOTE_VERSION_CONFLICT',
      message: 'Expected note version 3, but current version is 4',
      details: { expectedVersion: 3, currentVersion: 4 },
    });
  });

  it('maps author-only history failures without exposing a body', () => {
    expect(noteVersionErrorResponse(new NoteVersionAccessError())).toEqual({
      status: 403,
      code: 'NOT_NOTE_AUTHOR',
      message: 'Only the note author can access or change note history',
    });
  });

  it('restores historical content as a new snapshot input', () => {
    const historical = {
      title: 'Earlier title',
      content: '<p>Earlier body</p>',
      contentEncrypted: false,
    };
    expect(buildRestoreVersionContent(historical)).toEqual(historical);
    expect(buildRestoreVersionContent(historical)).not.toBe(historical);
  });

  it('rejects encrypted saves and restores while shared associations are active', () => {
    expect(() => assertCanonicalEncryptionAllowed(true, true)).toThrowError(
      ActiveSharedAssociationEncryptionError,
    );
    expect(() => assertCanonicalEncryptionAllowed(false, true)).not.toThrow();
    expect(
      noteVersionErrorResponse(new ActiveSharedAssociationEncryptionError()),
    ).toMatchObject({ status: 409, code: 'ACTIVE_SHARED_ASSOCIATIONS' });
  });

  it('merges snapshot fields from the transaction-locked note', () => {
    const locked = {
      title: 'Concurrent title',
      content: '<p>Concurrent body</p>',
      contentEncrypted: false,
    } as any;
    const resolved = resolveLockedCanonicalMutation(locked, {
      patch: (note) => ({ title: note.title }),
      nextContent: (note) => ({
        title: note.title,
        content: `${note.content}<p>Saved edit</p>`,
        contentEncrypted: note.contentEncrypted,
      }),
    });
    expect(resolved.nextContent).toEqual({
      title: 'Concurrent title',
      content: '<p>Concurrent body</p><p>Saved edit</p>',
      contentEncrypted: false,
    });
  });

  it('forces same-content restores to create a new immutable checkpoint', () => {
    expect(shouldForceNoteVersionCheckpoint('restore')).toBe(true);
    expect(shouldForceNoteVersionCheckpoint('save')).toBe(false);
  });
});
