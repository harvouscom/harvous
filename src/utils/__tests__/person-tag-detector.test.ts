import { describe, expect, it } from 'vitest';
import { detectPersonTags } from './person-tag-detector';

describe('detectPersonTags', () => {
  it('detects Pastor and Ps prefixes with names', () => {
    expect(detectPersonTags('Notes from Pastor Tim today')).toEqual(['Pastor Tim']);
    expect(detectPersonTags('Ps Johnson led worship')).toEqual(['Ps Johnson']);
  });

  it('does not match Psalms chapter references', () => {
    expect(detectPersonTags('Psalm 23 is comfort')).toEqual([]);
    expect(detectPersonTags('Reading Psalms 119')).toEqual([]);
  });
});
