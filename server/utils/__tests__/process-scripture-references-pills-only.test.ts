import { describe, expect, it } from 'vitest';
import { detectPersonTags } from '@/utils/person-tag-detector';
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

describe('plain-text extraction around scripture pills', () => {
  const pill = (ref: string) =>
    `<span class="scripture-pill" data-scripture-reference="${ref}">${ref}</span>`;
  /* These cases assert on what was *detected*, not on the pills written back,
     so the owning note only has to be a real id. */
  const noteId = 'note_parent_1';

  it('does not fuse a pill onto the word before it', () => {
    // Regression: the unwrap used `'$1'`, so "Ps Brian" + a Matthew pill became
    // "Ps BrianMatthew 6:19-21" — which is how the tag "Ps BrianMatthew" got written.
    const html = `<p>Ps Brian${pill('Matthew 6:19-21')}</p>`;
    const { references } = transformCanonicalScriptureContent({ noteId, content: html, pillsOnly: true });

    expect(references).toContain('Matthew 6:19-21');
    expect(references.some((r) => /Brian/i.test(r))).toBe(false);
  });

  it('leaves the pastor name intact for the person-tag detector', () => {
    // The detector reads the same plain text; before the fix it captured "BrianMatthew".
    const fused = 'Ps BrianMatthew 6:19-21';
    const separated = 'Ps Brian Matthew 6:19-21';
    expect(detectPersonTags(fused)).toContain('Ps BrianMatthew');
    expect(detectPersonTags(separated)).toContain('Ps Brian');
    expect(detectPersonTags(separated)).not.toContain('Ps BrianMatthew');
  });

  it('still finds a reference that already had a space before it', () => {
    const html = `<p>See ${pill('John 3:16')} today</p>`;
    const { references } = transformCanonicalScriptureContent({ noteId, content: html, pillsOnly: true });
    expect(references).toContain('John 3:16');
  });
});
