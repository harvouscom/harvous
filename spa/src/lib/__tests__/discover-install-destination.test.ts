/**
 * Which of the four kinds has somewhere to go after it is installed.
 *
 * The panel used to toast "Saved to your Harvous" for all four and offer no way to
 * reach any of them, so these assert the mapping rather than the wording.
 */
import { describe, expect, it } from 'vitest';
import { discoverInstallDestination } from '../discover-install-destination';

describe('discover install destination', () => {
  it('sends a note install to the note', () => {
    expect(discoverInstallDestination({ noteId: 'note_abc' })).toEqual({
      kind: 'note',
      noteId: 'note_abc',
    });
  });

  it('sends a pack install to its Thread, not to one of its notes', () => {
    // A pack reports both, and the Thread is the thing worth opening — landing on
    // note 1 of 12 would hide the collection the reader actually took.
    expect(
      discoverInstallDestination({
        threadId: 'thread_abc',
        noteIds: ['note_1', 'note_2', 'note_3'],
      }),
    ).toEqual({ kind: 'thread', threadId: 'thread_abc' });
  });

  it('sends a resource install to the shelf', () => {
    expect(discoverInstallDestination({ libraryItemId: 'lib_abc' })).toEqual({ kind: 'resources' });
  });

  it('gives a template nowhere to go, because it has no page', () => {
    // Not an oversight: an installed template is in the picker, which is where the
    // reader already was. The toast is the whole answer.
    expect(discoverInstallDestination({ templateId: 'ntpl_abc' })).toBe(null);
  });

  it('survives an empty or missing createdIds', () => {
    // The `alreadyInstalled` branch can only report the ref the install row
    // recorded, and an older row may carry none.
    expect(discoverInstallDestination({})).toBe(null);
    expect(discoverInstallDestination(null)).toBe(null);
    expect(discoverInstallDestination(undefined)).toBe(null);
    expect(discoverInstallDestination({ noteId: null, threadId: null })).toBe(null);
  });
});
