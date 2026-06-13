import { describe, it, expect } from 'vitest';
import { draftTextToReference } from '@/components/react/TiptapScriptureDraft';

describe('draftTextToReference', () => {
  it('normalizes a complete reference', () => {
    expect(draftTextToReference('Exodus 5:1-2')).toBe('Exodus 5:1-2');
  });

  it('trims surrounding/trailing whitespace', () => {
    expect(draftTextToReference('  Exodus 5:1-2 ')).toBe('Exodus 5:1-2');
    expect(draftTextToReference('Exodus 5 ')).toBe('Exodus 5');
  });

  it('canonicalizes a clean verse range', () => {
    expect(draftTextToReference('Exodus 4:18-20')).toBe('Exodus 4:18-20');
  });

  it('keeps a chapter-only reference chapter-only (no auto-expand)', () => {
    expect(draftTextToReference('Exodus 5')).toBe('Exodus 5');
  });

  it('returns null for a book name only (not yet a reference)', () => {
    expect(draftTextToReference('Exodus')).toBeNull();
  });

  it('returns null for non-references / empty input', () => {
    expect(draftTextToReference('')).toBeNull();
    expect(draftTextToReference('   ')).toBeNull();
    expect(draftTextToReference('hello world')).toBeNull();
  });
});
