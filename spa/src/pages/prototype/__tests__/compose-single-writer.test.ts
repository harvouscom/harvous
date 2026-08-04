import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Compose used to create a note and then immediately PUT it again to apply the
 * auto-assigned folder. That put two writers on a brand-new note: the follow-up bumped
 * the version while the editor's own autosave still held the pre-update one, so the next
 * save 409'd and surfaced as "this note changed somewhere else" — on a note nobody else
 * had touched.
 *
 * It only ever reproduced with a scripture reference in the note, because folder
 * auto-assign only produces a folder when one is detected:
 *
 *   "Creating a new note with Exodus 5:1-10" -> primary "The Exodus", secondaries [...]
 *   "Creating a new note with Ex"            -> primary null, secondaries []
 *
 * Personal folder placement now travels with the create. The shared path still patches
 * separately, but that writes SpaceNotes rather than the canonical note, so it cannot move
 * the version or race the autosave.
 */
const source = readFileSync(
  resolve(process.cwd(), 'spa/src/pages/prototype/PrototypeNotePage.tsx'),
  'utf8',
);

function draftPersistBlock(): string {
  const start = source.indexOf('draftPersistPromiseRef.current = (async () => {');
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, start + 4000);
}

describe('compose first-persist writes the note once', () => {
  it('passes personal folder placement to the create call', () => {
    expect(draftPersistBlock()).toContain(
      '...(!sharedContextSpaceId && collectionExtras ? collectionExtras : {})',
    );
  });

  it('does not follow the create with a canonical note update', () => {
    // The defect shape: a second mutateAsync on the note right after creating it.
    const block = draftPersistBlock();
    const createIdx = block.indexOf('createNoteMutationRef.current.mutateAsync');
    const updateIdx = block.indexOf('updateNoteMutationRef.current.mutateAsync');
    expect(createIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBe(-1);
  });

  it('still patches shared-space organization, which targets SpaceNotes', () => {
    const block = draftPersistBlock();
    expect(block).toContain('patchSharedOrganization(createdId, sharedContextSpaceId');
    expect(block).toContain('sharedContextSpaceId &&');
  });
});
