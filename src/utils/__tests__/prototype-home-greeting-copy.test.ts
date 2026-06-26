import { describe, expect, it } from 'vitest';
import { HOME_NEW_USER_GREETING_BODY } from '../prototype-home-greeting-copy';
import { HOME_INTRO_LIST_MODES } from '../../../spa/src/pages/prototype/proto-sidebar-list-modes';

describe('prototype-home-greeting-copy', () => {
  it('opens with a welcome line and avoids old empty-state phrasing', () => {
    expect(HOME_NEW_USER_GREETING_BODY.startsWith('Welcome to Harvous')).toBe(true);
    expect(HOME_NEW_USER_GREETING_BODY).not.toContain('Save a thought');
    expect(HOME_NEW_USER_GREETING_BODY).not.toContain('fills in');
  });
});

describe('HOME_INTRO_LIST_MODES', () => {
  it('lists notes, scripture, highlights, and threads for new-user nav chips', () => {
    expect(HOME_INTRO_LIST_MODES.map((m) => m.mode)).toEqual([
      'notes',
      'scripture',
      'highlights',
      'threads',
    ]);
  });
});
