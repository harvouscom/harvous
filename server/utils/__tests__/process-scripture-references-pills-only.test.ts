import { describe, expect, it } from 'vitest';
import { resolvePillNoteIdForProcessing } from '../process-scripture-references';

describe('resolvePillNoteIdForProcessing', () => {
  const parentId = 'note_parent_1';
  const childId = 'note_scripture_child';

  it('returns parent note id in pills-only mode', () => {
    expect(resolvePillNoteIdForProcessing(childId, parentId, true)).toBe(parentId);
    expect(resolvePillNoteIdForProcessing(parentId, parentId, true)).toBe(parentId);
  });

  it('returns pill note id in legacy child-note mode', () => {
    expect(resolvePillNoteIdForProcessing(childId, parentId, false)).toBe(childId);
  });

  it('returns null for pending or empty pill note ids', () => {
    expect(resolvePillNoteIdForProcessing('pending', parentId, true)).toBeNull();
    expect(resolvePillNoteIdForProcessing('null', parentId, false)).toBeNull();
    expect(resolvePillNoteIdForProcessing('', parentId, true)).toBeNull();
  });
});
