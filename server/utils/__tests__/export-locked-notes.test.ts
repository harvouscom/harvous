import { describe, it, expect } from 'vitest';
import { exportableNoteBody, LOCKED_NOTE_EXPORT_PLACEHOLDER } from '../export-user-data';

describe('exportableNoteBody', () => {
  it('writes a placeholder for a locked note instead of its ciphertext', () => {
    const body = exportableNoteBody({ content: 'q83vEjRWeJA='.repeat(8), contentEncrypted: true });
    expect(body).toContain(LOCKED_NOTE_EXPORT_PLACEHOLDER);
    expect(body).not.toContain('q83vEjRWeJA=');
  });

  it('passes a plain note through untouched', () => {
    expect(exportableNoteBody({ content: '<p>Psalm 23</p>', contentEncrypted: false })).toBe('<p>Psalm 23</p>');
    expect(exportableNoteBody({ content: null })).toBe('');
  });
});
