import { describe, expect, it } from 'vitest';
import { immutableSharedResponsePatchFields } from '../study-threads';

describe('shared response patch policy', () => {
  it('allows annotation body and accent updates', () => {
    expect(
      immutableSharedResponsePatchFields({
        contextSpaceId: 'space_shared',
        highlightAccentRaw: 'blue',
        notesBody: '<p>Updated response</p>',
        miniNoteBody: '<p>Updated note</p>',
      }),
    ).toEqual([]);
  });

  it('keeps durable anchor and shared context fields immutable', () => {
    expect(
      immutableSharedResponsePatchFields({
        anchorLocation: 4,
        anchorLength: 12,
        anchorTextSnapshot: 'historical text',
        noteVersionId: 'version_old',
        sourceSnippet: 'probe',
      }),
    ).toEqual([
      'anchorLocation',
      'anchorLength',
      'anchorTextSnapshot',
      'noteVersionId',
      'sourceSnippet',
    ]);
  });
});
