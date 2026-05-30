import { describe, it, expect } from 'vitest';
import {
  formatNoteAddedByLabel,
  formatNoteAddedBySource,
  normalizeNoteAddedBy,
} from '../note-added-by-display';

describe('normalizeNoteAddedBy', () => {
  it('defaults missing or blank to user', () => {
    expect(normalizeNoteAddedBy(undefined)).toBe('user');
    expect(normalizeNoteAddedBy(null)).toBe('user');
    expect(normalizeNoteAddedBy('')).toBe('user');
    expect(normalizeNoteAddedBy('   ')).toBe('user');
  });

  it('preserves known source ids', () => {
    expect(normalizeNoteAddedBy('harvous')).toBe('harvous');
    expect(normalizeNoteAddedBy('system')).toBe('system');
    expect(normalizeNoteAddedBy('shared')).toBe('shared');
    expect(normalizeNoteAddedBy('mcp-bible-api')).toBe('mcp-bible-api');
  });
});

describe('formatNoteAddedByLabel', () => {
  it('labels Harvous automation distinctly', () => {
    expect(formatNoteAddedByLabel('harvous')).toBe('Added by Harvous');
  });

  it('labels all other sources as user-created', () => {
    expect(formatNoteAddedByLabel('user')).toBe('Added by you');
    expect(formatNoteAddedByLabel('system')).toBe('Added by you');
    expect(formatNoteAddedByLabel('shared')).toBe('Added by you');
    expect(formatNoteAddedByLabel('mcp-bible-api')).toBe('Added by you');
    expect(formatNoteAddedByLabel(undefined)).toBe('Added by you');
  });
});

describe('formatNoteAddedBySource', () => {
  it('returns source name only for labeled inspector rows', () => {
    expect(formatNoteAddedBySource('harvous')).toBe('Harvous');
    expect(formatNoteAddedBySource('user')).toBe('You');
    expect(formatNoteAddedBySource(undefined)).toBe('You');
  });
});
