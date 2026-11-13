/**
 * The Plus list may only claim Family once Family Accounts has launched: one switch
 * (FAMILY_LAUNCHED) opens the feature and adds the line, so the pitch can't run ahead.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHILD_NOTEBOOKS_ON_PLUS_LIST, FAMILY_LAUNCHED, FAMILY_MAX_MEMBERS } from '../billing-plans';
import { CHILD_NOTEBOOKS_PLUS_BULLET, FAMILY_PLUS_BULLET, SHARED_SPACES_ADDON_FEATURE_BULLETS } from '../shared-spaces-limits';

describe('family line on the Plus list', () => {
  it('counts the people Plus covers beyond the payer', () => {
    expect(FAMILY_PLUS_BULLET).toBe(`Family sharing with up to ${FAMILY_MAX_MEMBERS - 1} more people`);
  });

  it('is listed exactly when Family Accounts has launched', () => {
    expect((SHARED_SPACES_ADDON_FEATURE_BULLETS as readonly string[]).includes(FAMILY_PLUS_BULLET)).toBe(FAMILY_LAUNCHED);
  });

  it('names child notebooks exactly when that switch is on, right after the family line', () => {
    const bullets = SHARED_SPACES_ADDON_FEATURE_BULLETS as readonly string[];
    expect(bullets.includes(CHILD_NOTEBOOKS_PLUS_BULLET)).toBe(CHILD_NOTEBOOKS_ON_PLUS_LIST);
    if (CHILD_NOTEBOOKS_ON_PLUS_LIST) {
      expect(bullets.indexOf(CHILD_NOTEBOOKS_PLUS_BULLET)).toBe(bullets.indexOf(FAMILY_PLUS_BULLET) + 1);
    }
  });

  it('the server preview gate reads the same switch', () => {
    const gate = readFileSync(resolve(process.cwd(), 'server/utils/family-preview.ts'), 'utf8');
    expect(gate).toContain("import { FAMILY_LAUNCHED } from '@/lib/billing-plans';");
    expect(gate).not.toMatch(/export const FAMILY_LAUNCHED\s*=/);
  });
});
