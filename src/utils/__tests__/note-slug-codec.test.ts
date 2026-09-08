import { describe, expect, it } from 'vitest';
import { decodeNoteSlug, encodeNoteSlug } from '../ids';

/**
 * Nothing covered this codec before a guest note had to travel through it, and a guest note is
 * exactly the shape it was not built for: an id that is not `note_<timestamp>`, carrying an
 * underscore, which base62 has no room for.
 */
describe('note slug codec', () => {
  it('shortens a real note id and reads it back', () => {
    const id = 'note_1788129105000';
    const slug = encodeNoteSlug(id);
    expect(slug).not.toContain('_');
    expect(decodeNoteSlug(slug)).toBe(id);
  });

  it('round-trips a guest note untouched', () => {
    const id = 'guest_note_mtgkops0wfx4pfkh';
    expect(encodeNoteSlug(id)).toBe(id);
    expect(decodeNoteSlug(id)).toBe(id);
  });

  it('does not turn a guest id into a note id', () => {
    // The bug this exists to stop: base62 could not read the id, so the passthrough branch
    // prefixed it — `note_guest_note_…`, which resolves to nothing and reads "Note not found".
    expect(decodeNoteSlug('guest_note_abc123')).not.toMatch(/^note_guest/);
  });

  it('still accepts a full id and a legacy raw-timestamp URL', () => {
    expect(decodeNoteSlug('note_1788129105000')).toBe('note_1788129105000');
    expect(decodeNoteSlug('1788129105000')).toBe('note_1788129105000');
  });
});
