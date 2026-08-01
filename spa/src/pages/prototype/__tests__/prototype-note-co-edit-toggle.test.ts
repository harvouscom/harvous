import { describe, expect, it } from 'vitest';
import { coEditHelperTextForSpace } from '../PrototypeNoteCoEditToggle';

describe('coEditHelperTextForSpace', () => {
  it('describes read-only when off', () => {
    expect(coEditHelperTextForSpace(false, 'Family')).toBe(
      'Members of Family can read this note. Turn on to let them edit.',
    );
  });

  it('describes edit when on', () => {
    expect(coEditHelperTextForSpace(true, 'Family')).toBe(
      'Members of Family can edit, one person at a time.',
    );
  });
});
