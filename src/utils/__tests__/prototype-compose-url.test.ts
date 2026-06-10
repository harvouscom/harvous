import { describe, expect, it } from 'vitest';
import {
  COMPOSE_URL_IDLE_MS,
  isPrototypeDraftPersistNoteIdSwap,
  resolvePrototypeToolbarNoteId,
} from '../prototype-compose-url';

describe('resolvePrototypeToolbarNoteId', () => {
  const normalize = (slug: string) => (slug.startsWith('note_') ? slug : `note_${slug}`);

  it('prefers composePersistedNoteId on draft route', () => {
    expect(resolvePrototypeToolbarNoteId('note_abc', 'new', true, normalize)).toBe('note_abc');
  });

  it('uses URL slug when not on draft route', () => {
    expect(resolvePrototypeToolbarNoteId(null, 'abc', false, normalize)).toBe('note_abc');
  });

  it('returns null on draft route before first persist', () => {
    expect(resolvePrototypeToolbarNoteId(null, 'new', true, normalize)).toBeNull();
  });
});

describe('isPrototypeDraftPersistNoteIdSwap', () => {
  it('detects note_draft → persisted id', () => {
    expect(isPrototypeDraftPersistNoteIdSwap('note_draft', 'note_abc')).toBe(true);
  });

  it('ignores other id changes', () => {
    expect(isPrototypeDraftPersistNoteIdSwap('note_a', 'note_b')).toBe(false);
    expect(isPrototypeDraftPersistNoteIdSwap('note_draft', 'note_draft')).toBe(false);
  });
});

describe('COMPOSE_URL_IDLE_MS', () => {
  it('uses a 2s idle window', () => {
    expect(COMPOSE_URL_IDLE_MS).toBe(2000);
  });
});
