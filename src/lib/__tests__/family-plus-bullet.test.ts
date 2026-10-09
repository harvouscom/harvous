/**
 * The Plus list may only claim Family once Family Accounts has launched: one switch
 * (FAMILY_IN_PREVIEW) opens the feature and adds the line, so the pitch can't run ahead.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAMILY_IN_PREVIEW, FAMILY_MAX_MEMBERS } from '../billing-plans';
import { FAMILY_PLUS_BULLET, SHARED_SPACES_ADDON_FEATURE_BULLETS } from '../shared-spaces-limits';

describe('family line on the Plus list', () => {
  it('counts the people Plus covers beyond the payer', () => {
    expect(FAMILY_PLUS_BULLET).toBe(`Covers up to ${FAMILY_MAX_MEMBERS - 1} more people in your family`);
  });

  it('is listed exactly when Family Accounts has launched', () => {
    expect((SHARED_SPACES_ADDON_FEATURE_BULLETS as readonly string[]).includes(FAMILY_PLUS_BULLET)).toBe(!FAMILY_IN_PREVIEW);
  });

  it('the server preview gate reads the same switch', () => {
    const gate = readFileSync(resolve(process.cwd(), 'server/utils/family-preview.ts'), 'utf8');
    expect(gate).toContain("import { FAMILY_IN_PREVIEW } from '@/lib/billing-plans';");
    expect(gate).not.toMatch(/export const FAMILY_IN_PREVIEW\s*=/);
  });
});
