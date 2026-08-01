import { describe, expect, it } from 'vitest';
import { coEditHelperText } from '../PrototypeNoteCoEditToggle';

describe('coEditHelperText', () => {
  it('describes read-only when off', () => {
    expect(coEditHelperText(false, [{ spaceId: 'space_1', spaceTitle: 'Family' }])).toBe(
      'Members of Family can read this note.',
    );
  });

  it('describes single-space edit when on', () => {
    expect(coEditHelperText(true, [{ spaceId: 'space_1', spaceTitle: 'Family' }])).toBe(
      'Members of Family can edit this note, one person at a time.',
    );
  });

  it('names additional spaces when on', () => {
    expect(
      coEditHelperText(true, [
        { spaceId: 'space_1', spaceTitle: 'Family' },
        { spaceId: 'space_2', spaceTitle: 'Small group' },
      ]),
    ).toBe('Members of Family and 1 other space can edit this note, one person at a time.');
  });
});
