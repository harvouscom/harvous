import { describe, expect, it } from 'vitest';
import {
  everyRowAllows,
  resolveNoteRowCapabilities,
  type NoteRowCapabilityInput,
} from '../note-row-capabilities';

const ownInHome: NoteRowCapabilityInput = {
  isOwnNote: true,
  isScopedSharedSpace: false,
  viewerIsSpaceOwner: false,
};
const ownInSpace: NoteRowCapabilityInput = {
  isOwnNote: true,
  isScopedSharedSpace: true,
  viewerIsSpaceOwner: false,
};
const foreignAsMember: NoteRowCapabilityInput = {
  isOwnNote: false,
  isScopedSharedSpace: true,
  viewerIsSpaceOwner: false,
};
const foreignAsSpaceOwner: NoteRowCapabilityInput = {
  isOwnNote: false,
  isScopedSharedSpace: true,
  viewerIsSpaceOwner: true,
};

describe('resolveNoteRowCapabilities', () => {
  it('gives a My Home note the full set', () => {
    expect(resolveNoteRowCapabilities(ownInHome)).toEqual({
      mayOrganize: true,
      mayPin: true,
      mayDelete: true,
      mayManageThread: true,
      // Nothing to remove from — this note is not being read inside a space.
      mayRemoveFromSpace: false,
      mayShareToSpace: true,
    });
  });

  it('swaps delete for remove-from-space on your own note inside a space', () => {
    const caps = resolveNoteRowCapabilities(ownInSpace);
    expect(caps.mayDelete).toBe(false);
    expect(caps.mayRemoveFromSpace).toBe(true);
    // Organizing your own note is allowed; pinning belongs to the space owner.
    expect(caps.mayOrganize).toBe(true);
    expect(caps.mayPin).toBe(false);
    // Sharing onward is never offered from inside a shared context.
    expect(caps.mayShareToSpace).toBe(false);
  });

  it("allows nothing on someone else's note when you are only a member", () => {
    expect(resolveNoteRowCapabilities(foreignAsMember)).toEqual({
      mayOrganize: false,
      mayPin: false,
      mayDelete: false,
      mayManageThread: false,
      mayRemoveFromSpace: false,
      mayShareToSpace: false,
    });
  });

  it('lets a space owner moderate a foreign note, but still not delete it', () => {
    const caps = resolveNoteRowCapabilities(foreignAsSpaceOwner);
    expect(caps.mayOrganize).toBe(true);
    expect(caps.mayPin).toBe(true);
    expect(caps.mayRemoveFromSpace).toBe(true);
    expect(caps.mayManageThread).toBe(true);
    // Delete is the author's alone — the server filters on Notes.userId regardless.
    expect(caps.mayDelete).toBe(false);
  });

  it('treats unknown ownership as your own, matching isConfirmedForeignNote', () => {
    expect(resolveNoteRowCapabilities({ isScopedSharedSpace: false, viewerIsSpaceOwner: false }).mayDelete).toBe(
      true,
    );
  });
});

describe('everyRowAllows', () => {
  it('withholds an action when a single note in the selection cannot take it', () => {
    // The whole point of all-or-nothing: one foreign note disables the batch rather than
    // the action half-applying and needing "3 of 5" reporting.
    expect(everyRowAllows([ownInSpace, ownInSpace], 'mayRemoveFromSpace')).toBe(true);
    expect(everyRowAllows([ownInSpace, foreignAsMember], 'mayRemoveFromSpace')).toBe(false);
    expect(everyRowAllows([ownInSpace, foreignAsMember], 'mayOrganize')).toBe(false);
  });

  it('lets ownership of the space, not of each note, decide a mixed selection', () => {
    // `viewerIsSpaceOwner` describes the viewer and the space, so it is the same on every
    // row of a given list — only `isOwnNote` varies within one selection.
    const asMember = [ownInSpace, foreignAsMember];
    const asOwner = [
      { ...ownInSpace, viewerIsSpaceOwner: true },
      { ...foreignAsMember, viewerIsSpaceOwner: true },
    ];
    expect(everyRowAllows(asMember, 'mayOrganize')).toBe(false);
    expect(everyRowAllows(asOwner, 'mayOrganize')).toBe(true);
    expect(everyRowAllows(asOwner, 'mayRemoveFromSpace')).toBe(true);
    // Still no bulk delete for an owner — delete belongs to each note's author.
    expect(everyRowAllows(asOwner, 'mayDelete')).toBe(false);
  });

  it('is false for an empty selection', () => {
    expect(everyRowAllows([], 'mayDelete')).toBe(false);
  });
});
