import { describe, expect, it } from 'vitest';
import { shouldInjectProcessedNoteContent } from '../prototype-editor-save';

describe('shouldInjectProcessedNoteContent', () => {
  it('allows injection when editor matches saved snapshot', () => {
    expect(shouldInjectProcessedNoteContent('<p>hi</p>', '<p>hi</p>')).toBe(true);
  });

  it('blocks injection when user typed during save', () => {
    expect(shouldInjectProcessedNoteContent('<p>hi there</p>', '<p>hi</p>')).toBe(false);
  });

  it('blocks injection when live html is unavailable', () => {
    expect(shouldInjectProcessedNoteContent(null, '<p>hi</p>')).toBe(false);
  });
});
