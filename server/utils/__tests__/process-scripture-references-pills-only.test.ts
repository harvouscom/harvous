import { describe, expect, it } from 'vitest';
import {
  resolvePillNoteIdForProcessing,
  persistCanonicalScriptureContent,
  shouldPersistProcessedParentContent,
  transformCanonicalScriptureContent,
} from '../process-scripture-references';

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

  it('purely materializes canonical parent-note pills before persistence', () => {
    const content = '<p>Read John 3:16 today.</p>';
    const result = transformCanonicalScriptureContent({
      noteId: 'note_parent_1',
      content,
      translation: 'NET',
      pillsOnly: true,
    });
    expect(content).toBe('<p>Read John 3:16 today.</p>');
    expect(result.updatedContent).toContain('data-scripture-reference="John 3:16"');
    expect(result.updatedContent).toContain('data-note-id="note_parent_1"');
    expect(result.references).toEqual(['John 3:16']);
  });

  it('lets canonical callers disable processor writes after the version transaction', () => {
    expect(shouldPersistProcessedParentContent(true)).toBe(true);
    expect(shouldPersistProcessedParentContent(true, { persistParentContent: false })).toBe(false);
    expect(shouldPersistProcessedParentContent(false, { persistParentContent: true })).toBe(false);
  });

  it('routes compatibility persistence through one canonical transaction', () => {
    expect(persistCanonicalScriptureContent.toString()).toContain('db.transaction');
    expect(persistCanonicalScriptureContent.toString()).toContain(
      'updateCanonicalNoteInTransaction',
    );
  });
});
