import { describe, expect, it } from 'vitest';
import { filenameSlug } from '../svg-to-png';

describe('filenameSlug', () => {
  it('turns a church name into a safe file name', () => {
    expect(filenameSlug('New Hope Assembly of God')).toBe('new-hope-assembly-of-god');
    expect(filenameSlug("St. Mary's — Downtown")).toBe('st-mary-s-downtown');
    expect(filenameSlug('Iglesia Bautista Emanuél')).toBe('iglesia-bautista-emanuel');
  });

  it('never returns an empty name', () => {
    expect(filenameSlug('  ')).toBe('church');
    expect(filenameSlug('✝')).toBe('church');
  });
});
